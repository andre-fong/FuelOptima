import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Compass,
  DollarSign,
  Fuel,
  Gauge,
  MapPin,
  Navigation,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Upload,
} from 'lucide-react';
import { DEMO_TRIP_PRESETS } from '../data/demoTrips';
import { computeMaxStraightLineRadiusKm } from '../lib/geo/overpass';
import {
  computeDistanceFromFuelKm,
  kmToMiles,
  l100kmToMpg,
  litersToGallons,
  roundTo,
} from '../lib/units';
import {
  getFormattedEfficiency,
  getFormattedTankCapacity,
  useTripStore,
} from '../store/useTripStore';

export const LeftSidebar: React.FC = () => {
  const activeTab = useTripStore((s) => s.activeTab);
  const setActiveTab = useTripStore((s) => s.setActiveTab);
  const unitSystem = useTripStore((s) => s.unitSystem);
  const setUnitSystem = useTripStore((s) => s.setUnitSystem);

  const activeDemoId = useTripStore((s) => s.activeDemoId);
  const loadDemoTrip = useTripStore((s) => s.loadDemoTrip);
  const googleMapsUrlInput = useTripStore((s) => s.googleMapsUrlInput);
  const setGoogleMapsUrlInput = useTripStore((s) => s.setGoogleMapsUrlInput);
  const reconstructFromGoogleMapsUrl = useTripStore((s) => s.reconstructFromGoogleMapsUrl);
  const refreshLiveOverpassStations = useTripStore((s) => s.refreshLiveOverpassStations);
  const isReconstructing = useTripStore((s) => s.isReconstructing);
  const reconstructStatus = useTripStore((s) => s.reconstructStatus);
  const reconstructError = useTripStore((s) => s.reconstructError);

  const routeGeometry = useTripStore((s) => s.routeGeometry);
  const waypoints = useTripStore((s) => s.waypoints);

  const vehicles = useTripStore((s) => s.vehicles);
  const selectedVehicleId = useTripStore((s) => s.selectedVehicleId);
  const isCustomVehicle = useTripStore((s) => s.isCustomVehicle);
  const selectVehicle = useTripStore((s) => s.selectVehicle);
  const tankCapacityLiters = useTripStore((s) => s.tankCapacityLiters);
  const fuelEconomyL100km = useTripStore((s) => s.fuelEconomyL100km);
  const setCustomTankCapacity = useTripStore((s) => s.setCustomTankCapacity);
  const setCustomFuelEconomy = useTripStore((s) => s.setCustomFuelEconomy);

  const initialFuelPercent = useTripStore((s) => s.initialFuelPercent);
  const setInitialFuelPercent = useTripStore((s) => s.setInitialFuelPercent);
  const minStopReservePercent = useTripStore((s) => s.minStopReservePercent);
  const setMinStopReservePercent = useTripStore((s) => s.setMinStopReservePercent);
  const targetArrivalReservePercent = useTripStore((s) => s.targetArrivalReservePercent);
  const setTargetArrivalReservePercent = useTripStore((s) => s.setTargetArrivalReservePercent);

  const maxDetourMinutes = useTripStore((s) => s.maxDetourMinutes);
  const setMaxDetourMinutes = useTripStore((s) => s.setMaxDetourMinutes);
  const maxDollarPerStop = useTripStore((s) => s.maxDollarPerStop);
  const setMaxDollarPerStop = useTripStore((s) => s.setMaxDollarPerStop);
  const policy = useTripStore((s) => s.policy);
  const setPolicy = useTripStore((s) => s.setPolicy);

  const pricingConfig = useTripStore((s) => s.pricingConfig);
  const updatePricingConfig = useTripStore((s) => s.updatePricingConfig);
  const setZonePrice = useTripStore((s) => s.setZonePrice);
  const manualOverridesPerLiter = useTripStore((s) => s.manualOverridesPerLiter);
  const setStationPriceOverride = useTripStore((s) => s.setStationPriceOverride);
  const clearAllStationOverrides = useTripStore((s) => s.clearAllStationOverrides);
  const importCsvOverrides = useTripStore((s) => s.importCsvOverrides);

  const pricedStations = useTripStore((s) => s.pricedStations);
  const optimizationResult = useTripStore((s) => s.optimizationResult);
  const selectedStationId = useTripStore((s) => s.selectedStationId);
  const setSelectedStationId = useTripStore((s) => s.setSelectedStationId);

  // Cascading vehicle selector state derived from selectedVehicle
  const currentVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0],
    [vehicles, selectedVehicleId]
  );

  const [filterYear, setFilterYear] = useState<number>(currentVehicle.year);
  const [filterMake, setFilterMake] = useState<string>(currentVehicle.make);
  const [filterModel, setFilterModel] = useState<string>(currentVehicle.model);
  const [stationSearch, setStationSearch] = useState<string>('');
  const [csvDrawerOpen, setCsvDrawerOpen] = useState<boolean>(false);
  const [csvInputText, setCsvInputText] = useState<string>('');
  const [csvImportStatus, setCsvImportStatus] = useState<string | null>(null);

  // Sync cascading dropdowns when preset changes
  React.useEffect(() => {
    setFilterYear(currentVehicle.year);
    setFilterMake(currentVehicle.make);
    setFilterModel(currentVehicle.model);
  }, [currentVehicle]);

  const availableYears = useMemo(() => {
    const yrs = Array.from(new Set(vehicles.map((v) => v.year))).sort((a, b) => b - a);
    return yrs;
  }, [vehicles]);

  const availableMakes = useMemo(() => {
    const mks = Array.from(
      new Set(vehicles.filter((v) => v.year === filterYear).map((v) => v.make))
    ).sort();
    return mks;
  }, [vehicles, filterYear]);

  const availableModels = useMemo(() => {
    const mdls = Array.from(
      new Set(
        vehicles
          .filter((v) => v.year === filterYear && v.make === filterMake)
          .map((v) => v.model)
      )
    ).sort();
    return mdls;
  }, [vehicles, filterYear, filterMake]);

  const availableTrims = useMemo(() => {
    return vehicles.filter(
      (v) => v.year === filterYear && v.make === filterMake && v.model === filterModel
    );
  }, [vehicles, filterYear, filterMake, filterModel]);

  const handleYearChange = (yr: number) => {
    setFilterYear(yr);
    const matching = vehicles.filter((v) => v.year === yr);
    if (matching.length > 0) {
      setFilterMake(matching[0].make);
      setFilterModel(matching[0].model);
      selectVehicle(matching[0].id);
    }
  };

  const handleMakeChange = (mk: string) => {
    setFilterMake(mk);
    const matching = vehicles.filter((v) => v.year === filterYear && v.make === mk);
    if (matching.length > 0) {
      setFilterModel(matching[0].model);
      selectVehicle(matching[0].id);
    }
  };

  const handleModelChange = (mdl: string) => {
    setFilterModel(mdl);
    const matching = vehicles.filter(
      (v) => v.year === filterYear && v.make === filterMake && v.model === mdl
    );
    if (matching.length > 0) {
      selectVehicle(matching[0].id);
    }
  };

  // Unit display helpers
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi';
  const volUnit = unitSystem === 'metric' ? 'L' : 'gal';
  const effUnit = unitSystem === 'metric' ? 'L/100km' : 'MPG';
  const priceUnit = unitSystem === 'metric' ? '$/L' : '$/gal';

  const displayEfficiency = getFormattedEfficiency(fuelEconomyL100km, unitSystem);
  const displayTankCap = getFormattedTankCapacity(tankCapacityLiters, unitSystem);
  const maxFullRangeKm = computeDistanceFromFuelKm(
    tankCapacityLiters * (1 - minStopReservePercent / 100),
    fuelEconomyL100km
  );
  const displayMaxRange =
    unitSystem === 'metric' ? roundTo(maxFullRangeKm, 0) : roundTo(kmToMiles(maxFullRangeKm), 0);

  const initialFuelVolume = roundTo((initialFuelPercent / 100) * displayTankCap, 1);
  const minStopVolume = roundTo((minStopReservePercent / 100) * displayTankCap, 1);
  const targetArrivalVolume = roundTo((targetArrivalReservePercent / 100) * displayTankCap, 1);

  const filteredStations = useMemo(() => {
    const q = stationSearch.trim().toLowerCase();
    if (!q) return pricedStations;
    return pricedStations.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.brand.toLowerCase().includes(q) ||
        s.regionZone.toLowerCase().includes(q)
    );
  }, [pricedStations, stationSearch]);

  const optimalStopIds = useMemo(
    () => new Set(optimizationResult.stops.map((s) => s.station.id)),
    [optimizationResult.stops]
  );

  const overrideCount = Object.keys(manualOverridesPerLiter).length;

  return (
    <aside className="w-full lg:w-[425px] h-full bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 select-none overflow-hidden">
      {/* Persistent Unit Toggle & Demo Trip Selector Bar */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">Telemetry Units</span>
          <div
            role="group"
            aria-label="Unit system toggle"
            className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800"
          >
            <button
              type="button"
              onClick={() => setUnitSystem('metric')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                unitSystem === 'metric'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Metric (km · L · $/L)
            </button>
            <button
              type="button"
              onClick={() => setUnitSystem('imperial')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                unitSystem === 'imperial'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Imperial (mi · gal · $/gal)
            </button>
          </div>
        </div>

        {/* Instant Demo Trip Presets */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-400">Load Demo Corridor</span>
            <span className="text-xs text-slate-500 font-mono">1-Click Pipeline</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {DEMO_TRIP_PRESETS.map((preset) => {
              const isSelected = activeDemoId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadDemoTrip(preset.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-left border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/70 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold truncate">
                    {preset.id === 'ca-hwy401-tor-mtl'
                      ? 'Toronto → Mtl'
                      : preset.id === 'us-i15-la-vegas'
                      ? 'LA → Vegas'
                      : 'Toronto → NYC'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {preset.country === 'CA'
                      ? 'Hwy 401 (CA)'
                      : preset.country === 'US'
                      ? 'I-15 Mojave'
                      : 'I-90 / I-81'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
        {/* Dead Zone Unreachable Error Alert (if infeasible) */}
        {!optimizationResult.feasible && optimizationResult.error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-500/60 text-rose-200 space-y-1.5"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{optimizationResult.error.title}</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              {optimizationResult.error.message}
            </p>
            <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-rose-300">
              <span>
                Segment: {optimizationResult.error.fromLabel} → {optimizationResult.error.toLabel}
              </span>
              <span>
                Gap:{' '}
                {unitSystem === 'metric'
                  ? `${optimizationResult.error.gapDistanceKm} km`
                  : `${optimizationResult.error.gapDistanceMiles} mi`}
              </span>
            </div>
          </div>
        )}

        {/* TAB 1: ROUTE & VEHICLE */}
        {activeTab === 'route' && (
          <div className="space-y-5">
            {/* Section 1: Google Maps URL Parser */}
            <section className="space-y-3 pb-5 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <span>01. Google Maps Route Reconstructor</span>
                </h2>
                <span className="text-xs text-slate-400 font-mono">OSRM + Nominatim</span>
              </div>

              <div className="space-y-2">
                <label htmlFor="gmaps-url-input" className="block text-xs text-slate-400">
                  Paste Google Maps Directions Link (Full or Shortened `goo.gl`)
                </label>
                <div className="flex gap-2">
                  <input
                    id="gmaps-url-input"
                    type="url"
                    value={googleMapsUrlInput}
                    onChange={(e) => setGoogleMapsUrlInput(e.target.value)}
                    placeholder="https://www.google.com/maps/dir/Origin/Destination..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    disabled={isReconstructing}
                    onClick={() => reconstructFromGoogleMapsUrl()}
                    className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isReconstructing ? 'Parsing...' : 'Reconstruct'}
                  </button>
                </div>

                {reconstructStatus && (
                  <p className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{reconstructStatus}</span>
                  </p>
                )}

                {reconstructError && (
                  <p className="text-xs text-rose-400 font-mono">{reconstructError}</p>
                )}
              </div>

              {/* Extracted Corridor Summary */}
              <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/90 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Origin</span>
                  <span className="text-slate-200 font-medium truncate max-w-[230px]">
                    {routeGeometry.originLabel}
                  </span>
                </div>
                {waypoints.length > 2 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Via Waypoints</span>
                    <span className="text-slate-300 truncate max-w-[230px]">
                      {waypoints
                        .slice(1, -1)
                        .map((w) => w.label)
                        .join(' → ')}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Destination</span>
                  <span className="text-slate-200 font-medium truncate max-w-[230px]">
                    {routeGeometry.destinationLabel}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center font-mono">
                  <div>
                    <div className="text-[11px] text-slate-500">Total Distance</div>
                    <div className="text-xs font-semibold text-slate-100 tabular-nums">
                      {unitSystem === 'metric'
                        ? `${routeGeometry.distanceKm} km`
                        : `${routeGeometry.distanceMiles} mi`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Est. Drive</div>
                    <div className="text-xs font-semibold text-slate-100 tabular-nums">
                      {Math.floor(routeGeometry.durationMinutes / 60)}h{' '}
                      {routeGeometry.durationMinutes % 60}m
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">OSM Stations</div>
                    <div className="text-xs font-semibold text-emerald-400 tabular-nums">
                      {pricedStations.length} nodes
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Vehicle Telemetry & Fuel Economy Selector */}
            <section className="space-y-3 pb-5 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Car className="w-4 h-4 text-emerald-400" />
                  <span>02. Vehicle Telemetry & Specs</span>
                </h2>
                <span className="text-xs text-slate-400 font-mono">
                  {isCustomVehicle ? 'Custom Override' : currentVehicle.source}
                </span>
              </div>

              {/* Cascading Year -> Make -> Model -> Trim */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="veh-year" className="block text-[11px] text-slate-400 mb-1">
                    Year
                  </label>
                  <select
                    id="veh-year"
                    value={filterYear}
                    onChange={(e) => handleYearChange(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="veh-make" className="block text-[11px] text-slate-400 mb-1">
                    Make
                  </label>
                  <select
                    id="veh-make"
                    value={filterMake}
                    onChange={(e) => handleMakeChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    {availableMakes.map((mk) => (
                      <option key={mk} value={mk}>
                        {mk}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="veh-model" className="block text-[11px] text-slate-400 mb-1">
                    Model
                  </label>
                  <select
                    id="veh-model"
                    value={filterModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    {availableModels.map((mdl) => (
                      <option key={mdl} value={mdl}>
                        {mdl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="veh-trim" className="block text-[11px] text-slate-400 mb-1">
                  Trim & Powertrain (Gasoline / Hybrid)
                </label>
                <select
                  id="veh-trim"
                  value={selectedVehicleId}
                  onChange={(e) => selectVehicle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {availableTrims.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.trim} ({t.fuelType} · {t.vehicleClass})
                    </option>
                  ))}
                </select>
              </div>

              {/* Editable Highway Efficiency & Tank Capacity Overrides */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <label
                    htmlFor="hwy-efficiency-input"
                    className="block text-[11px] text-slate-400"
                  >
                    Highway Efficiency ({effUnit})
                  </label>
                  <div className="flex items-center justify-between mt-1">
                    <input
                      id="hwy-efficiency-input"
                      type="number"
                      step="0.5"
                      min="2"
                      max="120"
                      value={displayEfficiency}
                      onChange={(e) =>
                        setCustomFuelEconomy(parseFloat(e.target.value) || 8, unitSystem)
                      }
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono font-semibold text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[11px] text-slate-500 font-mono">
                      {unitSystem === 'metric'
                        ? `${roundTo(l100kmToMpg(fuelEconomyL100km), 0)} MPG`
                        : `${roundTo(fuelEconomyL100km, 1)} L/100`}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <label htmlFor="tank-cap-input" className="block text-[11px] text-slate-400">
                    Tank Capacity ({volUnit})
                  </label>
                  <div className="flex items-center justify-between mt-1">
                    <input
                      id="tank-cap-input"
                      type="number"
                      step="0.5"
                      min="10"
                      max="200"
                      value={displayTankCap}
                      onChange={(e) =>
                        setCustomTankCapacity(parseFloat(e.target.value) || 50, unitSystem)
                      }
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono font-semibold text-slate-100 tabular-nums focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[11px] text-slate-500 font-mono">
                      Max {displayMaxRange} {distUnit}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3: Fuel Level & Reserve Buffers */}
            <section className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-emerald-400" />
                  <span>03. Departure & Reserve Constraints</span>
                </h2>
              </div>

              {/* Initial Fuel at Departure */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label htmlFor="initial-fuel-slider" className="text-slate-300">
                    Initial Fuel at Departure
                  </label>
                  <span className="font-mono text-emerald-400 font-semibold tabular-nums">
                    {initialFuelPercent}% ({initialFuelVolume} {volUnit})
                  </span>
                </div>
                <input
                  id="initial-fuel-slider"
                  type="range"
                  min={15}
                  max={100}
                  step={1}
                  value={initialFuelPercent}
                  onChange={(e) => setInitialFuelPercent(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Minimum Safety Reserve at Any Station */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label htmlFor="min-stop-reserve-slider" className="text-slate-300">
                    Min Safety Reserve at Stations
                  </label>
                  <span className="font-mono text-rose-400 font-semibold tabular-nums">
                    {minStopReservePercent}% ({minStopVolume} {volUnit})
                  </span>
                </div>
                <input
                  id="min-stop-reserve-slider"
                  type="range"
                  min={5}
                  max={35}
                  step={1}
                  value={minStopReservePercent}
                  onChange={(e) => setMinStopReservePercent(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              {/* Target Arrival Reserve at Final Destination (Constraint #1) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label htmlFor="target-arrival-slider" className="text-slate-300">
                    Required Arrival Reserve at Destination
                  </label>
                  <span className="font-mono text-amber-400 font-semibold tabular-nums">
                    {targetArrivalReservePercent}% ({targetArrivalVolume} {volUnit})
                  </span>
                </div>
                <input
                  id="target-arrival-slider"
                  type="range"
                  min={5}
                  max={95}
                  step={1}
                  value={targetArrivalReservePercent}
                  onChange={(e) => setTargetArrivalReservePercent(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: PRICING & POLICY */}
        {activeTab === 'pricing' && (
          <div className="space-y-5">
            {/* Optimization Algorithm Mode Selector */}
            <section className="space-y-3 pb-5 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span>Refueling Optimization Algorithm</span>
                </h2>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setPolicy('mode_b_partial_lookahead')}
                  className={`w-full p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    policy === 'mode_b_partial_lookahead'
                      ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">
                      Mode B: True Minimum Cost / Variable Partial Fill
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">LP Lookahead</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Scans reachable stations ahead. If a cheaper station is in range, pumps ONLY
                    enough fuel to reach it with exact safety reserve.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPolicy('mode_a_fill_or_cap')}
                  className={`w-full p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    policy === 'mode_a_fill_or_cap'
                      ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">
                      Mode A: Strict Fill-to-Full / Max Dollar Cap
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">Discretized DP</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Always fills tank to 100% capacity (or up to your per-stop $ cap) at each
                    selected station using Dynamic Programming.
                  </p>
                </button>
              </div>

              {/* Max Detour Time & Max Dollar Per Stop */}
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="max-detour-slider" className="text-slate-300">
                      Max Round-Trip Detour Time
                    </label>
                    <span className="font-mono text-emerald-400 font-semibold tabular-nums">
                      {maxDetourMinutes} min ({computeMaxStraightLineRadiusKm(maxDetourMinutes)} km
                      corridor)
                    </span>
                  </div>
                  <input
                    id="max-detour-slider"
                    type="range"
                    min={3}
                    max={40}
                    step={1}
                    value={maxDetourMinutes}
                    onChange={(e) => setMaxDetourMinutes(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div>
                    <label htmlFor="max-dollar-cap-input" className="block text-xs text-slate-200">
                      Per-Stop Max Dollar Cap ($)
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Leave empty for unlimited fill up to tank capacity
                    </span>
                  </div>
                  <input
                    id="max-dollar-cap-input"
                    type="number"
                    min="10"
                    max="250"
                    step="5"
                    placeholder="No Cap"
                    value={maxDollarPerStop ?? ''}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setMaxDollarPerStop(val === '' ? null : Math.max(5, Number(val)));
                    }}
                    className="w-24 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </section>

            {/* 3-Layer Hybrid Fuel Pricing Engine */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>3-Layer Hybrid Fuel Pricing Engine</span>
                </h2>
                <span className="text-xs font-mono text-slate-400">{priceUnit}</span>
              </div>

              {/* Layer 1: Regional Baseline vs Zone Pricing */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Layer 1: Macro Regional Baseline
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updatePricingConfig({ useZonePricing: !pricingConfig.useZonePricing })
                    }
                    className="text-xs text-emerald-400 hover:underline font-mono cursor-pointer"
                  >
                    {pricingConfig.useZonePricing ? 'Use Flat Baseline' : 'Use 3-Zone Corridor'}
                  </button>
                </div>

                {!pricingConfig.useZonePricing ? (
                  <div className="flex items-center justify-between">
                    <label htmlFor="flat-baseline-input" className="text-xs text-slate-400">
                      Trip Baseline Fuel Price ({priceUnit})
                    </label>
                    <input
                      id="flat-baseline-input"
                      type="number"
                      step="0.02"
                      min="0.5"
                      max="10"
                      value={
                        unitSystem === 'metric'
                          ? pricingConfig.baselinePricePerLiter
                          : pricingConfig.baselinePricePerGal
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 1.5;
                        if (unitSystem === 'metric') {
                          updatePricingConfig({ baselinePricePerLiter: v });
                        } else {
                          updatePricingConfig({ baselinePricePerGal: v });
                        }
                      }}
                      className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-emerald-400 font-semibold text-right"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(['start', 'mid', 'end'] as const).map((zone) => {
                      const val =
                        unitSystem === 'metric'
                          ? pricingConfig.zonePricesPerLiter[zone]
                          : pricingConfig.zonePricesPerGal[zone];
                      return (
                        <div
                          key={zone}
                          className="p-2 rounded bg-slate-900/90 border border-slate-800"
                        >
                          <label
                            htmlFor={`zone-price-${zone}`}
                            className="block text-[11px] text-slate-400 capitalize"
                          >
                            {zone} Zone
                          </label>
                          <input
                            id={`zone-price-${zone}`}
                            type="number"
                            step="0.02"
                            min="0.5"
                            max="10"
                            value={val}
                            onChange={(e) =>
                              setZonePrice(zone, parseFloat(e.target.value) || 1.5)
                            }
                            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-slate-100 tabular-nums"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Layer 2: Brand & Location Heuristic Modifiers */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-medium text-slate-300">
                  Layer 2: OSM Brand & Highway Proximity Modifiers
                </div>

                <label className="flex items-center justify-between text-xs text-slate-400 cursor-pointer">
                  <span>Brand Tier Multipliers (Costco/Arco vs Shell/Esso)</span>
                  <input
                    type="checkbox"
                    checked={pricingConfig.enableBrandHeuristics}
                    onChange={(e) =>
                      updatePricingConfig({ enableBrandHeuristics: e.target.checked })
                    }
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between text-xs text-slate-400 cursor-pointer">
                  <span>Highway Exit Proximity Markup (&lt;0.2 mi: +$0.05/gal)</span>
                  <input
                    type="checkbox"
                    checked={pricingConfig.enableProximityMarkup}
                    onChange={(e) =>
                      updatePricingConfig({ enableProximityMarkup: e.target.checked })
                    }
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between text-xs text-slate-400 cursor-pointer">
                  <span>Canadian Brand Rules (ONroute +$0.06/L, Pioneer -$0.07/L)</span>
                  <input
                    type="checkbox"
                    checked={pricingConfig.enableCanadianHeuristics}
                    onChange={(e) =>
                      updatePricingConfig({ enableCanadianHeuristics: e.target.checked })
                    }
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>
              </div>

              {/* Layer 3: Manual Crowd-Style Overrides & CSV Import */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Layer 3: Crowd-Style Overrides ({overrideCount} active)
                  </span>
                  <div className="flex items-center gap-2">
                    {overrideCount > 0 && (
                      <button
                        type="button"
                        onClick={clearAllStationOverrides}
                        className="text-xs text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCsvDrawerOpen(!csvDrawerOpen)}
                      className="text-xs text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>CSV Import</span>
                    </button>
                  </div>
                </div>

                {csvDrawerOpen && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      rows={3}
                      value={csvInputText}
                      onChange={(e) => setCsvInputText(e.target.value)}
                      placeholder={`station_id_or_brand,price\nCostco,1.42\nONroute,1.68`}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-slate-200 placeholder:text-slate-600"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-emerald-400 font-mono">
                        {csvImportStatus}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const count = importCsvOverrides(csvInputText);
                          setCsvImportStatus(`Applied ${count} station price overrides.`);
                        }}
                        className="px-3 py-1 bg-emerald-500 text-slate-950 font-semibold text-xs rounded hover:bg-emerald-400 cursor-pointer"
                      >
                        Apply CSV Overrides
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: CORRIDOR STATIONS EXPLORER & INLINE OVERRIDE */}
        {activeTab === 'stations' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  aria-label="Filter corridor stations"
                  value={stationSearch}
                  onChange={(e) => setStationSearch(e.target.value)}
                  placeholder="Filter by brand, city, or exit..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={() => refreshLiveOverpassStations()}
                disabled={isReconstructing}
                title="Query live OpenStreetMap Overpass API"
                className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReconstructing ? 'animate-spin' : ''}`} />
                <span>Overpass Sync</span>
              </button>
            </div>

            <div className="space-y-2">
              {filteredStations.map((st) => {
                const isOptimal = optimalStopIds.has(st.id);
                const isSelected = selectedStationId === st.id;
                const activePrice =
                  unitSystem === 'metric' ? st.effectivePricePerLiter : st.effectivePricePerGal;
                const hasManual = st.manualOverridePricePerLiter !== null;

                return (
                  <div
                    key={st.id}
                    onClick={() => setSelectedStationId(st.id)}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500'
                        : isOptimal
                        ? 'bg-emerald-950/25 border-emerald-500/50 hover:border-emerald-500'
                        : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                          <span>{st.name}</span>
                          {isOptimal && (
                            <span className="text-[11px] font-mono text-emerald-400">
                              · Optimal Stop
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {unitSystem === 'metric'
                            ? `@ ${st.distanceAlongRouteKm} km`
                            : `@ ${st.distanceAlongRouteMiles} mi`}{' '}
                          · +{st.detourTimeMinutes} min detour · {st.brandTier.replace('_', ' ')}
                        </div>
                      </div>

                      {/* Direct Price Override Input */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs font-mono text-slate-400">$</span>
                        <input
                          type="number"
                          aria-label={`Price override for ${st.name}`}
                          step={unitSystem === 'metric' ? '0.01' : '0.05'}
                          min="0.3"
                          max="12"
                          value={activePrice}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!Number.isNaN(val) && val > 0) {
                              setStationPriceOverride(st.id, val);
                            }
                          }}
                          className={`w-18 px-2 py-1 rounded text-xs font-mono font-semibold text-right tabular-nums border ${
                            hasManual
                              ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                              : 'bg-slate-900 border-slate-700 text-emerald-400'
                          }`}
                        />
                        {hasManual && (
                          <button
                            type="button"
                            title="Clear manual price override"
                            onClick={() => setStationPriceOverride(st.id, null)}
                            className="text-xs text-slate-400 hover:text-rose-400 px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: OPTIMAL REFUEL LEDGER TIMELINE */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            {/* Summary Savings Banner */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Optimized Refuel Spend</span>
                <span className="text-base font-mono font-bold text-emerald-400 tabular-nums">
                  ${optimizationResult.totalCost.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Naive Highway Baseline</span>
                <span className="font-mono text-slate-400 line-through tabular-nums">
                  ${optimizationResult.naiveTotalCost.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-medium">Mathematical Savings</span>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                  ${optimizationResult.savingsVsNaive.toFixed(2)} (
                  {optimizationResult.savingsPercent}% saved)
                </span>
              </div>
            </div>

            {/* Step-by-Step Refuel Timeline */}
            <div className="space-y-3">
              {/* Origin Node */}
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      Depart: {routeGeometry.originLabel}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      0 {distUnit} · Starting Tank: {initialFuelPercent}%
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono text-slate-300 tabular-nums">
                  {unitSystem === 'metric'
                    ? `${optimizationResult.departureFuelLiters} L`
                    : `${optimizationResult.departureFuelGal} gal`}
                </div>
              </div>

              {/* Optimal Refuel Stops */}
              {optimizationResult.stops.length === 0 && optimizationResult.feasible && (
                <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Zero refueling stops needed! Starting fuel is sufficient to reach Destination
                    above your {targetArrivalReservePercent}% reserve threshold.
                  </span>
                </div>
              )}

              {optimizationResult.stops.map((stop) => (
                <div
                  key={stop.station.id}
                  onClick={() => setSelectedStationId(stop.station.id)}
                  className="p-3.5 rounded-lg bg-slate-950 border border-emerald-500/50 hover:border-emerald-400 transition-colors space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-emerald-400 font-mono">
                        STOP #{stop.stopNumber} ·{' '}
                        {unitSystem === 'metric'
                          ? `${stop.station.distanceAlongRouteKm} km`
                          : `${stop.station.distanceAlongRouteMiles} mi`}
                      </div>
                      <div className="text-sm font-semibold text-slate-100 mt-0.5">
                        {stop.station.name}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-sm font-bold text-emerald-400 tabular-nums">
                        ${stop.stepCost.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {unitSystem === 'metric'
                          ? `$${stop.pricePerLiter.toFixed(3)}/L`
                          : `$${stop.pricePerGal.toFixed(2)}/gal`}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2 rounded bg-slate-900/90 font-mono text-center">
                    <div>
                      <div className="text-[10px] text-slate-400">Arrive Tank</div>
                      <div className="text-xs font-semibold text-amber-400 tabular-nums">
                        {stop.arrivalFuelPercent}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Pump Volume</div>
                      <div className="text-xs font-semibold text-emerald-400 tabular-nums">
                        +
                        {unitSystem === 'metric'
                          ? `${stop.fuelPurchasedLiters} L`
                          : `${stop.fuelPurchasedGal} gal`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Depart Tank</div>
                      <div className="text-xs font-semibold text-slate-100 tabular-nums">
                        {stop.departureFuelPercent}%
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {stop.policyExplanation}
                  </p>
                </div>
              ))}

              {/* Destination Node */}
              {optimizationResult.feasible && (
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        Arrive: {routeGeometry.destinationLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {unitSystem === 'metric'
                          ? `${routeGeometry.distanceKm} km`
                          : `${routeGeometry.distanceMiles} mi`}{' '}
                        · Target Reserve: ≥{targetArrivalReservePercent}%
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xs font-semibold text-emerald-400 tabular-nums">
                      {optimizationResult.arrivalFuelPercent}%
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      {unitSystem === 'metric'
                        ? `${optimizationResult.arrivalFuelLiters} L`
                        : `${optimizationResult.arrivalFuelGal} gal`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Persistent Bottom Summary Action Footer */}
      <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="font-mono">
          <div className="text-[11px] text-slate-400">
            {optimizationResult.stops.length} Optimal{' '}
            {optimizationResult.stops.length === 1 ? 'Stop' : 'Stops'} ·{' '}
            {unitSystem === 'metric'
              ? `${optimizationResult.totalFuelPurchasedLiters} L`
              : `${optimizationResult.totalFuelPurchasedGal} gal`}
          </div>
          <div className="text-sm font-bold text-emerald-400 tabular-nums">
            Total: ${optimizationResult.totalCost.toFixed(2)}{' '}
            {optimizationResult.savingsVsNaive > 0 && (
              <span className="text-xs font-normal text-slate-300">
                (Save ${optimizationResult.savingsVsNaive.toFixed(2)})
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab(activeTab === 'ledger' ? 'route' : 'ledger')}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Fuel className="w-3.5 h-3.5 text-emerald-400" />
          <span>{activeTab === 'ledger' ? 'Edit Config' : 'View Refuel Ledger'}</span>
        </button>
      </div>
    </aside>
  );
};
