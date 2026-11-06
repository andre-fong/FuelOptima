import type { Waypoint } from '../../types/trip';

export interface ExtractedUrlData {
  stage: 'stage_a_coordinates' | 'stage_b_addresses' | 'hybrid';
  items: Array<{
    type: 'coordinate' | 'address';
    lat?: number;
    lng?: number;
    address?: string;
    label: string;
  }>;
  viewportHint?: { lat: number; lng: number };
  warnings: string[];
}

const KNOWN_CITY_COORDINATES: Record<string, { lat: number; lng: number; label: string }> = {
  'toronto': { lat: 43.6453, lng: -79.3806, label: 'Toronto, ON (Union Station)' },
  'union station, toronto': { lat: 43.6453, lng: -79.3806, label: 'Toronto, ON (Union Station)' },
  'union station, toronto, on': { lat: 43.6453, lng: -79.3806, label: 'Toronto, ON (Union Station)' },
  'toronto, on': { lat: 43.6532, lng: -79.3832, label: 'Toronto, ON' },
  'montreal': { lat: 45.5017, lng: -73.5673, label: 'Montreal, QC (Downtown)' },
  'montreal, qc': { lat: 45.5017, lng: -73.5673, label: 'Montreal, QC (Downtown)' },
  'kingston, on': { lat: 44.2312, lng: -76.486, label: 'Kingston, ON' },
  'ottawa': { lat: 45.4215, lng: -75.6972, label: 'Ottawa, ON' },
  'ottawa, on': { lat: 45.4215, lng: -75.6972, label: 'Ottawa, ON' },
  'new york': { lat: 40.7128, lng: -74.006, label: 'New York, NY' },
  'new york, ny': { lat: 40.7128, lng: -74.006, label: 'New York, NY' },
  'syracuse, ny': { lat: 43.0481, lng: -76.1474, label: 'Syracuse, NY' },
  'buffalo, ny': { lat: 42.8864, lng: -78.8784, label: 'Buffalo, NY' },
  'los angeles': { lat: 34.0522, lng: -118.2437, label: 'Los Angeles, CA' },
  'los angeles, ca': { lat: 34.0522, lng: -118.2437, label: 'Los Angeles, CA' },
  'las vegas': { lat: 36.1699, lng: -115.1398, label: 'Las Vegas, NV' },
  'las vegas, nv': { lat: 36.1699, lng: -115.1398, label: 'Las Vegas, NV' },
  'barstow, ca': { lat: 34.8958, lng: -117.0173, label: 'Barstow, CA' },
  'san francisco': { lat: 37.7749, lng: -122.4194, label: 'San Francisco, CA' },
  'san francisco, ca': { lat: 37.7749, lng: -122.4194, label: 'San Francisco, CA' },
  'chicago': { lat: 41.8781, lng: -87.6298, label: 'Chicago, IL' },
  'chicago, il': { lat: 41.8781, lng: -87.6298, label: 'Chicago, IL' },
  'vancouver': { lat: 49.2827, lng: -123.1207, label: 'Vancouver, BC' },
  'vancouver, bc': { lat: 49.2827, lng: -123.1207, label: 'Vancouver, BC' },
  'calgary': { lat: 51.0447, lng: -114.0719, label: 'Calgary, AB' },
  'calgary, ab': { lat: 51.0447, lng: -114.0719, label: 'Calgary, AB' },
  'edmonton': { lat: 53.5461, lng: -113.4938, label: 'Edmonton, AB' },
  'edmonton, ab': { lat: 53.5461, lng: -113.4938, label: 'Edmonton, AB' },
  'winnipeg': { lat: 49.8951, lng: -97.1384, label: 'Winnipeg, MB' },
  'winnipeg, mb': { lat: 49.8951, lng: -97.1384, label: 'Winnipeg, MB' },
  'quebec city': { lat: 46.8139, lng: -71.208, label: 'Quebec City, QC' },
  'quebec, qc': { lat: 46.8139, lng: -71.208, label: 'Quebec City, QC' },
  'halifax': { lat: 44.6488, lng: -63.5752, label: 'Halifax, NS' },
  'halifax, ns': { lat: 44.6488, lng: -63.5752, label: 'Halifax, NS' },
  'seattle': { lat: 47.6062, lng: -122.3321, label: 'Seattle, WA' },
  'seattle, wa': { lat: 47.6062, lng: -122.3321, label: 'Seattle, WA' },
  'miami': { lat: 25.7617, lng: -80.1918, label: 'Miami, FL' },
  'miami, fl': { lat: 25.7617, lng: -80.1918, label: 'Miami, FL' },
  'austin': { lat: 30.2672, lng: -97.7431, label: 'Austin, TX' },
  'austin, tx': { lat: 30.2672, lng: -97.7431, label: 'Austin, TX' },
  'dallas': { lat: 32.7767, lng: -96.797, label: 'Dallas, TX' },
  'dallas, tx': { lat: 32.7767, lng: -96.797, label: 'Dallas, TX' },
  'houston': { lat: 29.7604, lng: -95.3698, label: 'Houston, TX' },
  'houston, tx': { lat: 29.7604, lng: -95.3698, label: 'Houston, TX' },
  'boston': { lat: 42.3601, lng: -71.0589, label: 'Boston, MA' },
  'boston, ma': { lat: 42.3601, lng: -71.0589, label: 'Boston, MA' },
  'detroit': { lat: 42.3314, lng: -83.0458, label: 'Detroit, MI' },
  'detroit, mi': { lat: 42.3314, lng: -83.0458, label: 'Detroit, MI' },
};

