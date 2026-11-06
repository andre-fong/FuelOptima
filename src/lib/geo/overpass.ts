import * as turf from '@turf/turf';
import { kmToMiles, roundTo } from '../units';
import type { RawStationCandidate, RouteGeometry, RouteRegionZone } from '../../types/trip';

const OVERPASS_MIRRORS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const NON_FUEL_KEYWORDS = [
  'transmission',
  'auto repair',
  'car wash only',
  'lube',
  'mechanic',
  'collision',
  'towing',
  'body shop',
];

/**
 * Computes the maximum straight-line search radius in kilometres from the highway
 * based on the user's Max Detour Time (minutes, round-trip).
 * Formula from specification:
 * Max_Straight_Line_Radius_Km = ((Max_Detour_Minutes / 2) / 60) * 56 / 1.3
 */
export function computeMaxStraightLineRadiusKm(maxDetourMinutes: number): number {
  const oneWayHours = Math.max(1, maxDetourMinutes) / 2 / 60;
  return roundTo((oneWayHours * 56) / 1.3, 3);
}

/**
 * Computes round-trip detour distance (km) and round-trip detour time (minutes)
 * from the straight-line distance between a fuel station and its snapped point on the route.
 */
export function computeDetourMetrics(straightLineDistKm: number): {
  detourDistanceKm: number;
  detourDistanceMiles: number;
  detourTimeMinutes: number;
} {
  const detourDistanceKm = roundTo(straightLineDistKm * 1.3 * 2, 2);
  const detourDistanceMiles = roundTo(kmToMiles(detourDistanceKm), 2);
  const drivingMinutes = (detourDistanceKm / 56) * 60;
  const detourTimeMinutes = roundTo(drivingMinutes + 1.2, 1);
  return {
    detourDistanceKm,
    detourDistanceMiles,
    detourTimeMinutes,
  };
}

/**
 * Downsamples a route polyline to 1 point every `stepKm` (default 5 km) using `@turf/along`.
 */
export function downsampleRouteEveryKm(
  coordinates: [number, number][],
  stepKm: number = 5
): [number, number][] {
  const line = turf.lineString(coordinates);
  const totalKm = turf.length(line, { units: 'kilometers' });
  const points: [number, number][] = [];

  for (let d = 0; d <= totalKm; d += stepKm) {
    const pt = turf.along(line, d, { units: 'kilometers' });
    points.push(pt.geometry.coordinates as [number, number]);
  }
  const last = coordinates[coordinates.length - 1];
  points.push(last);
  return points;
}

interface RawOsmPlace {
  id: string;
  lat: number;
  lon: number;
  name: string;
  brand: string;
  operator: string;
  road?: string;
  locality?: string;
  tags: Record<string, string>;
}

/**
 * Normalize brand names from OSM station name / brand / operator tags
 */
