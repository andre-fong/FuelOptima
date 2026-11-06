import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import { kmToMiles, litersToGallons, roundTo } from '../lib/units';
import { useTripStore } from '../store/useTripStore';

export const TelemetryChart: React.FC = () => {
  const unitSystem = useTripStore((s) => s.unitSystem);
  const routeGeometry = useTripStore((s) => s.routeGeometry);
  const tankCapacityLiters = useTripStore((s) => s.tankCapacityLiters);
  const minStopReservePercent = useTripStore((s) => s.minStopReservePercent);
  const targetArrivalReservePercent = useTripStore((s) => s.targetArrivalReservePercent);
  const optimizationResult = useTripStore((s) => s.optimizationResult);
  const isTelemetryExpanded = useTripStore((s) => s.isTelemetryExpanded);
  const setIsTelemetryExpanded = useTripStore((s) => s.setIsTelemetryExpanded);
  const setHoveredDistanceKm = useTripStore((s) => s.setHoveredDistanceKm);
  const setSelectedStationId = useTripStore((s) => s.setSelectedStationId);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const telemetry = optimizationResult.telemetry;
  const totalDistDisplay =
    unitSystem === 'metric' ? routeGeometry.distanceKm : routeGeometry.distanceMiles;
  const maxTankDisplay =
    unitSystem === 'metric'
      ? roundTo(tankCapacityLiters, 1)
      : roundTo(litersToGallons(tankCapacityLiters), 1);

  const distUnit = unitSystem === 'metric' ? 'km' : 'mi';
  const volUnit = unitSystem === 'metric' ? 'L' : 'gal';

  // SVG internal coordinate system
  const width = 920;
  const height = 165;
  const padLeft = 48;
  const padRight = 24;
  const padTop = 18;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { areaPath, linePath, stopAnnotations, minReserveY, targetArrivalY } = useMemo(() => {
    if (telemetry.length === 0 || routeGeometry.distanceKm <= 0) {
      return {
        areaPath: '',
        linePath: '',
        stopAnnotations: [],
        minReserveY: padTop + plotH,
        targetArrivalY: padTop + plotH,
      };
    }

    const totalKm = Math.max(1, routeGeometry.distanceKm);
    const xForKm = (km: number) => padLeft + (Math.min(totalKm, Math.max(0, km)) / totalKm) * plotW;
    const yForPct = (pct: number) =>
      padTop + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

    const coords = telemetry.map((pt) => ({
      x: xForKm(pt.distanceKm),
      y: yForPct(pt.fuelRemainingPercent),
      pt,
    }));

    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const firstX = coords[0].x.toFixed(1);
    const lastX = coords[coords.length - 1].x.toFixed(1);
    const baselineY = (padTop + plotH).toFixed(1);
    const area = `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

    const annotations = optimizationResult.stops.map((stop) => {
      const x = xForKm(stop.station.distanceAlongRouteKm);
      const yBottom = yForPct(stop.arrivalFuelPercent);
      const yTop = yForPct(stop.departureFuelPercent);
      return {
        stop,
        x,
        yBottom,
        yTop,
      };
    });

    return {
      areaPath: area,
      linePath: line,
      stopAnnotations: annotations,
      minReserveY: yForPct(minStopReservePercent),
      targetArrivalY: yForPct(targetArrivalReservePercent),
    };
  }, [
    telemetry,
    routeGeometry.distanceKm,
    optimizationResult.stops,
    minStopReservePercent,
    targetArrivalReservePercent,
    plotW,
    plotH,
  ]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || telemetry.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clampedPlotX = Math.max(0, Math.min(plotW, relX - padLeft));
    const targetKm = (clampedPlotX / plotW) * routeGeometry.distanceKm;

    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < telemetry.length; i++) {
      const diff = Math.abs(telemetry[i].distanceKm - targetKm);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
    setHoveredDistanceKm(telemetry[bestIdx].distanceKm);
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
    setHoveredDistanceKm(null);
  };

  const activeHoverPoint = hoverIdx !== null ? telemetry[hoverIdx] : null;
  const hoverX =
    activeHoverPoint && routeGeometry.distanceKm > 0
      ? padLeft + (activeHoverPoint.distanceKm / routeGeometry.distanceKm) * plotW
      : null;
  const hoverY = activeHoverPoint
    ? padTop + plotH - (activeHoverPoint.fuelRemainingPercent / 100) * plotH
    : null;

  return (
    <div className="bg-slate-950/95 backdrop-blur-md border-t border-slate-800 select-none z-20 shrink-0">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-1.5 border-b border-slate-800/80">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0">
            <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Fuel Tank Telemetry Profile</span>
          </div>
          <div className="hidden xl:flex items-center gap-2.5 text-[11px] text-slate-400 font-mono whitespace-nowrap">
            <span>
              <strong className="text-emerald-400">Emerald Spikes:</strong> Refuel Stops
            </span>
            <span>·</span>
            <span>
              <strong className="text-rose-400">Rose Line:</strong> Min Reserve (
              {minStopReservePercent}%)
            </span>
            <span>·</span>
            <span>
              <strong className="text-amber-400">Amber Dot:</strong> Arrival Reserve (
              {targetArrivalReservePercent}%)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeHoverPoint && (
            <div className="text-xs font-mono text-slate-200 tabular-nums">
              At{' '}
              {unitSystem === 'metric'
                ? `${activeHoverPoint.distanceKm} km`
                : `${activeHoverPoint.distanceMiles} mi`}
              :{' '}
              <span className="text-emerald-400 font-semibold">
                {unitSystem === 'metric'
                  ? `${activeHoverPoint.fuelRemainingLiters} L`
                  : `${activeHoverPoint.fuelRemainingGal} gal`}{' '}
                ({activeHoverPoint.fuelRemainingPercent}%)
              </span>
            </div>
          )}
          <button
            type="button"
            aria-label={
              isTelemetryExpanded ? 'Collapse telemetry chart' : 'Expand telemetry chart'
            }
            onClick={() => setIsTelemetryExpanded(!isTelemetryExpanded)}
            className="p-1 text-slate-400 hover:text-slate-100 rounded transition-colors cursor-pointer"
          >
            {isTelemetryExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Interactive SVG Area Chart */}
      {isTelemetryExpanded && (
        <div className="px-3 py-1.5">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="w-full h-[155px] overflow-visible cursor-crosshair"
            role="img"
            aria-label="Fuel tank level versus route distance telemetry chart"
          >
            <defs>
              <linearGradient id="fuelAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.38" />
                <stop offset="75%" stopColor="#0ea5e9" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines (100%, 50%, 0%) */}
            {[100, 50, 0].map((pct) => {
              const y = padTop + plotH - (pct / 100) * plotH;
              const volLabel = roundTo((pct / 100) * maxTankDisplay, 0);
              return (
                <g key={pct}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray={pct === 50 ? '3 3' : undefined}
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500 text-[10px] font-mono"
                  >
                    {volLabel}
                    {volUnit}
                  </text>
                </g>
              );
            })}

            {/* Minimum Reserve Threshold Danger Line (Rose-500) */}
            <line
              x1={padLeft}
              y1={minReserveY}
              x2={width - padRight}
              y2={minReserveY}
              stroke="#f43f5e"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <text
              x={width - padRight - 4}
              y={minReserveY - 4}
              textAnchor="end"
              className="fill-rose-400 text-[9px] font-mono"
            >
              Min Reserve ({minStopReservePercent}%)
            </text>

            {/* Target Arrival Reserve Marker at Destination (Amber-500) */}
            <circle
              cx={width - padRight}
              cy={targetArrivalY}
              r={4}
              fill="#f59e0b"
              stroke="#020617"
              strokeWidth="1.5"
            />

            {/* Fuel Level Area & Slope Line */}
            {areaPath && <path d={areaPath} fill="url(#fuelAreaGrad)" />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={optimizationResult.feasible ? '#10b981' : '#f43f5e'}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            )}

            {/* Vertical Refill Spikes & Badges for Each Selected Stop */}
            {stopAnnotations.map(({ stop, x, yBottom, yTop }) => (
              <g
                key={stop.station.id}
                onClick={() => setSelectedStationId(stop.station.id)}
                className="cursor-pointer"
              >
                <line
                  x1={x}
                  y1={yBottom}
                  x2={x}
                  y2={yTop}
                  stroke="#34d399"
                  strokeWidth="3"
                />
                <circle
                  cx={x}
                  cy={yTop}
                  r={5}
                  fill="#10b981"
                  stroke="#020617"
                  strokeWidth="1.5"
                />
                <text
                  x={x}
                  y={Math.max(12, yTop - 7)}
                  textAnchor="middle"
                  className="fill-emerald-300 text-[10px] font-mono font-bold"
                >
                  #{stop.stopNumber} (+
                  {unitSystem === 'metric'
                    ? `${roundTo(stop.fuelPurchasedLiters, 0)}L`
                    : `${roundTo(stop.fuelPurchasedGal, 1)}g`}
                  )
                </text>
              </g>
            ))}

            {/* X-Axis Distance Ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const x = padLeft + frac * plotW;
              const distVal = roundTo(frac * totalDistDisplay, 0);
              return (
                <text
                  key={frac}
                  x={x}
                  y={height - 6}
                  textAnchor={frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle'}
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {distVal} {distUnit}
                </text>
              );
            })}

            {/* Interactive Hover Crosshair */}
            {hoverX !== null && hoverY !== null && (
              <g pointerEvents="none">
                <line
                  x1={hoverX}
                  y1={padTop}
                  x2={hoverX}
                  y2={padTop + plotH}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={hoverX}
                  cy={hoverY}
                  r={4.5}
                  fill="#38bdf8"
                  stroke="#020617"
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>
        </div>
      )}
    </div>
  );
};