/**
 * Extracts ordered waypoint coordinates from a Google Maps `data=!...` block.
 * Handles both `!1d<lng>!2d<lat>` and `!3d<lat>!4d<lng>` tokens in sequence,
 * deduplicating adjacent pairs that refer to the same waypoint.
 */
export function extractCoordsFromDataBlock(dataBlock: string): Array<{ lat: number; lng: number }> {
  if (!dataBlock) return [];

  const tokenRegex = /(?:!1d(-?\d+\.\d+)!2d(-?\d+\.\d+))|(?:!3d(-?\d+\.\d+)!4d(-?\d+\.\d+))/g;
  const rawCoords: Array<{ lat: number; lng: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(dataBlock)) !== null) {
    let lat: number;
    let lng: number;
    if (match[1] !== undefined && match[2] !== undefined) {
      lng = parseFloat(match[1]);
      lat = parseFloat(match[2]);
    } else {
      lat = parseFloat(match[3]);
      lng = parseFloat(match[4]);
    }

    if (isValidLatLng(lat, lng)) {
      const prev = rawCoords[rawCoords.length - 1];
      // Deduplicate if Google emitted both !1d!2d and !3d!4d for the exact same stop
      if (!prev || Math.abs(prev.lat - lat) > 0.0005 || Math.abs(prev.lng - lng) > 0.0005) {
        rawCoords.push({ lat, lng });
      }
    }
  }

  return rawCoords;
}

/**
 * Parses a canonical Google Maps Directions URL using multi-stage extraction.
 * Stage A: Explicit coordinate pairs from `/dir/lat,lng/...` or `!1d<lng>!2d<lat>` / `!3d<lat>!4d<lng>` data blocks
 * Stage B: URL-decoded place names/addresses from `/dir/Origin/Destination/` path segments or query parameters
 */