function inferBrandAndCleanName(place: {
  rawName?: string;
  rawBrand?: string;
  rawOperator?: string;
  road?: string;
  locality?: string;
}): { brand: string; operator: string; displayName: string } {
  const combined = `${place.rawBrand || ''} ${place.rawName || ''} ${place.rawOperator || ''}`.trim();
  const lower = combined.toLowerCase();

  let brand = place.rawBrand || place.rawName || place.rawOperator || 'Independent Fuel';

  if (lower.includes('canadian tire') || lower.includes('gas+')) {
    brand = 'Canadian Tire Gas+';
  } else if (lower.includes('costco')) {
    brand = 'Costco Gasoline';
  } else if (lower.includes('pioneer')) {
    brand = 'Pioneer';
  } else if (lower.includes('ultramar')) {
    brand = 'Ultramar';
  } else if (lower.includes('petro-canada') || lower.includes('petro canada')) {
    brand = 'Petro-Canada';
  } else if (lower.includes('esso') || lower.includes('mobil')) {
    brand = 'Esso';
  } else if (lower.includes('shell')) {
    brand = 'Shell';
  } else if (lower.includes('onroute')) {
    brand = 'ONroute';
  } else if (lower.includes('chevron')) {
    brand = 'Chevron';
  } else if (lower.includes('arco')) {
    brand = 'Arco';
  } else if (lower.includes('7-eleven') || lower.includes('7 eleven')) {
    brand = '7-Eleven';
  } else if (lower.includes('circle k') || lower.includes('couche-tard')) {
    brand = 'Circle K';
  } else if (lower.includes('husky')) {
    brand = 'Husky';
  } else if (lower.includes('sunoco')) {
    brand = 'Sunoco';
  } else if (lower.includes('wawa')) {
    brand = 'Wawa';
  } else if (lower.includes('sheetz')) {
    brand = 'Sheetz';
  } else if (lower.includes('speedway')) {
    brand = 'Speedway';
  } else if (lower.includes("love's") || lower.includes('loves')) {
    brand = "Love's";
  } else if (lower.includes("buc-ee's") || lower.includes('bucees')) {
    brand = "Buc-ee's";
  }

  const operator = place.rawOperator || brand;
  const baseTitle = place.rawName && place.rawName.length > 1 ? place.rawName : brand;

  const locationParts = [place.road, place.locality].filter(Boolean);
  const locationSuffix = locationParts.length > 0 ? ` — ${locationParts.join(', ')}` : '';

  const displayName = baseTitle.toLowerCase().includes((place.road || '___').toLowerCase())
    ? baseTitle
    : `${baseTitle}${locationSuffix}`;

  return { brand, operator, displayName };
}

/**
 * Queries OpenStreetMap Nominatim's bounded `[amenity=fuel]` search across 1–3 corridor sub-boxes.
 * Returns real OpenStreetMap gas stations with street address, suburb/city, and brand tags in ~1s.
 */
