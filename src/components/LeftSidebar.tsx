import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Compass,
  Filter,
  Fuel,
  Gauge,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
} from 'lucide-react';
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

  const setStationPriceOverride = useTripStore((s) => s.setStationPriceOverride);

  const rawStations = useTripStore((s) => s.rawStations);
  const pricedStations = useTripStore((s) => s.pricedStations);
  const optimizationResult = useTripStore((s) => s.optimizationResult);
  const selectedStationId = useTripStore((s) => s.selectedStationId);
  const setSelectedStationId = useTripStore((s) => s.setSelectedStationId);

  const omittedBrands = useTripStore((s) => s.omittedBrands);
  const toggleOmittedBrand = useTripStore((s) => s.toggleOmittedBrand);
  const clearOmittedBrands = useTripStore((s) => s.clearOmittedBrands);

  // Cascading vehicle selector state derived from selectedVehicle
  const currentVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0],
    [vehicles, selectedVehicleId]
  );

  const [filterYear, setFilterYear] = useState<number>(currentVehicle.year);
  const [filterMake, setFilterMake] = useState<string>(currentVehicle.make);
  const [filterModel, setFilterModel] = useState<string>(currentVehicle.model);
  const [stationSearch, setStationSearch] = useState<string>('');
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState<boolean>(false);

  // Compute unique brands and count of stations per brand from corridor rawStations
  const uniqueBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const st of rawStations) {
      const b = st.brand || 'Independent';
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }, [rawStations]);

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

  const handleGetDirections = () => {
    // Point A (Origin)
    const originCoord = waypoints[0]
      ? { lat: waypoints[0].lat, lng: waypoints[0].lng }
      : routeGeometry.coordinates.length > 0
      ? { lat: routeGeometry.coordinates[0][1], lng: routeGeometry.coordinates[0][0] }
      : null;

    // Point B (Destination)
    const destCoord =
      waypoints.length > 1
        ? { lat: waypoints[waypoints.length - 1].lat, lng: waypoints[waypoints.length - 1].lng }
        : routeGeometry.coordinates.length > 0
        ? {
            lat: routeGeometry.coordinates[routeGeometry.coordinates.length - 1][1],
            lng: routeGeometry.coordinates[routeGeometry.coordinates.length - 1][0],
          }
        : null;

    if (!originCoord || !destCoord) return;

    const originStr = `${originCoord.lat},${originCoord.lng}`;
    const destStr = `${destCoord.lat},${destCoord.lng}`;

    // All gas station stops in sequence along the route
    const stopCoords = optimizationResult.stops.map(
      (s) => `${s.station.lat},${s.station.lng}`
    );

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      originStr
    )}&destination=${encodeURIComponent(destStr)}&travelmode=driving`;

    if (stopCoords.length > 0) {
      url += `&waypoints=${encodeURIComponent(stopCoords.join('|'))}`;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <aside className="w-full lg:w-[425px] h-full bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 select-none overflow-hidden">
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

        {/* TAB 1: DESTINATION */}
        {activeTab === 'route' && (
          <div className="space-y-5">
            {/* Section 1: Google Maps URL Parser */}
            <section className="space-y-3 pb-5 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <span>1. Paste your Google Maps Directions Link to start</span>
                </h2>
                <span className="text-xs text-slate-400 font-mono">OSRM + Nominatim</span>
              </div>

              <div className="space-y-2">
                <label htmlFor="gmaps-url-input" className="block text-xs text-slate-400">
                  Paste Google Maps Directions Link (www.google.com/maps/dir/...)
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
                    {isReconstructing ? 'Parsing...' : 'Search'}
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
                  <span>2. Vehicle Specs</span>
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
                  <span>3. Departure & Reserve Constraints</span>
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

        {/* TAB 2: CORRIDOR STATIONS EXPLORER & INLINE OVERRIDE */}
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
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => refreshLiveOverpassStations()}
                  disabled={isReconstructing}
                  title="Query live OpenStreetMap Overpass API"
                  aria-label="Refresh stations"
                  className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300 hover:text-slate-100 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReconstructing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsBrandFilterOpen(!isBrandFilterOpen)}
                  title={isBrandFilterOpen ? 'Close brand filters' : 'Filter station brands'}
                  aria-label="Filter station brands"
                  className={`relative p-2 border rounded-lg text-xs flex items-center justify-center cursor-pointer transition-colors ${
                    isBrandFilterOpen || omittedBrands.length > 0
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {omittedBrands.length > 0 && (
                    <span
                      title={`${omittedBrands.length} brand(s) omitted`}
                      className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white font-mono text-[9px] font-bold flex items-center justify-center ring-2 ring-slate-900"
                    >
                      {omittedBrands.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Brand Checklist (Filters Tab Panel) */}
            {isBrandFilterOpen && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      Brand Checklist ({uniqueBrands.length} brands found)
                    </span>
                  </div>
                  {omittedBrands.length > 0 && (
                    <button
                      type="button"
                      onClick={clearOmittedBrands}
                      className="text-[11px] text-emerald-400 hover:underline cursor-pointer font-medium"
                    >
                      Reset (Include All)
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Check any brand to <span className="text-rose-400 font-medium">omit</span> it. FuelOptima will recalculate another optimal route avoiding that brand.
                </p>

                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {uniqueBrands.map(({ brand, count }) => {
                    const isChecked = omittedBrands.includes(brand);
                    return (
                      <label
                        key={brand}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-rose-950/30 border-rose-500/60 text-rose-300'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOmittedBrand(brand)}
                            className="accent-rose-500 rounded cursor-pointer shrink-0"
                          />
                          <span
                            className={`truncate font-medium ${
                              isChecked ? 'line-through text-rose-400' : 'text-slate-200'
                            }`}
                            title={brand}
                          >
                            {brand}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-1 rounded bg-slate-950/80 text-slate-400 shrink-0">
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {omittedBrands.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-rose-400">
                      {omittedBrands.length} brand{omittedBrands.length > 1 ? 's' : ''} omitted
                    </span>
                    <span className="text-emerald-400">
                      {pricedStations.length} station{pricedStations.length === 1 ? '' : 's'} available
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Active Filters Summary Pill when Drawer is Collapsed */}
            {!isBrandFilterOpen && omittedBrands.length > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-[11px]">
                <span className="text-rose-300 truncate">
                  Omitted {omittedBrands.length} brand{omittedBrands.length > 1 ? 's' : ''}: {omittedBrands.join(', ')}
                </span>
                <button
                  type="button"
                  onClick={clearOmittedBrands}
                  className="text-emerald-400 hover:underline cursor-pointer font-medium ml-2 shrink-0"
                >
                  Reset
                </button>
              </div>
            )}

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

        {/* TAB 3: YOUR ROUTE (OPTIMAL REFUEL TIMELINE) */}
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

        {/* Action Buttons for Each Tab */}
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === 'route' && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm shadow-emerald-500/20"
              >
                <Fuel className="w-3.5 h-3.5" />
                <span>View Your Route</span>
              </button>
            </>
          )}

          {activeTab === 'stations' && (
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm shadow-emerald-500/20"
            >
              <Fuel className="w-3.5 h-3.5" />
              <span>View Your Route</span>
            </button>
          )}

          {activeTab === 'ledger' && (
            <button
              type="button"
              onClick={handleGetDirections}
              title="Open trip directions with all fuel stops in Google Maps"
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Get Directions!</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
