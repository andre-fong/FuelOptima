export type UnitSystem = 'imperial' | 'metric';

export type FuelType = 'Gasoline' | 'Hybrid';

export type VehicleClass =
  | 'Subcompact'
  | 'Compact'
  | 'Midsize Sedan'
  | 'Large Sedan'
  | 'Compact SUV'
  | 'Midsize SUV'
  | 'Standard SUV'
  | 'Pickup'
  | 'Minivan';

export interface VehicleSpec {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  fuelType: FuelType;
  vehicleClass: VehicleClass;
  highwayMpg: number;
  cityMpg: number;
  highwayL100km: number;
  cityL100km: number;
  tankCapacityGal: number;
  tankCapacityLiters: number;
  source: 'FuelEconomy.gov' | 'NRCan' | 'Custom';
}

export interface Waypoint {
  lat: number;
  lng: number;
  label: string;
  source: 'coordinates' | 'geocoded' | 'demo';
}

export interface ParsedRouteResponse {
  originalUrl: string;
  canonicalUrl: string;
  waypoints: Waypoint[];
  extractionStage: 'stage_a_coordinates' | 'stage_b_addresses' | 'hybrid';
  warnings?: string[];
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lng, lat]
  distanceMeters: number;
  distanceKm: number;
  distanceMiles: number;
  durationSeconds: number;
  durationMinutes: number;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  originLabel: string;
  destinationLabel: string;
  waypointLabels: string[];
}

export type BrandTier = 'discount' | 'premium' | 'standard' | 'highway_plaza';

export type RouteRegionZone = 'start' | 'mid' | 'end';

export interface RawStationCandidate {
  id: string;
  name: string;
  brand: string;
  operator: string;
  lat: number;
  lng: number;
  distanceAlongRouteKm: number;
  distanceAlongRouteMiles: number;
  snapPoint: [number, number]; // [lng, lat] on route
  straightLineDistKm: number;
  detourDistanceKm: number;
  detourDistanceMiles: number;
  detourTimeMinutes: number;
  regionZone: RouteRegionZone;
  isCanadian: boolean;
  tags: Record<string, string>;
}

export interface FuelStation extends RawStationCandidate {
  brandTier: BrandTier;
  basePricePerLiter: number;
  basePricePerGal: number;
  brandModifierPerLiter: number;
  brandModifierPerGal: number;
  proximityMarkupPerLiter: number;
  proximityMarkupPerGal: number;
  manualOverridePricePerLiter: number | null;
  manualOverridePricePerGal: number | null;
  effectivePricePerLiter: number;
  effectivePricePerGal: number;
}

export interface PricingConfig {
  useZonePricing: boolean;
  baselinePricePerGal: number; // Imperial ($/gal)
  baselinePricePerLiter: number; // Metric ($/L)
  zonePricesPerGal: {
    start: number;
    mid: number;
    end: number;
  };
  zonePricesPerLiter: {
    start: number;
    mid: number;
    end: number;
  };
  enableBrandHeuristics: boolean;
  enableProximityMarkup: boolean;
  enableCanadianHeuristics: boolean;
}

export type OptimizationPolicy = 'mode_a_fill_or_cap' | 'mode_b_partial_lookahead';

export interface OptimizationInput {
  totalDistanceKm: number;
  routeCoordinates: [number, number][];
  tankCapacityLiters: number;
  fuelEconomyL100km: number;
  initialFuelPercent: number; // 0 to 100
  minStopReservePercent: number; // 0 to 50
  targetArrivalReservePercent: number; // 0 to 90
  maxDetourMinutes: number;
  maxDollarPerStop: number | null; // In active currency
  detourCostWeightPerMinute: number; // e.g., $0.25/min time valuation or 0
  policy: OptimizationPolicy;
  unitSystem: UnitSystem;
  stations: FuelStation[];
}

export interface OptimalStop {
  stopNumber: number;
  station: FuelStation;
  arrivalFuelLiters: number;
  arrivalFuelGal: number;
  arrivalFuelPercent: number;
  fuelPurchasedLiters: number;
  fuelPurchasedGal: number;
  departureFuelLiters: number;
  departureFuelGal: number;
  departureFuelPercent: number;
  pricePerLiter: number;
  pricePerGal: number;
  stepCost: number;
  detourMinutes: number;
  detourFuelBurnedLiters: number;
  detourFuelBurnedGal: number;
  legDistanceFromPrevKm: number;
  legDistanceFromPrevMiles: number;
  policyReason:
    | 'cheaper_station_ahead'
    | 'fill_to_capacity'
    | 'capped_by_max_dollar'
    | 'exact_for_destination';
  policyExplanation: string;
}

export interface TelemetryPoint {
  distanceKm: number;
  distanceMiles: number;
  fuelRemainingLiters: number;
  fuelRemainingGal: number;
  fuelRemainingPercent: number;
  minReserveLiters: number;
  minReserveGal: number;
  lat: number;
  lng: number;
  event?: 'departure' | 'arrival_at_stop' | 'refuel_complete' | 'destination' | 'dead_zone';
  stopNumber?: number;
  stationName?: string;
  stationPriceDisplay?: string;
  fuelAddedLiters?: number;
  fuelAddedGal?: number;
}

export interface UnreachableSegmentError {
  code: 'DEAD_ZONE_EXCEEDS_RANGE' | 'INSUFFICIENT_INITIAL_FUEL' | 'UNREACHABLE_ARRIVAL_RESERVE';
  title: string;
  message: string;
  fromLabel: string;
  toLabel: string;
  fromDistanceKm: number;
  toDistanceKm: number;
  fromDistanceMiles: number;
  toDistanceMiles: number;
  gapDistanceKm: number;
  gapDistanceMiles: number;
  maxReachableKm: number;
  maxReachableMiles: number;
  deadZoneCoordinates: [number, number][];
}

export interface OptimizationResult {
  feasible: boolean;
  error: UnreachableSegmentError | null;
  stops: OptimalStop[];
  totalCost: number;
  totalFuelPurchasedLiters: number;
  totalFuelPurchasedGal: number;
  totalFuelBurnedLiters: number;
  totalFuelBurnedGal: number;
  totalDetourMinutes: number;
  naiveTotalCost: number;
  savingsVsNaive: number;
  savingsPercent: number;
  departureFuelLiters: number;
  departureFuelGal: number;
  arrivalFuelLiters: number;
  arrivalFuelGal: number;
  arrivalFuelPercent: number;
  telemetry: TelemetryPoint[];
  executionTimeMs: number;
}

export interface DemoTripPreset {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  country: 'CA' | 'US' | 'CROSS_BORDER';
  defaultUnitSystem: UnitSystem;
  googleMapsUrl: string;
  waypoints: Waypoint[];
  defaultVehicleId: string;
  pricingOverrides: Partial<PricingConfig>;
  routeGeometry: RouteGeometry;
  preloadedStations: RawStationCandidate[];
}
