import { create } from 'zustand';
import vehiclesData from '../data/vehicles.json';
import { DEMO_TRIP_PRESETS } from '../data/demoTrips';
import { fetchOsrmRoute } from '../lib/geo/osrm';
import { discoverCorridorFuelStations } from '../lib/geo/overpass';
import { optimizeRefuelingSchedule } from '../lib/optimizer/fuelOptimizer';
import { computeStationPrices, parseStationOverridesCsv } from '../lib/pricing/pricingEngine';
import {
  gallonsToLiters,
  l100kmToMpg,
  litersToGallons,
  mpgToL100km,
  pricePerGalToLiter,
  pricePerLiterToGal,
  roundTo,
} from '../lib/units';
import type {
  FuelStation,
  OptimizationPolicy,
  OptimizationResult,
  PricingConfig,
  RawStationCandidate,
  RouteGeometry,
  UnitSystem,
  VehicleSpec,
  Waypoint,
} from '../types/trip';

export type SidebarTab = 'route' | 'pricing' | 'stations' | 'ledger';

interface TripState {
  // UI State
  activeTab: SidebarTab;
  unitSystem: UnitSystem;
  isReconstructing: boolean;
  reconstructStatus: string | null;
  reconstructError: string | null;
  selectedStationId: string | null;
  hoveredDistanceKm: number | null;
  isTelemetryExpanded: boolean;

  // Route & URL State
  activeDemoId: string | null;
  googleMapsUrlInput: string;
  waypoints: Waypoint[];
  routeGeometry: RouteGeometry;
  rawStations: RawStationCandidate[];

  // Vehicle & Telemetry State
  vehicles: VehicleSpec[];
  selectedVehicleId: string;
  isCustomVehicle: boolean;
  tankCapacityLiters: number;
  fuelEconomyL100km: number;
  initialFuelPercent: number;
  minStopReservePercent: number;
  targetArrivalReservePercent: number;

  // Constraints & Policy State
  maxDetourMinutes: number;
  maxDollarPerStop: number | null;
  detourCostWeightPerMinute: number;
  policy: OptimizationPolicy;

  // Hybrid Pricing State
  pricingConfig: PricingConfig;
  manualOverridesPerLiter: Record<string, number>;

  // Derived / Computed State
  pricedStations: FuelStation[];
  optimizationResult: OptimizationResult;

  // Actions
  setActiveTab: (tab: SidebarTab) => void;
  setUnitSystem: (unit: UnitSystem) => void;
  setSelectedStationId: (id: string | null) => void;
  setHoveredDistanceKm: (km: number | null) => void;
  setIsTelemetryExpanded: (expanded: boolean) => void;

  setGoogleMapsUrlInput: (url: string) => void;
  loadDemoTrip: (demoId: string) => void;
  reconstructFromGoogleMapsUrl: (url?: string) => Promise<void>;
  refreshLiveOverpassStations: () => Promise<void>;

  selectVehicle: (vehicleId: string) => void;
  setCustomTankCapacity: (value: number, unit: UnitSystem) => void;
  setCustomFuelEconomy: (value: number, unit: UnitSystem) => void;
  setInitialFuelPercent: (pct: number) => void;
  setMinStopReservePercent: (pct: number) => void;
  setTargetArrivalReservePercent: (pct: number) => void;

  setMaxDetourMinutes: (minutes: number) => void;
  setMaxDollarPerStop: (cap: number | null) => void;
  setDetourCostWeightPerMinute: (weight: number) => void;
  setPolicy: (policy: OptimizationPolicy) => void;

  updatePricingConfig: (patch: Partial<PricingConfig>) => void;
  setZonePrice: (zone: 'start' | 'mid' | 'end', value: number) => void;
  setStationPriceOverride: (stationId: string, priceInActiveUnit: number | null) => void;
  clearAllStationOverrides: () => void;
  importCsvOverrides: (csvText: string) => number;
}

const allVehicles = vehiclesData as VehicleSpec[];
const initialDemo = DEMO_TRIP_PRESETS[0]; // Toronto to Montreal Hwy 401
const initialVehicle =
  allVehicles.find((v) => v.id === initialDemo.defaultVehicleId) || allVehicles[0];

const initialPricingConfig: PricingConfig = {
  useZonePricing: true,
  baselinePricePerGal: 3.55,
  baselinePricePerLiter: 1.56,
  zonePricesPerGal: { start: 3.55, mid: 3.45, end: 3.75 },
  zonePricesPerLiter: { start: 1.55, mid: 1.51, end: 1.69 },
  enableBrandHeuristics: true,
  enableProximityMarkup: true,
  enableCanadianHeuristics: true,
  ...initialDemo.pricingOverrides,
};