export function parseGoogleMapsDirectionsUrl(rawUrl: string): ExtractedUrlData {
  const warnings: string[] = [];
  const trimmed = rawUrl.trim();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format. Please provide a valid Google Maps Directions URL.');
  }

  // Extract optional @lat,lng viewport hint if present anywhere in the URL
  let viewportHint: { lat: number; lng: number } | undefined;
  const viewportMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (viewportMatch) {
    const vLat = parseFloat(viewportMatch[1]);
    const vLng = parseFloat(viewportMatch[2]);
    if (isValidLatLng(vLat, vLng)) {
      viewportHint = { lat: vLat, lng: vLng };
    }
  }

  // Check query parameters first (e.g., ?api=1&origin=...&destination=...&waypoints=... or ?saddr=...&daddr=...)
  const originParam = parsedUrl.searchParams.get('origin') || parsedUrl.searchParams.get('saddr');
  const destParam =
    parsedUrl.searchParams.get('destination') || parsedUrl.searchParams.get('daddr');
  const waypointsParam = parsedUrl.searchParams.get('waypoints');

  if (originParam && destParam) {
    const rawStops = [
      originParam,
      ...(waypointsParam ? waypointsParam.split('|').filter(Boolean) : []),
      destParam,
    ];
    const items = rawStops.map((stop) => classifyStopSegment(stop));
    const hasCoords = items.some((i) => i.type === 'coordinate');
    const hasAddr = items.some((i) => i.type === 'address');
    return {
      stage:
        hasCoords && hasAddr ? 'hybrid' : hasCoords ? 'stage_a_coordinates' : 'stage_b_addresses',
      items,
      viewportHint,
      warnings,
    };
  }

  // Extract `/maps/dir/...` or `/dir/...` path segments
  const pathname = parsedUrl.pathname;
  const dirMatch = pathname.match(/\/(?:maps\/)?dir\/(.+)$/i);

  const pathLabels: string[] = [];
  let dataBlock = '';

  if (dirMatch && dirMatch[1]) {
    const rawSegments = dirMatch[1].split('/').filter(Boolean);
    for (const seg of rawSegments) {
      let decoded = seg;
      try {
        decoded = decodeURIComponent(seg.replace(/\+/g, ' ')).trim();
      } catch {
        decoded = seg.replace(/\+/g, ' ').trim();
      }
      if (!decoded || decoded === "''" || decoded === '""') continue;
      if (decoded.startsWith('@')) {
        continue;
      }
      if (decoded.startsWith('data=') || decoded.startsWith('!')) {
        dataBlock += decoded;
        continue;
      }
      if (decoded.startsWith('am=t')) continue;
      pathLabels.push(decoded);
    }
  }

  // Also check if dataBlock is in query or hash
  if (!dataBlock && parsedUrl.search.includes('!1d')) {
    dataBlock = parsedUrl.search;
  }

  const dataCoords = extractCoordsFromDataBlock(dataBlock);

  // Case 1: dataCoords count matches pathLabels count (or pathLabels is empty and dataCoords >= 2)
  if (
    dataCoords.length >= 2 &&
    (pathLabels.length === 0 || dataCoords.length === pathLabels.length)
  ) {
    const items = dataCoords.map((coord, idx) => ({
      type: 'coordinate' as const,
      lat: coord.lat,
      lng: coord.lng,
      label: pathLabels[idx] || `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`,
    }));
    return {
      stage: 'stage_a_coordinates',
      items,
      viewportHint,
      warnings,
    };
  }

  // Case 2: Hybrid path segments + dataBlock coordinates!
  // When a user mixes raw coordinate waypoints (e.g. `43.9071808,-79.2501295`) and named place
  // waypoints (e.g. `University of Toronto, 27 King's College Cir...`) in `/dir/...`, Google Maps
  // only emits `!1d<lng>!2d<lat>` in `data=!` for the named place waypoints.
  if (pathLabels.length >= 2 && dataCoords.length > 0) {
    const classified = pathLabels.map((seg) => classifyStopSegment(seg));
    const addressCount = classified.filter((c) => c.type === 'address').length;

    if (addressCount === dataCoords.length) {
      let coordCursor = 0;
      const items = classified.map((item) => {
        if (item.type === 'address') {
          const matchedCoord = dataCoords[coordCursor++];
          return {
            type: 'coordinate' as const,
            lat: matchedCoord.lat,
            lng: matchedCoord.lng,
            label: item.label,
          };
        }
        return item;
      });
      return {
        stage: 'stage_a_coordinates',
        items,
        viewportHint,
        warnings,
      };
    }
  }

  // Case 3: Classify pathLabels directly (Stage A explicit lat,lng in path or Stage B text addresses)
  if (pathLabels.length >= 2) {
    const items = pathLabels.map((seg) => classifyStopSegment(seg));
    const hasCoords = items.some((i) => i.type === 'coordinate');
    const hasAddr = items.some((i) => i.type === 'address');
    return {
      stage:
        hasCoords && hasAddr ? 'hybrid' : hasCoords ? 'stage_a_coordinates' : 'stage_b_addresses',
      items,
      viewportHint,
      warnings,
    };
  }

  // Case 4: Even if pathLabels had < 2 items, if dataCoords has >= 2 coordinates, use them
  if (dataCoords.length >= 2) {
    const items = dataCoords.map((coord, idx) => ({
      type: 'coordinate' as const,
      lat: coord.lat,
      lng: coord.lng,
      label: pathLabels[idx] || `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`,
    }));
    return {
      stage: 'stage_a_coordinates',
      items,
      viewportHint,
      warnings,
    };
  }

  throw new Error(
    'Could not extract at least two route waypoints (Origin and Destination) from this Google Maps URL.'
  );
}

