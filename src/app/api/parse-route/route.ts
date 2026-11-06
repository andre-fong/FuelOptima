import {
  geocodeAddressNominatim,
  parseGoogleMapsDirectionsUrl,
} from '../../../lib/geo/urlParser';
import type { ParsedRouteResponse, Waypoint } from '../../../types/trip';

export async function resolveAndParseGoogleMapsUrl(rawUrl: string): Promise<ParsedRouteResponse> {
  const trimmed = rawUrl.trim();
  let canonicalUrl = trimmed;

  if (
    trimmed.includes('goo.gl') ||
    trimmed.includes('maps.app.goo.gl') ||
    trimmed.includes('g.co/maps')
  ) {
    try {
      const res = await fetch(trimmed, { redirect: 'follow' });
      if (res.url) canonicalUrl = res.url;
    } catch {
      canonicalUrl = trimmed;
    }
  }

  const extracted = parseGoogleMapsDirectionsUrl(canonicalUrl);
  const waypoints: Waypoint[] = [];

  for (const item of extracted.items) {
    if (item.type === 'coordinate' && typeof item.lat === 'number' && typeof item.lng === 'number') {
      waypoints.push({
        lat: item.lat,
        lng: item.lng,
        label: item.label,
        source: 'coordinates',
      });
    } else if (item.address) {
      const wp = await geocodeAddressNominatim(item.address, extracted.viewportHint);
      waypoints.push(wp);
    }
  }

  return {
    originalUrl: rawUrl,
    canonicalUrl,
    waypoints,
    extractionStage: extracted.stage,
    warnings: extracted.warnings,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { url?: string };
    if (!body?.url) {
      return Response.json({ error: 'Missing url parameter' }, { status: 400 });
    }
    const data = await resolveAndParseGoogleMapsUrl(body.url);
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to parse URL' },
      { status: 400 }
    );
  }
}
