import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  Gauge,
  RotateCcw,
  Settings,
  Sliders,
  Upload,
  X,
} from 'lucide-react';
import { computeMaxStraightLineRadiusKm } from '../lib/geo/overpass';
import { useTripStore } from '../store/useTripStore';

export const SettingsModal: React.FC = () => {
  const isSettingsOpen = useTripStore((s) => s.isSettingsOpen);
  const setIsSettingsOpen = useTripStore((s) => s.setIsSettingsOpen);

  const unitSystem = useTripStore((s) => s.unitSystem);
  const setUnitSystem = useTripStore((s) => s.setUnitSystem);

  const policy = useTripStore((s) => s.policy);
  const setPolicy = useTripStore((s) => s.setPolicy);

  const maxDetourMinutes = useTripStore((s) => s.maxDetourMinutes);
  const setMaxDetourMinutes = useTripStore((s) => s.setMaxDetourMinutes);

  const maxDollarPerStop = useTripStore((s) => s.maxDollarPerStop);
  const setMaxDollarPerStop = useTripStore((s) => s.setMaxDollarPerStop);

  const pricingConfig = useTripStore((s) => s.pricingConfig);
  const updatePricingConfig = useTripStore((s) => s.updatePricingConfig);
  const setZonePrice = useTripStore((s) => s.setZonePrice);

  const manualOverridesPerLiter = useTripStore((s) => s.manualOverridesPerLiter);
  const clearAllStationOverrides = useTripStore((s) => s.clearAllStationOverrides);
  const importCsvOverrides = useTripStore((s) => s.importCsvOverrides);

  const [csvDrawerOpen, setCsvDrawerOpen] = useState(false);
  const [csvInputText, setCsvInputText] = useState('');
  const [csvImportStatus, setCsvImportStatus] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, setIsSettingsOpen]);

  if (!isSettingsOpen) return null;

  const priceUnit = unitSystem === 'metric' ? '$/L' : '$/gal';
  const overrideCount = Object.keys(manualOverridesPerLiter).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={() => setIsSettingsOpen(false)}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base font-bold text-slate-100">
                Settings
              </h2>
              <p className="text-xs text-slate-400">
                Configure trip and optimization settings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Close Settings"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Setting 1: Telemetry Units */}
          <section className="space-y-3 pb-5 border-b border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Telemetry Units
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Active: {unitSystem === 'metric' ? 'Metric' : 'Imperial'}
              </span>
            </div>
            <div
              role="group"
              aria-label="Unit system toggle"
              className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800"
            >
              <button
                type="button"
                onClick={() => setUnitSystem('metric')}
                className={`py-2 px-3 text-xs font-medium rounded-lg transition-colors cursor-pointer text-center ${
                  unitSystem === 'metric'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                Metric (km · L · $/L)
              </button>
              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`py-2 px-3 text-xs font-medium rounded-lg transition-colors cursor-pointer text-center ${
                  unitSystem === 'imperial'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                Imperial (mi · gal · $/gal)
              </button>
            </div>
          </section>

          {/* Setting 2: Refueling Optimization Algorithm */}
          <section className="space-y-3 pb-5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Refueling Optimization Algorithm
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPolicy('mode_b_partial_lookahead')}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                  policy === 'mode_b_partial_lookahead'
                    ? 'bg-emerald-500/15 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">Mode B: LP Lookahead</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      Recommended
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-200 mt-1">
                    True Minimum Cost / Variable Partial Fill
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Scans reachable stations ahead. If a cheaper station is in range, pumps ONLY enough
                    fuel to reach it with exact safety reserve.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPolicy('mode_a_fill_or_cap')}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                  policy === 'mode_a_fill_or_cap'
                    ? 'bg-emerald-500/15 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">Mode A: Discretized DP</span>
                  </div>
                  <div className="text-xs font-medium text-slate-200 mt-1">
                    Strict Fill-to-Full / Max Dollar Cap
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Always fills tank to 100% capacity (or up to your per-stop $ cap) at each selected
                    station using Dynamic Programming.
                  </p>
                </div>
              </button>
            </div>
          </section>

          {/* Setting 3 & 4: Detour Time & Per-Stop Cap */}
          <section className="space-y-4 pb-5 border-b border-slate-800/80">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Detour & Budget Limits
            </h3>

            {/* Max Round-Trip Detour Time */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <div>
                  <label htmlFor="settings-max-detour" className="font-medium text-slate-200">
                    Max Round-Trip Detour Time
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Filter out fuel stops requiring longer travel off the main route
                  </p>
                </div>
                <span className="font-mono text-emerald-400 font-semibold tabular-nums text-xs">
                  {maxDetourMinutes} min ({computeMaxStraightLineRadiusKm(maxDetourMinutes)} km corridor)
                </span>
              </div>
              <input
                id="settings-max-detour"
                type="range"
                min={3}
                max={40}
                step={1}
                value={maxDetourMinutes}
                onChange={(e) => setMaxDetourMinutes(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Per-Stop Max Dollar Cap */}
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div>
                <label htmlFor="settings-dollar-cap" className="block text-xs font-medium text-slate-200">
                  Per-Stop Max Dollar Cap ($)
                </label>
                <p className="text-[11px] text-slate-500">
                  Limit maximum spend per fueling stop (leave blank for unlimited full tank fill)
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-mono text-slate-400">$</span>
                <input
                  id="settings-dollar-cap"
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
                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 text-right"
                />
              </div>
            </div>
          </section>

          {/* Setting 5: 3-Layer Hybrid Fuel Pricing Engine */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  3-Layer Hybrid Fuel Pricing Engine
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">{priceUnit}</span>
            </div>

            {/* Layer 1: Macro Regional Baseline */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
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
                  {pricingConfig.useZonePricing ? 'Switch to Flat Baseline' : 'Switch to 3-Zone Corridor'}
                </button>
              </div>

              {!pricingConfig.useZonePricing ? (
                <div className="flex items-center justify-between">
                  <label htmlFor="settings-flat-baseline" className="text-xs text-slate-400">
                    Trip Baseline Fuel Price ({priceUnit})
                  </label>
                  <input
                    id="settings-flat-baseline"
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
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-emerald-400 font-semibold text-right"
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
                        className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800"
                      >
                        <label
                          htmlFor={`settings-zone-price-${zone}`}
                          className="block text-[11px] text-slate-400 capitalize"
                        >
                          {zone} Zone
                        </label>
                        <input
                          id={`settings-zone-price-${zone}`}
                          type="number"
                          step="0.02"
                          min="0.5"
                          max="10"
                          value={val}
                          onChange={(e) =>
                            setZonePrice(zone, parseFloat(e.target.value) || 1.5)
                          }
                          className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100 tabular-nums"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Layer 2: OSM Brand & Highway Proximity Modifiers */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
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
                  className="accent-emerald-500 w-4 h-4 cursor-pointer"
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
                  className="accent-emerald-500 w-4 h-4 cursor-pointer"
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
                  className="accent-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* Layer 3: Manual Overrides & CSV Import */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
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
                      className="px-3 py-1 bg-emerald-500 text-slate-950 font-semibold text-xs rounded-lg hover:bg-emerald-400 cursor-pointer transition-colors"
                    >
                      Apply CSV Overrides
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