function classifyStopSegment(segment: string): {
  type: 'coordinate' | 'address';
  lat?: number;
  lng?: number;
  address?: string;
  label: string;
} {
  const cleaned = segment.trim();
  const coordMatch = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return {
        type: 'coordinate',
        lat,
        lng,
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      };
    }
  }
  return {
    type: 'address',
    address: cleaned,
    label: cleaned,
  };
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Generates progressive, simplified query candidates from a complex Google Maps place/address string.
 */
export function buildGeocodeQueryCandidates(rawAddress: string): string[] {
  const candidates: string[] = [];
  const addCandidate = (q: string) => {
    const norm = q.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
    if (norm.length >= 2 && !candidates.includes(norm)) {
      candidates.push(norm);
    }
  };

  // 1. Remove Google Maps Plus Codes (e.g. "89C2+45 " or "M5V+2H ")
  const cleaned = rawAddress
    .replace(/\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  addCandidate(cleaned);

  // 2. Strip Canadian Postal Codes (e.g. "M5V 3L9" or "M5V3L9") and US ZIP+4 ("14202-1234")
  const withoutPostal = cleaned
    .replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi, '')
    .replace(/\b\d{5}-\d{4}\b/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,+/g, ',')
    .trim();
  addCandidate(withoutPostal);

  // 3. Strip Suite / Unit / Apt / Floor / Building tokens
  const withoutUnit = withoutPostal
    .replace(
      /\b(?:suite|ste|unit|apt|apartment|fl|floor|bldg|building|rm|room)\s*#?[a-z0-9-]+\b/gi,
      ''
    )
    .replace(/#[a-z0-9-]+\b/gi, '')
    .replace(/\bAve\./gi, 'Ave')
    .replace(/\bSt\./gi, 'St')
    .replace(/\bBlvd\./gi, 'Blvd')
    .replace(/\bRd\./gi, 'Rd')
    .replace(/\bDr\./gi, 'Dr')
    .replace(/\bCir\b/gi, 'Circle')
    .replace(/\bHwy\b/gi, 'Highway')
    .replace(/\s+,/g, ',')
    .replace(/,+/g, ',')
    .trim();
  addCandidate(withoutUnit);

  // 4. Split by comma to handle "POI Name, Street Address, City, Province/State, Country"
  const parts = withoutUnit
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    // 4a. Drop leading POI/Business name -> keep "Street Address, City, Province/State, Country"
    addCandidate(parts.slice(1).join(', '));

    // 4b. Keep leading POI/Business name + City/Province (drop middle street address)
    addCandidate([parts[0], ...parts.slice(2)].join(', '));

    // 4c. Keep last 3 parts (usually Street/Area, City, State/Province or City, State, Country)
    addCandidate(parts.slice(-3).join(', '));

    // 4d. Keep last 2 parts (usually City, State/Province)
    addCandidate(parts.slice(-2).join(', '));
  } else if (parts.length === 2) {
    if (parts[0].includes(' - ')) {
      const sub = parts[0].split(' - ').map((s) => s.trim());
      addCandidate(`${sub[0]}, ${parts[1]}`);
      addCandidate(`${sub[sub.length - 1]}, ${parts[1]}`);
    }
    addCandidate(parts[1]);
  }

  return candidates;
}