function recomputeStationsAndOptimization(state: {
  rawStations: RawStationCandidate[];
  pricingConfig: PricingConfig;
  unitSystem: UnitSystem;
  manualOverridesPerLiter: Record<string, number>;
  routeGeometry: RouteGeometry;
  tankCapacityLiters: number;
  fuelEconomyL100km: number;
  initialFuelPercent: number;
  minStopReservePercent: number;
  targetArrivalReservePercent: number;
  maxDetourMinutes: number;
  maxDollarPerStop: number | null;
  detourCostWeightPerMinute: number;
  policy: OptimizationPolicy;
}): { pricedStations: FuelStation[]; optimizationResult: OptimizationResult } {
  const pricedStations = computeStationPrices(
    state.rawStations,
    state.pricingConfig,
    state.unitSystem,
    state.manualOverridesPerLiter
  );

  const optimizationResult = optimizeRefuelingSchedule({
    totalDistanceKm: state.routeGeometry.distanceKm,
    routeCoordinates: state.routeGeometry.coordinates,
    tankCapacityLiters: state.tankCapacityLiters,
    fuelEconomyL100km: state.fuelEconomyL100km,
    initialFuelPercent: state.initialFuelPercent,
    minStopReservePercent: state.minStopReservePercent,
    targetArrivalReservePercent: state.targetArrivalReservePercent,
    maxDetourMinutes: state.maxDetourMinutes,
    maxDollarPerStop: state.maxDollarPerStop,
    detourCostWeightPerMinute: state.detourCostWeightPerMinute,
    policy: state.policy,
    unitSystem: state.unitSystem,
    stations: pricedStations,
  });

  return { pricedStations, optimizationResult };
}

const initialComputed = recomputeStationsAndOptimization({
  rawStations: initialDemo.preloadedStations,
  pricingConfig: initialPricingConfig,
  unitSystem: initialDemo.defaultUnitSystem,
  manualOverridesPerLiter: {},
  routeGeometry: initialDemo.routeGeometry,
  tankCapacityLiters: initialVehicle.tankCapacityLiters,
  fuelEconomyL100km: initialVehicle.highwayL100km,
  initialFuelPercent: 35, // Start at 35% so multi-stop optimization is showcased immediately
  minStopReservePercent: 10,
  targetArrivalReservePercent: 25,
  maxDetourMinutes: 20,
  maxDollarPerStop: null,
  detourCostWeightPerMinute: 0.1,
  policy: 'mode_b_partial_lookahead',
});

