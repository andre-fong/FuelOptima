import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  geocodeAddressNominatim,
  parseGoogleMapsDirectionsUrl,
} from './src/lib/geo/urlParser';
import { discoverCorridorFuelStationsDirect } from './src/lib/geo/overpass';
import type { ParsedRouteResponse, Waypoint } from './src/types/trip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resolveShortenedGoogleMapsUrl(inputUrl: string): Promise<string> {
  const trimmed = inputUrl.trim();
  const isShortLink =
    trimmed.includes('goo.gl') ||
    trimmed.includes('maps.app.goo.gl') ||
    trimmed.includes('g.co/maps');

  if (!isShortLink) {
    return trimmed;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (response.url && response.url !== trimmed && response.url.includes('/maps/')) {
      return response.url;
    }

    // Check if Google redirected to a consent/continue URL containing the real Maps URL in query params
    try {
      const respUrlObj = new URL(response.url || trimmed);
      const continueUrl =
        respUrlObj.searchParams.get('continue') || respUrlObj.searchParams.get('q');
      if (continueUrl && continueUrl.includes('/maps/')) {
        return continueUrl;
      }
    } catch {
      // Ignore URL parse error
    }

    // Fallback: inspect body for canonical Google Maps link if redirected via HTML/JS
    const html = await response.text();
    const match = html.match(/https:\/\/(?:www\.)?google\.[a-z.]+\/maps\/dir\/[^"'\s<>]+/i);
    if (match && match[0]) {
      return match[0].replace(/&amp;/g, '&');
    }

    return response.url || trimmed;
  } catch {
    return trimmed;
  }
}

async function handleParseRoute(rawUrl: string): Promise<ParsedRouteResponse> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Missing "url" parameter.');
  }

  const canonicalUrl = await resolveShortenedGoogleMapsUrl(rawUrl);
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
      const geocoded = await geocodeAddressNominatim(item.address, extracted.viewportHint);
      waypoints.push(geocoded);
    }
  }

  if (waypoints.length < 2) {
    throw new Error('Could not resolve at least two valid waypoints (Origin and Destination).');
  }

  return {
    originalUrl: rawUrl,
    canonicalUrl,
    waypoints,
    extractionStage: extracted.stage,
    warnings: extracted.warnings,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '5mb' }));

  app.post('/api/parse-route', async (req, res) => {
    try {
      const url = req.body?.url;
      const result = await handleParseRoute(url);
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to parse Google Maps Directions URL.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/parse-route', async (req, res) => {
    try {
      const url = String(req.query.url || '');
      const result = await handleParseRoute(url);
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to parse Google Maps Directions URL.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/discover-stations', async (req, res) => {
    try {
      const { route, maxDetourMinutes, fallbackCandidates } = req.body || {};
      if (!route || !Array.isArray(route.coordinates)) {
        res.status(400).json({ error: 'Invalid route geometry payload.' });
        return;
      }
      const stations = await discoverCorridorFuelStationsDirect(
        route,
        Number(maxDetourMinutes) || 20,
        fallbackCandidates
      );
      res.json({ stations });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to discover corridor fuel stations.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FuelOptima server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