async function queryPhotonGeocoder(
  query: string,
  bias?: { lat: number; lng: number }
): Promise<{ lat: number; lng: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
    if (bias && isValidLatLng(bias.lat, bias.lng)) {
      url += `&lat=${bias.lat.toFixed(4)}&lon=${bias.lng.toFixed(4)}`;
    }
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FuelOptima-Geospatial-Optimizer/1.0',
        Accept: 'application/json',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
      }>;
    };

    const coords = data.features?.[0]?.geometry?.coordinates;
    if (coords && coords.length >= 2) {
      const [lng, lat] = coords;
      if (isValidLatLng(lat, lng)) {
        return { lat, lng };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function queryNominatimSingle(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FuelOptima-Geospatial-Optimizer/1.0 (https://fueloptima.local)',
        Accept: 'application/json',
      },
    });
    clearTimeout(timer);
    if (!response.ok) return null;

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
    }>;

    if (results && results.length > 0) {
      const lat = parseFloat(results[0].lat);
      const lng = parseFloat(results[0].lon);
      if (isValidLatLng(lat, lng)) {
        return { lat, lng };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function queryOpenMeteoGeocoder(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query
    )}&count=1&language=en&format=json`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      results?: Array<{ latitude: number; longitude: number }>;
    };
    const first = data.results?.[0];
    if (first && isValidLatLng(first.latitude, first.longitude)) {
      return { lat: first.latitude, lng: first.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves a text address or Google Maps place label to [lat, lng] using:
 * 1. Exact city name match
 * 2. Progressive query simplification (stripping postal codes, unit numbers, POI prefixes)
 * 3. Multi-provider open-source geocoding (Photon OSM -> Nominatim OSM -> Open-Meteo)
 */
export async function geocodeAddressNominatim(
  address: string,
  viewportHint?: { lat: number; lng: number }
): Promise<Waypoint> {
  const norm = address.toLowerCase().trim();
  if (KNOWN_CITY_COORDINATES[norm]) {
    const hit = KNOWN_CITY_COORDINATES[norm];
    return {
      lat: hit.lat,
      lng: hit.lng,
      label: address,
      source: 'geocoded',
    };
  }

  const candidates = buildGeocodeQueryCandidates(address);

  // Try Photon OSM first on top candidates (fast, handles POI + address + postal code gracefully)
  for (const cand of candidates.slice(0, 4)) {
    const photonHit = await queryPhotonGeocoder(cand, viewportHint);
    if (photonHit) {
      return {
        lat: photonHit.lat,
        lng: photonHit.lng,
        label: address,
        source: 'geocoded',
      };
    }
  }

  // Try Nominatim across progressive simplified candidates
  for (const cand of candidates) {
    const nomHit = await queryNominatimSingle(cand);
    if (nomHit) {
      return {
        lat: nomHit.lat,
        lng: nomHit.lng,
        label: address,
        source: 'geocoded',
      };
    }
  }

  // Check if a simplified city candidate matches our dictionary
  for (const cand of candidates) {
    const key = cand.toLowerCase();
    if (KNOWN_CITY_COORDINATES[key]) {
      const hit = KNOWN_CITY_COORDINATES[key];
      return {
        lat: hit.lat,
        lng: hit.lng,
        label: address,
        source: 'geocoded',
      };
    }
  }

  // Try Open-Meteo Geocoding on simplified locality candidates
  for (const cand of candidates.slice(-3)) {
    const cityOnly = cand.split(',')[0].trim();
    const meteoHit =
      (await queryOpenMeteoGeocoder(cand)) || (await queryOpenMeteoGeocoder(cityOnly));
    if (meteoHit) {
      return {
        lat: meteoHit.lat,
        lng: meteoHit.lng,
        label: address,
        source: 'geocoded',
      };
    }
  }

  throw new Error(`No coordinates found for location "${address}".`);
}