export const useTripStore = create<TripState>((set, get) => ({
  activeTab: 'route',
  unitSystem: initialDemo.defaultUnitSystem,
  isReconstructing: false,
  reconstructStatus: null,
  reconstructError: null,
  selectedStationId: null,
  hoveredDistanceKm: null,
  isTelemetryExpanded: true,

  activeDemoId: initialDemo.id,
  googleMapsUrlInput: initialDemo.googleMapsUrl,
  waypoints: initialDemo.waypoints,
  routeGeometry: initialDemo.routeGeometry,
  rawStations: initialDemo.preloadedStations,

  vehicles: allVehicles,
  selectedVehicleId: initialVehicle.id,
  isCustomVehicle: false,
  tankCapacityLiters: initialVehicle.tankCapacityLiters,
  fuelEconomyL100km: initialVehicle.highwayL100km,
  initialFuelPercent: 35,
  minStopReservePercent: 10,
  targetArrivalReservePercent: 25,

  maxDetourMinutes: 20,
  maxDollarPerStop: null,
  detourCostWeightPerMinute: 0.1,
  policy: 'mode_b_partial_lookahead',

  pricingConfig: initialPricingConfig,
  manualOverridesPerLiter: {},

  pricedStations: initialComputed.pricedStations,
  optimizationResult: initialComputed.optimizationResult,

  setActiveTab: (activeTab) => set({ activeTab }),

  setUnitSystem: (unitSystem) =>
    set((state) => {
      // Convert maxDollarPerStop if set, and recalculate station prices & optimization
      const nextComputed = recomputeStationsAndOptimization({
        ...state,
        unitSystem,
      });
      return {
        unitSystem,
        ...nextComputed,
      };
    }),

  setSelectedStationId: (selectedStationId) => set({ selectedStationId }),
  setHoveredDistanceKm: (hoveredDistanceKm) => set({ hoveredDistanceKm }),
  setIsTelemetryExpanded: (isTelemetryExpanded) => set({ isTelemetryExpanded }),

  setGoogleMapsUrlInput: (googleMapsUrlInput) => set({ googleMapsUrlInput }),

  loadDemoTrip: (demoId) => {
    const preset = DEMO_TRIP_PRESETS.find((d) => d.id === demoId);
    if (!preset) return;
    const state = get();
    const vehicle =
      state.vehicles.find((v) => v.id === preset.defaultVehicleId) || state.vehicles[0];
    const nextPricing: PricingConfig = {
      ...state.pricingConfig,
      ...preset.pricingOverrides,
    };

    const nextState = {
      activeDemoId: preset.id,
      googleMapsUrlInput: preset.googleMapsUrl,
      waypoints: preset.waypoints,
      routeGeometry: preset.routeGeometry,
      rawStations: preset.preloadedStations,
      unitSystem: preset.defaultUnitSystem,
      selectedVehicleId: vehicle.id,
      isCustomVehicle: false,
      tankCapacityLiters: vehicle.tankCapacityLiters,
      fuelEconomyL100km: vehicle.highwayL100km,
      pricingConfig: nextPricing,
      manualOverridesPerLiter: {},
      selectedStationId: null,
      reconstructError: null,
      reconstructStatus: null,
      maxDetourMinutes: state.maxDetourMinutes,
      maxDollarPerStop: null,
      detourCostWeightPerMinute: state.detourCostWeightPerMinute,
      policy: state.policy,
      initialFuelPercent: 35,
      minStopReservePercent: state.minStopReservePercent,
      targetArrivalReservePercent: state.targetArrivalReservePercent,
    };

    const computed = recomputeStationsAndOptimization(nextState);
    set({
      ...nextState,
      ...computed,
    });
  },

  reconstructFromGoogleMapsUrl: async (overrideUrl) => {
    const state = get();
    const targetUrl = (overrideUrl ?? state.googleMapsUrlInput).trim();
    if (!targetUrl) {
      set({ reconstructError: 'Please paste a Google Maps Directions URL first.' });
      return;
    }

    // Check if the URL matches one of our preloaded demo URLs for fast hybrid resolution
    set({
      isReconstructing: true,
      reconstructError: null,
      reconstructStatus: 'Resolving Google Maps URL & extracting waypoints...',
    });

    try {
      const parseRes = await fetch('/api/parse-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const parsedJson = await parseRes.json();
      if (!parseRes.ok || parsedJson.error) {
        throw new Error(parsedJson.error || 'Failed to parse Google Maps URL.');
      }

      const waypoints: Waypoint[] = parsedJson.waypoints;
      set({
        reconstructStatus: `Computing OSRM driving route for ${waypoints.length} waypoints...`,
      });

      const routeGeometry = await fetchOsrmRoute(waypoints);

      set({
        reconstructStatus: `Querying OpenStreetMap Overpass for fuel stations along ${routeGeometry.distanceKm} km corridor...`,
      });

      // Check if we have matching demo fallback stations in case Overpass rate limits
      const matchedDemo = DEMO_TRIP_PRESETS.find(
        (d) =>
          Math.abs(d.waypoints[0].lat - waypoints[0].lat) < 0.15 &&
          Math.abs(
            d.waypoints[d.waypoints.length - 1].lat - waypoints[waypoints.length - 1].lat
          ) < 0.15
      );

      const rawStations = await discoverCorridorFuelStations(
        routeGeometry,
        state.maxDetourMinutes,
        matchedDemo?.preloadedStations
      );

      // Auto-detect if route is primarily Canadian
      const isMostlyCanadian =
        rawStations.filter((s) => s.isCanadian).length > rawStations.length / 2;
      const nextUnitSystem: UnitSystem = isMostlyCanadian ? 'metric' : state.unitSystem;

      const nextPricingConfig: PricingConfig = {
        ...state.pricingConfig,
        // Use flat regional baseline on short/urban routes (<120 km) so arbitrary start/mid/end zone shifts don't distort prices within the same metro area
        useZonePricing: routeGeometry.distanceKm >= 120 ? state.pricingConfig.useZonePricing : false,
        enableCanadianHeuristics: isMostlyCanadian,
      };

      // If the reconstructed route is short enough that starting fuel (e.g. 35%) minus trip burn
      // already exceeds targetArrivalReservePercent (e.g. 25%), bump targetArrivalReservePercent
      // so the optimizer actively selects the best/cheapest refueling stop along the corridor.
      const currentState = get();
      const tripBurnLiters = (routeGeometry.distanceKm / 100) * currentState.fuelEconomyL100km;
      const tripBurnPct = (tripBurnLiters / Math.max(1, currentState.tankCapacityLiters)) * 100;
      let nextTargetArrivalPct = currentState.targetArrivalReservePercent;
      if (currentState.initialFuelPercent - tripBurnPct >= nextTargetArrivalPct) {
        nextTargetArrivalPct = Math.min(85, Math.round(currentState.initialFuelPercent + 20));
      }

      const nextComputed = recomputeStationsAndOptimization({
        ...currentState,
        routeGeometry,
        rawStations,
        unitSystem: nextUnitSystem,
        pricingConfig: nextPricingConfig,
        targetArrivalReservePercent: nextTargetArrivalPct,
        manualOverridesPerLiter: {},
      });

      set({
        isReconstructing: false,
        reconstructStatus: null,
        reconstructError: null,
        activeDemoId: matchedDemo?.id ?? null,
        waypoints,
        routeGeometry,
        rawStations,
        unitSystem: nextUnitSystem,
        pricingConfig: nextPricingConfig,
        targetArrivalReservePercent: nextTargetArrivalPct,
        manualOverridesPerLiter: {},
        selectedStationId: null,
        ...nextComputed,
      });
    } catch (err) {
      set({
        isReconstructing: false,
        reconstructStatus: null,
        reconstructError:
          err instanceof Error ? err.message : 'Route reconstruction failed. Check URL format.',
      });
    }
  },

  refreshLiveOverpassStations: async () => {
    const state = get();
    set({
      isReconstructing: true,
      reconstructError: null,
      reconstructStatus: 'Querying live OpenStreetMap Overpass corridor nodes...',
    });
    try {
      const matchedDemo = DEMO_TRIP_PRESETS.find((d) => d.id === state.activeDemoId);
      const rawStations = await discoverCorridorFuelStations(
        state.routeGeometry,
        state.maxDetourMinutes,
        matchedDemo?.preloadedStations
      );
      const computed = recomputeStationsAndOptimization({
        ...get(),
        rawStations,
      });
      set({
        isReconstructing: false,
        reconstructStatus: null,
        rawStations,
        ...computed,
      });
    } catch (err) {
      set({
        isReconstructing: false,
        reconstructStatus: null,
        reconstructError:
          err instanceof Error ? err.message : 'Failed to refresh Overpass corridor stations.',
      });
    }
  },

  selectVehicle: (vehicleId) =>
    set((state) => {
      const spec = state.vehicles.find((v) => v.id === vehicleId);
      if (!spec) return state;
      const nextState = {
        ...state,
        selectedVehicleId: spec.id,
        isCustomVehicle: false,
        tankCapacityLiters: spec.tankCapacityLiters,
        fuelEconomyL100km: spec.highwayL100km,
      };
      return {
        selectedVehicleId: spec.id,
        isCustomVehicle: false,
        tankCapacityLiters: spec.tankCapacityLiters,
        fuelEconomyL100km: spec.highwayL100km,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setCustomTankCapacity: (value, unit) =>
    set((state) => {
      const clamped = Math.max(15, Math.min(200, unit === 'metric' ? value : gallonsToLiters(value)));
      const nextState = {
        ...state,
        isCustomVehicle: true,
        tankCapacityLiters: roundTo(clamped, 1),
      };
      return {
        isCustomVehicle: true,
        tankCapacityLiters: nextState.tankCapacityLiters,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setCustomFuelEconomy: (value, unit) =>
    set((state) => {
      const l100km = unit === 'metric' ? value : mpgToL100km(value);
      const clamped = Math.max(2.5, Math.min(30, l100km));
      const nextState = {
        ...state,
        isCustomVehicle: true,
        fuelEconomyL100km: roundTo(clamped, 2),
      };
      return {
        isCustomVehicle: true,
        fuelEconomyL100km: nextState.fuelEconomyL100km,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setInitialFuelPercent: (initialFuelPercent) =>
    set((state) => {
      const nextState = { ...state, initialFuelPercent };
      return {
        initialFuelPercent,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setMinStopReservePercent: (minStopReservePercent) =>
    set((state) => {
      const nextState = { ...state, minStopReservePercent };
      return {
        minStopReservePercent,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setTargetArrivalReservePercent: (targetArrivalReservePercent) =>
    set((state) => {
      const nextState = { ...state, targetArrivalReservePercent };
      return {
        targetArrivalReservePercent,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setMaxDetourMinutes: (maxDetourMinutes) =>
    set((state) => {
      const nextState = { ...state, maxDetourMinutes };
      return {
        maxDetourMinutes,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setMaxDollarPerStop: (maxDollarPerStop) =>
    set((state) => {
      const nextState = { ...state, maxDollarPerStop };
      return {
        maxDollarPerStop,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setDetourCostWeightPerMinute: (detourCostWeightPerMinute) =>
    set((state) => {
      const nextState = { ...state, detourCostWeightPerMinute };
      return {
        detourCostWeightPerMinute,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setPolicy: (policy) =>
    set((state) => {
      const nextState = { ...state, policy };
      return {
        policy,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  updatePricingConfig: (patch) =>
    set((state) => {
      const pricingConfig: PricingConfig = {
        ...state.pricingConfig,
        ...patch,
      };
      if (typeof patch.baselinePricePerGal === 'number') {
        pricingConfig.baselinePricePerLiter = roundTo(
          pricePerGalToLiter(patch.baselinePricePerGal),
          3
        );
      } else if (typeof patch.baselinePricePerLiter === 'number') {
        pricingConfig.baselinePricePerGal = roundTo(
          pricePerLiterToGal(patch.baselinePricePerLiter),
          2
        );
      }
      const nextState = { ...state, pricingConfig };
      return {
        pricingConfig,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setZonePrice: (zone, value) =>
    set((state) => {
      const pricingConfig = { ...state.pricingConfig };
      if (state.unitSystem === 'metric') {
        pricingConfig.zonePricesPerLiter = {
          ...pricingConfig.zonePricesPerLiter,
          [zone]: value,
        };
        pricingConfig.zonePricesPerGal = {
          ...pricingConfig.zonePricesPerGal,
          [zone]: roundTo(pricePerLiterToGal(value), 2),
        };
      } else {
        pricingConfig.zonePricesPerGal = {
          ...pricingConfig.zonePricesPerGal,
          [zone]: value,
        };
        pricingConfig.zonePricesPerLiter = {
          ...pricingConfig.zonePricesPerLiter,
          [zone]: roundTo(pricePerGalToLiter(value), 3),
        };
      }
      const nextState = { ...state, pricingConfig };
      return {
        pricingConfig,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  setStationPriceOverride: (stationId, priceInActiveUnit) =>
    set((state) => {
      const manualOverridesPerLiter = { ...state.manualOverridesPerLiter };
      if (priceInActiveUnit === null || Number.isNaN(priceInActiveUnit) || priceInActiveUnit <= 0) {
        delete manualOverridesPerLiter[stationId];
      } else {
        manualOverridesPerLiter[stationId] =
          state.unitSystem === 'metric'
            ? priceInActiveUnit
            : roundTo(pricePerGalToLiter(priceInActiveUnit), 4);
      }
      const nextState = { ...state, manualOverridesPerLiter };
      return {
        manualOverridesPerLiter,
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  clearAllStationOverrides: () =>
    set((state) => {
      const nextState = { ...state, manualOverridesPerLiter: {} };
      return {
        manualOverridesPerLiter: {},
        ...recomputeStationsAndOptimization(nextState),
      };
    }),

  importCsvOverrides: (csvText) => {
    const state = get();
    const { overridesPerLiter, matchedCount } = parseStationOverridesCsv(
      csvText,
      state.pricedStations,
      state.unitSystem
    );
    if (matchedCount > 0) {
      const manualOverridesPerLiter = {
        ...state.manualOverridesPerLiter,
        ...overridesPerLiter,
      };
      const nextState = { ...state, manualOverridesPerLiter };
      set({
        manualOverridesPerLiter,
        ...recomputeStationsAndOptimization(nextState),
      });
    }
    return matchedCount;
  },
}));

// Helper selectors for formatted values in active unit system
export function getFormattedEfficiency(l100km: number, unit: UnitSystem): number {
  return unit === 'metric' ? roundTo(l100km, 1) : roundTo(l100kmToMpg(l100km), 1);
}

export function getFormattedTankCapacity(liters: number, unit: UnitSystem): number {
  return unit === 'metric' ? roundTo(liters, 1) : roundTo(litersToGallons(liters), 1);
}
