import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as turf from '@turf/turf';
import { Maximize2, Minus, Plus, X } from 'lucide-react';
import { computeMaxStraightLineRadiusKm } from '../lib/geo/overpass';
import { roundTo } from '../lib/units';
import { useTripStore } from '../store/useTripStore';

interface ViewTransform {
  centerLng: number;
  centerLat: number;
  zoom: number;
}

/**
 * Spherical Mercator projection helpers for exact geographic-to-screen coordinate mapping
 */
function lngToMercatorX(lng: number): number {
  return (lng + 180) / 360;
}

function latToMercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

export const MapCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 980,
    height: 620,
  });

  const unitSystem = useTripStore((s) => s.unitSystem);
  const routeGeometry = useTripStore((s) => s.routeGeometry);
  const waypoints = useTripStore((s) => s.waypoints);
  const pricedStations = useTripStore((s) => s.pricedStations);
  const optimizationResult = useTripStore((s) => s.optimizationResult);
  const selectedStationId = useTripStore((s) => s.selectedStationId);
  const setSelectedStationId = useTripStore((s) => s.setSelectedStationId);
  const setStationPriceOverride = useTripStore((s) => s.setStationPriceOverride);
  const hoveredDistanceKm = useTripStore((s) => s.hoveredDistanceKm);
  const maxDetourMinutes = useTripStore((s) => s.maxDetourMinutes);
  const policy = useTripStore((s) => s.policy);

  const [view, setView] = useState<ViewTransform>({
    centerLng: -76.48,
    centerLat: 44.55,
    zoom: 6.4,
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    centerLng: number;
    centerLat: number;
  } | null>(null);

  const priceUnit = unitSystem === 'metric' ? '/L' : '/gal';

  // Track container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit bounds helper
  const fitRouteBounds = React.useCallback(() => {
    const [minLng, minLat, maxLng, maxLat] = routeGeometry.bbox;
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    const dx = Math.abs(lngToMercatorX(maxLng) - lngToMercatorX(minLng));
    const dy = Math.abs(latToMercatorY(maxLat) - latToMercatorY(minLat));

    const padW = Math.max(240, dimensions.width - 180);
    const padH = Math.max(180, dimensions.height - 160);

    const zoomX = dx > 0 ? Math.log2(padW / (256 * dx)) : 8;
    const zoomY = dy > 0 ? Math.log2(padH / (256 * dy)) : 8;
    const zoom = Math.max(3.5, Math.min(11.5, Math.min(zoomX, zoomY)));

    setView({ centerLng, centerLat, zoom: roundTo(zoom, 2) });
  }, [routeGeometry.bbox, dimensions.width, dimensions.height]);

  useEffect(() => {
    fitRouteBounds();
  }, [fitRouteBounds]);

  // Center on station when selected from sidebar
  useEffect(() => {
    if (!selectedStationId) return;
    const st = pricedStations.find((s) => s.id === selectedStationId);
    if (st) {
      setView((prev) => ({
        centerLng: st.lng,
        centerLat: st.lat,
        zoom: Math.max(prev.zoom, 7.6),
      }));
    }
  }, [selectedStationId, pricedStations]);

  // Project [lng, lat] to viewport [x, y]
  const project = React.useCallback(
    (lng: number, lat: number): [number, number] => {
      const scale = 256 * Math.pow(2, view.zoom);
      const worldX = lngToMercatorX(lng) * scale;
      const worldY = latToMercatorY(lat) * scale;
      const centerX = lngToMercatorX(view.centerLng) * scale;
      const centerY = latToMercatorY(view.centerLat) * scale;
      return [
        dimensions.width / 2 + (worldX - centerX),
        dimensions.height / 2 + (worldY - centerY),
      ];
    },
    [view, dimensions]
  );

  // Mouse pan & wheel zoom handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, [data-popup]')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      centerLng: view.centerLng,
      centerLat: view.centerLat,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!isDragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const scale = 256 * Math.pow(2, view.zoom);
    const lngDelta = (dx / scale) * 360;
    const latFactor = Math.cos((dragStart.centerLat * Math.PI) / 180);
    const latDelta = (dy / scale) * 360 * latFactor;
    const nextLng = dragStart.centerLng - lngDelta;
    const nextLat = Math.max(-80, Math.min(80, dragStart.centerLat + latDelta));

    setView((prev) => ({
      ...prev,
      centerLng: nextLng,
      centerLat: nextLat,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.35 : -0.35;
    setView((prev) => ({
      ...prev,
      zoom: roundTo(Math.max(3.5, Math.min(13, prev.zoom + delta)), 2),
    }));
  };

  // Projected SVG path for route polyline
  const routeSvgPoints = useMemo(
    () => routeGeometry.coordinates.map(([lng, lat]) => project(lng, lat)),
    [routeGeometry.coordinates, project]
  );

  const routePathD = useMemo(() => {
    if (routeSvgPoints.length === 0) return '';
    return routeSvgPoints
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
  }, [routeSvgPoints]);

  // Projected Dead Zone path if infeasible
  const deadZonePathD = useMemo(() => {
    if (
      optimizationResult.feasible ||
      !optimizationResult.error ||
      optimizationResult.error.deadZoneCoordinates.length < 2
    ) {
      return '';
    }
    return optimizationResult.error.deadZoneCoordinates
      .map(([lng, lat], idx) => {
        const [x, y] = project(lng, lat);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [optimizationResult, project]);

  // Projected Detour Halo Width in pixels
  const corridorPixelWidth = useMemo(() => {
    const radiusKm = computeMaxStraightLineRadiusKm(maxDetourMinutes);
    const kmPerPixel =
      (40075 * Math.cos((view.centerLat * Math.PI) / 180)) / (256 * Math.pow(2, view.zoom));
    const px = (radiusKm * 2) / Math.max(0.05, kmPerPixel);
    return Math.max(16, Math.min(72, px));
  }, [maxDetourMinutes, view.centerLat, view.zoom]);

  // Graticule / Lat-Lng Tactical Grid lines
  const gridLines = useMemo(() => {
    const stepDeg = view.zoom > 8 ? 0.5 : view.zoom > 6 ? 1.0 : 2.0;
    const lngLines: Array<{ lng: number; x: number }> = [];
    const latLines: Array<{ lat: number; y: number }> = [];

    const startLng = Math.floor((view.centerLng - 12) / stepDeg) * stepDeg;
    const endLng = Math.ceil((view.centerLng + 12) / stepDeg) * stepDeg;
    for (let lng = startLng; lng <= endLng; lng += stepDeg) {
      const [x] = project(lng, view.centerLat);
      if (x >= 0 && x <= dimensions.width) {
        lngLines.push({ lng: roundTo(lng, 1), x });
      }
    }

    const startLat = Math.floor((view.centerLat - 8) / stepDeg) * stepDeg;
    const endLat = Math.ceil((view.centerLat + 8) / stepDeg) * stepDeg;
    for (let lat = startLat; lat <= endLat; lat += stepDeg) {
      const [, y] = project(view.centerLng, lat);
      if (y >= 0 && y <= dimensions.height) {
        latLines.push({ lat: roundTo(lat, 1), y });
      }
    }

    return { lngLines, latLines };
  }, [view, dimensions, project]);

  const hoveredScreenPt = useMemo<[number, number] | null>(() => {
    if (hoveredDistanceKm === null || routeGeometry.coordinates.length < 2) return null;
    try {
      const line = turf.lineString(routeGeometry.coordinates);
      const total = turf.length(line, { units: 'kilometers' });
      const pt = turf.along(line, Math.max(0, Math.min(total, hoveredDistanceKm)), {
        units: 'kilometers',
      });
      const [lng, lat] = pt.geometry.coordinates as [number, number];
      return project(lng, lat);
    } catch {
      return null;
    }
  }, [hoveredDistanceKm, routeGeometry.coordinates, project]);

  const optimalStopMap = useMemo(() => {
    const map = new globalThis.Map<string, (typeof optimizationResult.stops)[0]>();
    for (const stop of optimizationResult.stops) {
      map.set(stop.station.id, stop);
    }
    return map;
  }, [optimizationResult.stops]);

  const selectedStation = useMemo(
    () => pricedStations.find((s) => s.id === selectedStationId) || null,
    [pricedStations, selectedStationId]
  );

  const originCoord = routeGeometry.coordinates[0];
  const destCoord = routeGeometry.coordinates[routeGeometry.coordinates.length - 1];
  const originPt = originCoord ? project(originCoord[0], originCoord[1]) : null;
  const destPt = destCoord ? project(destCoord[0], destCoord[1]) : null;

  return (
    <div className="relative flex-1 bg-slate-950 overflow-hidden flex flex-col select-none">
      {/* Top Floating Tactical KPI Strip */}
      <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800/90 rounded-xl p-2.5 shadow-xl">
          <div className="px-2.5 border-r border-slate-800/80">
            <div className="text-[11px] text-slate-400 whitespace-nowrap">Optimal Fuel Spend</div>
            <div className="text-base font-mono font-bold text-emerald-400 tabular-nums">
              ${optimizationResult.totalCost.toFixed(2)}
            </div>
          </div>

          <div className="px-2.5 sm:border-r border-slate-800/80">
            <div className="text-[11px] text-slate-400 whitespace-nowrap">Savings vs. Naive</div>
            <div className="text-base font-mono font-bold text-sky-400 tabular-nums whitespace-nowrap">
              +${optimizationResult.savingsVsNaive.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({optimizationResult.savingsPercent}%)
              </span>
            </div>
          </div>

          <div className="px-2.5 border-r border-slate-800/80">
            <div className="text-[11px] text-slate-400 whitespace-nowrap">Refuel Schedule</div>
            <div className="text-sm font-mono font-semibold text-slate-100 tabular-nums mt-0.5 whitespace-nowrap">
              {optimizationResult.stops.length}{' '}
              {optimizationResult.stops.length === 1 ? 'Stop' : 'Stops'} ·{' '}
              {unitSystem === 'metric'
                ? `${optimizationResult.totalFuelPurchasedLiters} L`
                : `${optimizationResult.totalFuelPurchasedGal} gal`}
            </div>
          </div>

          <div className="px-2.5">
            <div className="text-[11px] text-slate-400 whitespace-nowrap">
              {policy === 'mode_b_partial_lookahead' ? 'LP Partial Fill' : 'DP Full/Cap Fill'}
            </div>
            <div className="text-xs font-mono text-slate-300 tabular-nums mt-1 whitespace-nowrap">
              {unitSystem === 'metric'
                ? `${routeGeometry.distanceKm} km`
                : `${routeGeometry.distanceMiles} mi`}{' '}
              · Arrive {optimizationResult.arrivalFuelPercent}%
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Geospatial Corridor Canvas */}
      <div
        ref={containerRef}
        data-testid="geospatial-map-viewport"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={() => setSelectedStationId(null)}
        className={`flex-1 w-full h-full relative overflow-hidden bg-[#04091a] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Vector Cartographic SVG Layer */}
        <svg
          width={dimensions.width}
          height={dimensions.height}
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <radialGradient id="corridorGlow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#020617" stopOpacity="1" />
            </radialGradient>
            <filter id="routeGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={dimensions.width} height={dimensions.height} fill="url(#corridorGlow)" />

          {/* Graticule Lat/Lng Tactical Grid */}
          {gridLines.lngLines.map(({ lng, x }) => (
            <g key={`lng-${lng}`}>
              <line
                x1={x}
                y1={0}
                x2={x}
                y2={dimensions.height}
                stroke="#0f172a"
                strokeWidth="1"
              />
              <text
                x={x + 4}
                y={dimensions.height - 8}
                className="fill-slate-700 text-[10px] font-mono"
              >
                {lng}°
              </text>
            </g>
          ))}
          {gridLines.latLines.map(({ lat, y }) => (
            <g key={`lat-${lat}`}>
              <line
                x1={0}
                y1={y}
                x2={dimensions.width}
                y2={y}
                stroke="#0f172a"
                strokeWidth="1"
              />
              <text x={8} y={y - 4} className="fill-slate-700 text-[10px] font-mono">
                {lat}°N
              </text>
            </g>
          ))}

          {/* Reachable Detour Corridor Halo */}
          {routePathD && (
            <path
              d={routePathD}
              fill="none"
              stroke="#0ea5e9"
              strokeOpacity="0.11"
              strokeWidth={corridorPixelWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Detour Snap Connector Lines from Highway to Stations */}
          {pricedStations.map((st) => {
            const [sx, sy] = project(st.lng, st.lat);
            const [rx, ry] = project(st.snapPoint[0], st.snapPoint[1]);
            const isOpt = optimalStopMap.has(st.id);
            return (
              <line
                key={`snap-${st.id}`}
                x1={rx}
                y1={ry}
                x2={sx}
                y2={sy}
                stroke={isOpt ? '#10b981' : '#334155'}
                strokeWidth={isOpt ? '1.8' : '1'}
                strokeDasharray={isOpt ? undefined : '2 2'}
              />
            );
          })}

          {/* Primary Highway Route Polyline */}
          {routePathD && (
            <>
              <path
                d={routePathD}
                fill="none"
                stroke="#020617"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={routePathD}
                fill="none"
                stroke={optimizationResult.feasible ? '#10b981' : '#475569'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#routeGlowFilter)"
              />
            </>
          )}

          {/* Unreachable Dead Zone Red Segment Highlight */}
          {deadZonePathD && (
            <>
              <path
                d={deadZonePathD}
                fill="none"
                stroke="#f43f5e"
                strokeOpacity="0.3"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d={deadZonePathD}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="5"
                strokeDasharray="8 6"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Intermediate Waypoint Labels */}
          {waypoints.slice(1, -1).map((wp, idx) => {
            const [wx, wy] = project(wp.lng, wp.lat);
            return (
              <g key={`wp-${idx}`}>
                <circle cx={wx} cy={wy} r={4} fill="#38bdf8" stroke="#020617" strokeWidth="1.5" />
                <text
                  x={wx}
                  y={wy + 14}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {wp.label}
                </text>
              </g>
            );
          })}

          {/* Telemetry Scrubbing Live Vehicle Position Marker */}
          {hoveredScreenPt && (
            <g>
              <circle
                cx={hoveredScreenPt[0]}
                cy={hoveredScreenPt[1]}
                r={11}
                fill="#38bdf8"
                fillOpacity="0.28"
              />
              <circle
                cx={hoveredScreenPt[0]}
                cy={hoveredScreenPt[1]}
                r={5.5}
                fill="#38bdf8"
                stroke="#f8fafc"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Origin Badge */}
        {originPt && (
          <div
            style={{
              left: `${originPt[0]}px`,
              top: `${originPt[1]}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute z-10 pointer-events-none flex flex-col items-center"
          >
            <div className="px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-mono font-bold text-[11px] shadow-lg border border-slate-950 whitespace-nowrap">
              ORIGIN · {routeGeometry.originLabel.split(',')[0]}
            </div>
          </div>
        )}

        {/* Destination Badge */}
        {destPt && (
          <div
            style={{
              left: `${destPt[0]}px`,
              top: `${destPt[1]}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute z-10 pointer-events-none flex flex-col items-center"
          >
            <div className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-bold text-[11px] shadow-lg border border-slate-950 whitespace-nowrap">
              DEST · {routeGeometry.destinationLabel.split(',')[0]}
            </div>
          </div>
        )}

        {/* Interactive Candidate & Optimal Station Markers */}
        {pricedStations.map((st) => {
          const [x, y] = project(st.lng, st.lat);
          if (x < -80 || x > dimensions.width + 80 || y < -80 || y > dimensions.height + 80) {
            return null;
          }

          const optStop = optimalStopMap.get(st.id);
          const priceLabel =
            unitSystem === 'metric'
              ? `$${st.effectivePricePerLiter.toFixed(2)}`
              : `$${st.effectivePricePerGal.toFixed(2)}`;

          if (optStop) {
            return (
              <div
                key={st.id}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: 'translate(-50%, -100%)',
                }}
                className="absolute z-20"
              >
                <button
                  type="button"
                  aria-label={`Optimal Stop #${optStop.stopNumber}: ${st.name} (${priceLabel}${priceUnit})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedStationId(st.id);
                  }}
                  className="group flex flex-col items-center cursor-pointer transform hover:scale-105 transition-transform"
                >
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-mono font-bold text-xs shadow-xl border-2 border-slate-950 whitespace-nowrap">
                    <span className="px-1.5 py-0.2 rounded bg-slate-950 text-emerald-400 text-[11px]">
                      #{optStop.stopNumber}
                    </span>
                    <span>{priceLabel}</span>
                  </div>
                  <div className="w-2.5 h-2.5 rotate-45 bg-emerald-500 -mt-1 border-r border-b border-slate-950" />
                </button>
              </div>
            );
          }

          const dotColor =
            st.brandTier === 'discount'
              ? 'bg-sky-400 border-slate-950'
              : st.brandTier === 'highway_plaza'
              ? 'bg-rose-400 border-slate-950'
              : 'bg-slate-300 border-slate-950';

          return (
            <div
              key={st.id}
              style={{
                left: `${x}px`,
                top: `${y}px`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute z-10"
            >
              <button
                type="button"
                aria-label={`Candidate Station: ${st.name} (${priceLabel}${priceUnit})`}
                title={`${st.name} (${priceLabel}${priceUnit})`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStationId(st.id);
                }}
                className={`w-3.5 h-3.5 rounded-full border-2 shadow-md cursor-pointer hover:scale-125 transition-transform ${dotColor}`}
              />
            </div>
          );
        })}

        {/* Selected Station Interactive Price Override Popup */}
        {selectedStation && (() => {
          const [sx, sy] = project(selectedStation.lng, selectedStation.lat);
          const clampedX = Math.max(155, Math.min(dimensions.width - 155, sx));
          const clampedY = Math.max(85, Math.min(dimensions.height - 210, sy + 14));

          return (
            <div
              data-popup="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                left: `${clampedX}px`,
                top: `${clampedY}px`,
                transform: 'translate(-50%, 0)',
              }}
              className="absolute z-30 w-72 p-3.5 bg-slate-900/95 backdrop-blur-md text-slate-100 rounded-xl border border-slate-700 shadow-2xl space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-100">{selectedStation.name}</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {unitSystem === 'metric'
                      ? `Milepost ${selectedStation.distanceAlongRouteKm} km`
                      : `Milepost ${selectedStation.distanceAlongRouteMiles} mi`}{' '}
                    · +{selectedStation.detourTimeMinutes} min detour
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close station popup"
                  onClick={() => setSelectedStationId(null)}
                  className="text-slate-400 hover:text-slate-100 p-0.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {optimalStopMap.has(selectedStation.id) && (
                <div className="p-2 rounded bg-emerald-500/15 border border-emerald-500/40 text-xs font-mono text-emerald-300">
                  Optimal Stop #{optimalStopMap.get(selectedStation.id)?.stopNumber}: Pump +
                  {unitSystem === 'metric'
                    ? `${optimalStopMap.get(selectedStation.id)?.fuelPurchasedLiters} L`
                    : `${optimalStopMap.get(selectedStation.id)?.fuelPurchasedGal} gal`}{' '}
                  (${optimalStopMap.get(selectedStation.id)?.stepCost.toFixed(2)})
                </div>
              )}

              <div className="text-[11px] font-mono space-y-1 bg-slate-950 p-2 rounded border border-slate-800">
                <div className="flex justify-between text-slate-400">
                  <span>Zone Baseline ({selectedStation.regionZone}):</span>
                  <span>
                    $
                    {unitSystem === 'metric'
                      ? selectedStation.basePricePerLiter.toFixed(3)
                      : selectedStation.basePricePerGal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Brand ({selectedStation.brandTier}):</span>
                  <span>
                    {selectedStation.brandModifierPerLiter >= 0 ? '+' : ''}
                    {unitSystem === 'metric'
                      ? selectedStation.brandModifierPerLiter.toFixed(3)
                      : selectedStation.brandModifierPerGal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Highway Exit Markup:</span>
                  <span>
                    +
                    {unitSystem === 'metric'
                      ? selectedStation.proximityMarkupPerLiter.toFixed(3)
                      : selectedStation.proximityMarkupPerGal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="popup-price-override"
                  className="text-xs font-medium text-slate-300"
                >
                  Real-World Price ({priceUnit}):
                </label>
                <input
                  id="popup-price-override"
                  type="number"
                  step={unitSystem === 'metric' ? '0.01' : '0.05'}
                  value={
                    unitSystem === 'metric'
                      ? selectedStation.effectivePricePerLiter
                      : selectedStation.effectivePricePerGal
                  }
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v > 0) {
                      setStationPriceOverride(selectedStation.id, v);
                    }
                  }}
                  className="w-20 bg-slate-950 border border-emerald-500/70 rounded px-2 py-1 text-xs font-mono font-bold text-emerald-400 text-right"
                />
              </div>
            </div>
          );
        })()}

        {/* Bottom-Right Map Viewport Zoom & Fit Controls */}
        <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1 shadow-xl">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              setView((prev) => ({ ...prev, zoom: Math.min(13, roundTo(prev.zoom + 0.6, 2)) }))
            }
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              setView((prev) => ({ ...prev, zoom: Math.max(3.5, roundTo(prev.zoom - 0.6, 2)) }))
            }
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Fit route corridor to screen"
            onClick={fitRouteBounds}
            className="p-1.5 text-slate-300 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom-Left Map Legend */}
        <div className="absolute bottom-3 left-3 z-20 hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-950/85 border border-slate-800/90 text-[11px] font-mono text-slate-400 pointer-events-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            <span>Optimal Stop</span>
          </span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
            <span>Discount Brand</span>
          </span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
            <span>Highway Plaza</span>
          </span>
        </div>
      </div>
    </div>
  );
};
