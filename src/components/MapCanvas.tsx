import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as turf from '@turf/turf';
import { Layers, Maximize2, Minus, Plus, X } from 'lucide-react';
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

  const [basemapStyle, setBasemapStyle] = useState<'dark' | 'streets' | 'satellite'>('dark');

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

  // Visible Web Mercator Basemap Tiles
  const visibleTiles = useMemo(() => {
    if (dimensions.width <= 0 || dimensions.height <= 0) return [];
    const tileZ = Math.max(1, Math.min(18, Math.floor(view.zoom)));
    const numTiles = 1 << tileZ;
    const scale = Math.pow(2, view.zoom - tileZ);
    const tileSize = 256 * scale;

    const scaleFactor = 256 * Math.pow(2, view.zoom);
    const centerX = lngToMercatorX(view.centerLng) * scaleFactor;
    const centerY = latToMercatorY(view.centerLat) * scaleFactor;

    const worldLeft = centerX - dimensions.width / 2;
    const worldRight = centerX + dimensions.width / 2;
    const worldTop = centerY - dimensions.height / 2;
    const worldBottom = centerY + dimensions.height / 2;

    const minTileX = Math.floor(worldLeft / tileSize);
    const maxTileX = Math.floor(worldRight / tileSize);
    const minTileY = Math.max(0, Math.floor(worldTop / tileSize));
    const maxTileY = Math.min(numTiles - 1, Math.floor(worldBottom / tileSize));

    const subdomains = ['a', 'b', 'c', 'd'];
    const tiles: Array<{
      key: string;
      url: string;
      screenX: number;
      screenY: number;
      size: number;
      tileZ: number;
      wrappedX: number;
      ty: number;
    }> = [];

    const rawClientKey = (import.meta.env.VITE_CARTO_API_KEY as string | undefined)?.trim() || '';
    const cartoApiKey = rawClientKey.replace(/^["']|["']$/g, '');
    const apiKeyParam = cartoApiKey
      ? `?key=${encodeURIComponent(cartoApiKey)}&api_key=${encodeURIComponent(cartoApiKey)}`
      : '';

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const wrappedX = ((tx % numTiles) + numTiles) % numTiles;
      const screenX = Math.round(dimensions.width / 2 + (tx * tileSize - centerX));

      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const screenY = Math.round(dimensions.height / 2 + (ty * tileSize - centerY));
        const sub = subdomains[Math.abs(wrappedX + ty) % subdomains.length];

        let url = '';
        if (basemapStyle === 'streets') {
          url = cartoApiKey
            ? `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${tileZ}/${wrappedX}/${ty}@2x.png${apiKeyParam}`
            : `/api/tiles/streets/${tileZ}/${wrappedX}/${ty}.png`;
        } else if (basemapStyle === 'satellite') {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tileZ}/${ty}/${wrappedX}`;
        } else {
          // 'dark'
          url = cartoApiKey
            ? `https://${sub}.basemaps.cartocdn.com/rastertiles/dark_all/${tileZ}/${wrappedX}/${ty}@2x.png${apiKeyParam}`
            : `/api/tiles/dark/${tileZ}/${wrappedX}/${ty}.png`;
        }

        tiles.push({
          key: `${basemapStyle}-${tileZ}-${wrappedX}-${ty}`,
          url,
          screenX,
          screenY,
          size: Math.ceil(tileSize) + 1,
          tileZ,
          wrappedX,
          ty,
        });
      }
    }
    return tiles;
  }, [dimensions, view.zoom, view.centerLng, view.centerLat, basemapStyle]);

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
        {/* Real-World Cartographic Basemap Tile Layer */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none bg-[#090d16]"
          aria-hidden="true"
        >
          {visibleTiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src.includes('@2x.png')) {
                  target.src = target.src.replace('@2x.png', '.png');
                } else if (basemapStyle === 'streets' && !target.src.includes('openstreetmap.org')) {
                  target.src = `https://tile.openstreetmap.org/${tile.tileZ}/${tile.wrappedX}/${tile.ty}.png`;
                } else {
                  target.style.display = 'none';
                }
              }}
              className="absolute select-none pointer-events-none"
              style={{
                left: `${tile.screenX}px`,
                top: `${tile.screenY}px`,
                width: `${tile.size}px`,
                height: `${tile.size}px`,
                filter: basemapStyle === 'dark' ? 'contrast(1.1) brightness(1.08)' : undefined,
              }}
            />
          ))}
        </div>

        {/* Vector Cartographic SVG Layer */}
        <svg
          width={dimensions.width}
          height={dimensions.height}
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <filter id="routeGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

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

        {/* Bottom-Left Map Controls: Basemap Style Switcher & Legend */}
        <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-2">
          {/* Basemap Style Toggle */}
          <div
            role="group"
            aria-label="Basemap style"
            className="flex items-center bg-slate-950/90 border border-slate-800 rounded-lg p-0.5 shadow-xl backdrop-blur-md"
          >
            <div className="px-1.5 text-slate-500 flex items-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
            {(['dark', 'streets', 'satellite'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setBasemapStyle(style)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize cursor-pointer ${
                  basemapStyle === style
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {style}
              </button>
            ))}
          </div>

          {/* Map Legend */}
          <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800/90 text-[11px] font-mono text-slate-400 pointer-events-none backdrop-blur-md shadow-xl">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              <span>Optimal Stop</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
              <span>Discount</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
              <span>Highway Plaza</span>
            </span>
          </div>
        </div>

        {/* Small Discreet Map Tile Attribution in Bottom Right */}
        <div className="absolute bottom-1 right-14 z-10 pointer-events-none text-[9px] font-mono text-slate-500/80 bg-slate-950/60 px-1.5 py-0.5 rounded">
          {basemapStyle === 'satellite' ? '© Esri, Maxar' : '© CARTO · © OpenStreetMap'}
        </div>
      </div>
    </div>
  );
};