async function fetchNominatimCorridorStations(
  route: RouteGeometry,
  radiusKm: number
): Promise<RawOsmPlace[]> {
  const coords = route.coordinates;
  if (coords.length < 2) return [];

  // Split route into 1 to 3 sub-segments so long routes also get rich station density
  const numSegments = route.distanceKm < 85 ? 1 : route.distanceKm < 260 ? 2 : 3;
  const padDeg = Math.min(0.06, Math.max(0.018, radiusKm / 111));

  const segmentBoxes: Array<[number, number, number, number]> = [];
  for (let s = 0; s < numSegments; s++) {
    const startIdx = Math.floor((s / numSegments) * (coords.length - 1));
    const endIdx = Math.ceil(((s + 1) / numSegments) * (coords.length - 1));
    const slice = coords.slice(startIdx, endIdx + 1);
    const line = turf.lineString(slice.length >= 2 ? slice : coords);
    const [minLng, minLat, maxLng, maxLat] = turf.bbox(line);
    segmentBoxes.push([
      minLng - padDeg,
      maxLat + padDeg,
      maxLng + padDeg,
      minLat - padDeg,
    ]);
  }

  const results = await Promise.all(
    segmentBoxes.map(async ([west, north, east, south]) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5500);
        const viewbox = `${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)},${south.toFixed(4)}`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&extratags=1&addressdetails=1&q=[amenity=fuel]&viewbox=${viewbox}&bounded=1&limit=50`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'FuelOptima-Geospatial-Planner/1.0 (https://fueloptima.org)',
            Accept: 'application/json',
          },
        });
        clearTimeout(timer);
        if (!res.ok) return [];
        const items = (await res.json()) as Array<{
          osm_id: number;
          lat: string;
          lon: string;
          name?: string;
          display_name?: string;
          extratags?: Record<string, string>;
          address?: Record<string, string>;
        }>;
        return items || [];
      } catch {
        return [];
      }
    })
  );

  const places: RawOsmPlace[] = [];
  const seenIds = new Set<string>();

  for (const batch of results) {
    for (const item of batch) {
      const id = `osm-${item.osm_id}`;
      if (seenIds.has(id)) continue;
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

      const rawName = item.name || item.extratags?.brand || item.display_name?.split(',')[0] || '';
      const lowerName = rawName.toLowerCase();
      if (NON_FUEL_KEYWORDS.some((kw) => lowerName.includes(kw))) {
        continue;
      }

      seenIds.add(id);
      const road = item.address?.road;
      const locality =
        item.address?.suburb ||
        item.address?.city ||
        item.address?.town ||
        item.address?.municipality ||
        item.address?.village;

      const { brand, operator, displayName } = inferBrandAndCleanName({
        rawName,
        rawBrand: item.extratags?.brand,
        rawOperator: item.extratags?.operator,
        road,
        locality,
      });

      places.push({
        id,
        lat,
        lon,
        name: displayName,
        brand,
        operator,
        road,
        locality,
        tags: {
          ...(item.extratags || {}),
          brand,
          amenity: 'fuel',
        },
      });
    }
  }

  return places;
}

/**
 * Queries Overpass API using a compact corridor `around` filter with proper User-Agent header.
 */
async function fetchOverpassCorridorStations(
  route: RouteGeometry,
  radiusKm: number
): Promise<RawOsmPlace[]> {
  // Keep Overpass search radius tight (max 2500m) so Overpass executes in <1.5s without timing out
  const radiusMeters = Math.min(2500, Math.max(1000, Math.round(radiusKm * 1000)));
  const stepKm = Math.max(3, Math.min(10, route.distanceKm / 15));
  const sampled = downsampleRouteEveryKm(route.coordinates, stepKm);
  const maxPts = 18;
  const stride = Math.max(1, Math.ceil(sampled.length / maxPts));
  const queryCoords = sampled.filter((_, idx) => idx % stride === 0 || idx === sampled.length - 1);

  const latLngFlat = queryCoords
    .map(([lng, lat]) => `${lat.toFixed(4)},${lng.toFixed(4)}`)
    .join(',');
  const overpassQuery = `[out:json][timeout:6];node["amenity"="fuel"](around:${radiusMeters},${latLngFlat});out body 120;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'FuelOptima-Geospatial-Planner/1.0 (https://fueloptima.org)',
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.elements) && json.elements.length > 0) {
          return json.elements
            .filter((el: any) => typeof el.lat === 'number' && typeof el.lon === 'number')
            .map((el: any) => {
              const tags = el.tags || {};
              const road = tags['addr:street'];
              const locality = tags['addr:city'] || tags['addr:suburb'];
              const { brand, operator, displayName } = inferBrandAndCleanName({
                rawName: tags.name,
                rawBrand: tags.brand,
                rawOperator: tags.operator,
                road,
                locality,
              });
              return {
                id: `osm-${el.id}`,
                lat: el.lat,
                lon: el.lon,
                name: displayName,
                brand,
                operator,
                road,
                locality,
                tags,
              };
            });
        }
      }
    } catch {
      // Try next mirror
    }
  }

  return [];
}

/**
 * Core server/node station discovery pipeline:
 * Queries Nominatim bounded `[amenity=fuel]` first (typically ~1.2s with full street/suburb metadata),
 * supplements with Overpass API if needed, snaps each station to the route polyline with
 * `@turf/nearest-point-on-line`, and computes exact 1D highway distance and round-trip detour minutes.
 */
export async function discoverCorridorFuelStationsDirect(
  route: RouteGeometry,
  maxDetourMinutes: number,
  fallbackCandidates?: RawStationCandidate[]
): Promise<RawStationCandidate[]> {
  const radiusKm = computeMaxStraightLineRadiusKm(maxDetourMinutes);

  const nominatimPlaces = await fetchNominatimCorridorStations(route, radiusKm);
  const overpassPlaces =
    nominatimPlaces.length >= 5 ? [] : await fetchOverpassCorridorStations(route, radiusKm);

  // Merge and deduplicate by coordinate proximity (< 120m)
  const mergedPlaces: RawOsmPlace[] = [...nominatimPlaces];
  for (const op of overpassPlaces) {
    const isDuplicate = mergedPlaces.some(
      (existing) =>
        Math.abs(existing.lat - op.lat) < 0.0012 && Math.abs(existing.lon - op.lon) < 0.0012
    );
    if (!isDuplicate) {
      mergedPlaces.push(op);
    }
  }

  const routeLine = turf.lineString(route.coordinates);
  const totalRouteKm = route.distanceKm;
  // Minimum buffer from very start/end: 0.15 km on urban trips, 1.0 km on long highway trips
  const edgeBufferKm = totalRouteKm < 80 ? 0.15 : 1.0;

  const candidates: RawStationCandidate[] = [];

  for (const place of mergedPlaces) {
    const pt = turf.point([place.lon, place.lat]);
    const snapped = turf.nearestPointOnLine(routeLine, pt, { units: 'kilometers' });

    const straightLineDistKm = roundTo(snapped.properties.dist ?? 0, 2);
    const distanceAlongRouteKm = roundTo(snapped.properties.location ?? 0, 2);

    if (
      distanceAlongRouteKm < edgeBufferKm ||
      distanceAlongRouteKm > totalRouteKm - edgeBufferKm
    ) {
      continue;
    }

    const { detourDistanceKm, detourDistanceMiles, detourTimeMinutes } =
      computeDetourMetrics(straightLineDistKm);

    if (detourTimeMinutes > maxDetourMinutes) {
      continue;
    }

    const isCanadian = isCoordinateInCanada(place.lat, place.lon);
    const progress = distanceAlongRouteKm / Math.max(1, totalRouteKm);
    const regionZone: RouteRegionZone =
      progress < 0.33 ? 'start' : progress < 0.67 ? 'mid' : 'end';

    candidates.push({
      id: place.id,
      name: place.name,
      brand: place.brand,
      operator: place.operator,
      lat: roundTo(place.lat, 5),
      lng: roundTo(place.lon, 5),
      distanceAlongRouteKm,
      distanceAlongRouteMiles: roundTo(kmToMiles(distanceAlongRouteKm), 2),
      snapPoint: [
        roundTo(snapped.geometry.coordinates[0], 5),
        roundTo(snapped.geometry.coordinates[1], 5),
      ],
      straightLineDistKm,
      detourDistanceKm,
      detourDistanceMiles,
      detourTimeMinutes,
      regionZone,
      isCanadian,
      tags: place.tags,
    });
  }

  candidates.sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);

  // Deduplicate only stations at virtually the same spot (< 0.25 km apart with same brand)
  const deduped: RawStationCandidate[] = [];
  for (const st of candidates) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      Math.abs(st.distanceAlongRouteKm - prev.distanceAlongRouteKm) < 0.25 &&
      st.brand.toLowerCase() === prev.brand.toLowerCase()
    ) {
      if (st.detourTimeMinutes < prev.detourTimeMinutes) {
        deduped[deduped.length - 1] = st;
      }
      continue;
    }
    deduped.push(st);
  }

  if (deduped.length > 0) {
    return deduped;
  }

  if (fallbackCandidates && fallbackCandidates.length > 0) {
    return fallbackCandidates.filter((s) => s.detourTimeMinutes <= maxDetourMinutes);
  }

  return synthesizeCorridorStations(route, maxDetourMinutes);
}

/**
 * Browser & Node entry point for discovering corridor fuel stations.
 * When running in the browser, delegates to `/api/discover-stations` so OpenStreetMap
 * Nominatim and Overpass requests include the required server-side User-Agent header.
 */
export async function discoverCorridorFuelStations(
  route: RouteGeometry,
  maxDetourMinutes: number,
  fallbackCandidates?: RawStationCandidate[]
): Promise<RawStationCandidate[]> {
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/discover-stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route,
          maxDetourMinutes,
          fallbackCandidates,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { stations?: RawStationCandidate[] };
        if (data.stations && data.stations.length > 0) {
          return data.stations;
        }
      }
    } catch {
      // Fallback to direct query if API route is unavailable
    }
  }

  return discoverCorridorFuelStationsDirect(route, maxDetourMinutes, fallbackCandidates);
}

export function isCoordinateInCanada(lat: number, lng: number): boolean {
  if (lat >= 43.4 && lng >= -83.5 && lng <= -52.0) return true;
  if (lat >= 49.0 && lng >= -140.0 && lng <= -52.0) return true;
  return false;
}

/**
 * Offline fallback station generator if all external OpenStreetMap services are unreachable.
 */
export function synthesizeCorridorStations(
  route: RouteGeometry,
  maxDetourMinutes: number
): RawStationCandidate[] {
  const line = turf.lineString(route.coordinates);
  const totalKm = route.distanceKm;
  const intervalKm = Math.max(3, Math.min(35, roundTo(totalKm / 10, 1)));
  const endMarginKm = Math.min(2, totalKm * 0.08);

  const usBrands = [
    { brand: 'Costco Gasoline', operator: 'Costco Wholesale', offKm: 1.2 },
    { brand: 'Arco', operator: 'Marathon', offKm: 0.6 },
    { brand: "Love's Travel Stop", operator: "Love's", offKm: 0.35 },
    { brand: 'Shell', operator: 'Shell', offKm: 0.25 },
    { brand: 'Chevron', operator: 'Chevron', offKm: 0.28 },
    { brand: 'Circle K', operator: 'Alimentation Couche-Tard', offKm: 0.45 },
    { brand: 'Exxon', operator: 'ExxonMobil', offKm: 0.22 },
  ];

  // Prioritize discount and standard urban/highway brands; never default to ONroute on short routes
  const caBrands = [
    { brand: 'Canadian Tire Gas+', operator: 'Canadian Tire', offKm: 0.65 },
    { brand: 'Pioneer', operator: 'Parkland Corp', offKm: 0.75 },
    { brand: 'Costco Gasoline', operator: 'Costco Wholesale', offKm: 1.3 },
    { brand: 'Ultramar', operator: 'Parkland Corp', offKm: 0.55 },
    { brand: 'Petro-Canada', operator: 'Suncor Energy', offKm: 0.3 },
    { brand: 'Esso', operator: 'Imperial Oil', offKm: 0.28 },
    { brand: 'Shell', operator: 'Shell Canada', offKm: 0.35 },
  ];

  const stations: RawStationCandidate[] = [];
  let idx = 0;

  for (let distKm = intervalKm; distKm < totalKm - endMarginKm; distKm += intervalKm) {
    const snappedPt = turf.along(line, distKm, { units: 'kilometers' });
    const [snapLng, snapLat] = snappedPt.geometry.coordinates as [number, number];
    const isCanadian = isCoordinateInCanada(snapLat, snapLng);
    const pool = isCanadian ? caBrands : usBrands;
    const spec = pool[idx % pool.length];
    idx++;

    const straightLineDistKm = spec.offKm;
    const { detourDistanceKm, detourDistanceMiles, detourTimeMinutes } =
      computeDetourMetrics(straightLineDistKm);

    if (detourTimeMinutes > maxDetourMinutes) continue;

    const sign = idx % 2 === 0 ? 1 : -1;
    const latOffset = (straightLineDistKm / 111) * sign;
    const lngOffset = (straightLineDistKm / 85) * -sign;

    const progress = distKm / Math.max(1, totalKm);
    const regionZone: RouteRegionZone =
      progress < 0.33 ? 'start' : progress < 0.67 ? 'mid' : 'end';

    stations.push({
      id: `corridor-st-${idx}-${Math.round(distKm * 10)}`,
      name: `${spec.brand} (${roundTo(distKm, 1)} km mark)`,
      brand: spec.brand,
      operator: spec.operator,
      lat: roundTo(snapLat + latOffset, 5),
      lng: roundTo(snapLng + lngOffset, 5),
      distanceAlongRouteKm: roundTo(distKm, 2),
      distanceAlongRouteMiles: roundTo(kmToMiles(distKm), 2),
      snapPoint: [roundTo(snapLng, 5), roundTo(snapLat, 5)],
      straightLineDistKm,
      detourDistanceKm,
      detourDistanceMiles,
      detourTimeMinutes,
      regionZone,
      isCanadian,
      tags: {
        brand: spec.brand,
        operator: spec.operator,
        amenity: 'fuel',
      },
    });
  }

  return stations;
}
