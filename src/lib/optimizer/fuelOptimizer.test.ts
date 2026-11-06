import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gallonsToLiters,
  kmToMiles,
  l100kmToMpg,
  litersToGallons,
  milesToKm,
  mpgToL100km,
} from '../units';
import {
  buildGeocodeQueryCandidates,
  extractCoordsFromDataBlock,
  parseGoogleMapsDirectionsUrl,
} from '../geo/urlParser';
import { computeStationPrices, evaluateBrandHeuristics } from '../pricing/pricingEngine';
import { optimizeRefuelingSchedule } from './fuelOptimizer';
import type { PricingConfig, RawStationCandidate } from '../../types/trip';

test('unit conversions are mathematically reversible and accurate', () => {
  assert.ok(Math.abs(kmToMiles(milesToKm(100)) - 100) < 1e-6);
  assert.ok(Math.abs(litersToGallons(gallonsToLiters(15.8)) - 15.8) < 1e-6);
  assert.ok(Math.abs(l100kmToMpg(mpgToL100km(35)) - 35) < 1e-6);
  // 235.214583 / 35 MPG = 6.7204 L/100km
  assert.ok(Math.abs(mpgToL100km(35) - 6.72) < 0.01);
});

test('Google Maps URL parser extracts Stage A coordinates, mixed !1d!2d/!3d!4d, and Stage B addresses', () => {
  const stageB = parseGoogleMapsDirectionsUrl(
    'https://www.google.com/maps/dir/Union+Station,+Toronto,+ON/Montreal,+QC/@44.5,-76.5,8z'
  );
  assert.equal(stageB.stage, 'stage_b_addresses');
  assert.equal(stageB.items.length, 2);
  assert.equal(stageB.items[0].address, 'Union Station, Toronto, ON');
  assert.equal(stageB.items[1].address, 'Montreal, QC');
  assert.deepEqual(stageB.viewportHint, { lat: 44.5, lng: -76.5 });

  const stageA = parseGoogleMapsDirectionsUrl(
    'https://www.google.com/maps/dir/Toronto,+ON/Montreal,+QC/data=!4m14!4m13!1m5!1m1!1s0x0:0x0!2m2!1d-79.3806!2d43.6453!1m5!1m1!1s0x0:0x0!2m2!1d-73.5673!2d45.5017'
  );
  assert.equal(stageA.stage, 'stage_a_coordinates');
  assert.equal(stageA.items.length, 2);
  assert.equal(stageA.items[0].lat, 43.6453);
  assert.equal(stageA.items[0].lng, -79.3806);
  assert.equal(stageA.items[1].lat, 45.5017);
  assert.equal(stageA.items[1].lng, -73.5673);

  // Deduplicates when Google emits both !1d!2d and !3d!4d for the same stop
  const deduped = extractCoordsFromDataBlock(
    '!1m5!2m2!1d-79.3806!2d43.6453!3d43.64531!4d-79.38061!1m5!3d45.5017!4d-73.5673'
  );
  assert.equal(deduped.length, 2);

  // Hybrid URL where first waypoint is raw coordinates and second waypoint is named place with !1d!2d in data=
  const hybridUrl =
    "https://www.google.com/maps/dir/43.9071808,-79.2501295/University+of+Toronto,+27+King's+College+Cir,+Toronto,+ON+M5S+1A1/@43.7875701,-79.5135909,11z/data=!3m1!4b1!4m12!4m11!1m1!4e1!1m5!1m1!1s0x882b34b8f331fd9b:0x8d1d9bb6765a76f7!2m2!1d-79.3958273!2d43.663487!2m1!2b1!3e0?entry=ttu";
  const parsedHybrid = parseGoogleMapsDirectionsUrl(hybridUrl);
  assert.equal(parsedHybrid.stage, 'stage_a_coordinates');
  assert.equal(parsedHybrid.items.length, 2);
  assert.equal(parsedHybrid.items[0].lat, 43.9071808);
  assert.equal(parsedHybrid.items[0].lng, -79.2501295);
  assert.equal(parsedHybrid.items[1].lat, 43.663487);
  assert.equal(parsedHybrid.items[1].lng, -79.3958273);
});

test('buildGeocodeQueryCandidates progressively simplifies complex Google Maps POI + postal code strings', () => {
  const candidates = buildGeocodeQueryCandidates(
    'Costco Wholesale, 1411 Warden Ave. Suite 200, Scarborough, ON M1R 2S3, Canada'
  );
  // Should include version stripped of Canadian postal code M1R 2S3 and Suite 200
  assert.ok(
    candidates.some((c) => c === '1411 Warden Ave, Scarborough, ON, Canada'),
    `Expected simplified street address without POI prefix or postal code, got: ${JSON.stringify(
      candidates
    )}`
  );
  assert.ok(
    candidates.some((c) => c === 'Costco Wholesale, Scarborough, ON, Canada'),
    'Expected POI + City fallback candidate'
  );
  assert.ok(
    candidates.some((c) => c === 'Scarborough, ON, Canada'),
    'Expected City + Province fallback candidate'
  );
});

test('Canadian and US brand pricing heuristics apply expected modifiers', () => {
  const onroute = evaluateBrandHeuristics(
    'ONroute',
    'ONroute Plaza',
    'ONroute Mallorytown',
    true,
    true,
    true
  );
  assert.equal(onroute.brandTier, 'highway_plaza');
  assert.equal(onroute.modifierPerLiter, 0.06);

  const caCostco = evaluateBrandHeuristics(
    'Costco',
    'Costco Wholesale',
    'Costco Kingston',
    true,
    true,
    true
  );
  assert.equal(caCostco.brandTier, 'discount');
  assert.equal(caCostco.modifierPerLiter, -0.07);

  const usCostco = evaluateBrandHeuristics(
    'Costco',
    'Costco Wholesale',
    'Costco Victorville',
    false,
    true,
    true
  );
  assert.equal(usCostco.brandTier, 'discount');
  assert.equal(usCostco.modifierPerGal, -0.2);
});

const SAMPLE_ROUTE_COORDS: [number, number][] = [
  [-79.3806, 43.6453],
  [-77.5, 44.1],
  [-76.486, 44.2312],
  [-75.0, 44.9],
  [-73.5673, 45.5017],
];

const MOCK_CANDIDATES: RawStationCandidate[] = [
  {
    id: 'st-expensive-120',
    name: 'ONroute Port Hope (Expensive)',
    brand: 'ONroute',
    operator: 'ONroute',
    lat: 43.98,
    lng: -78.3,
    distanceAlongRouteKm: 110,
    distanceAlongRouteMiles: 68.35,
    snapPoint: [-78.3, 43.98],
    straightLineDistKm: 0.1,
    detourDistanceKm: 0.26,
    detourDistanceMiles: 0.16,
    detourTimeMinutes: 1.5,
    regionZone: 'start',
    isCanadian: true,
    tags: {},
  },
  {
    id: 'st-cheap-260',
    name: 'Costco Kingston (Cheap)',
    brand: 'Costco',
    operator: 'Costco Wholesale',
    lat: 44.26,
    lng: -76.55,
    distanceAlongRouteKm: 255,
    distanceAlongRouteMiles: 158.45,
    snapPoint: [-76.55, 44.25],
    straightLineDistKm: 1.5,
    detourDistanceKm: 3.9,
    detourDistanceMiles: 2.42,
    detourTimeMinutes: 5.4,
    regionZone: 'mid',
    isCanadian: true,
    tags: {},
  },
  {
    id: 'st-mid-410',
    name: 'Ultramar Cornwall',
    brand: 'Ultramar',
    operator: 'Parkland',
    lat: 45.02,
    lng: -74.73,
    distanceAlongRouteKm: 420,
    distanceAlongRouteMiles: 260.98,
    snapPoint: [-74.73, 45.01],
    straightLineDistKm: 0.8,
    detourDistanceKm: 2.08,
    detourDistanceMiles: 1.29,
    detourTimeMinutes: 3.4,
    regionZone: 'end',
    isCanadian: true,
    tags: {},
  },
];

const DEFAULT_PRICING_CONFIG: PricingConfig = {
  useZonePricing: false,
  baselinePricePerGal: 3.55,
  baselinePricePerLiter: 1.58,
  zonePricesPerGal: { start: 3.5, mid: 3.55, end: 3.65 },
  zonePricesPerLiter: { start: 1.55, mid: 1.58, end: 1.68 },
  enableBrandHeuristics: true,
  enableProximityMarkup: true,
  enableCanadianHeuristics: true,
};

test('Mode B (Partial Fill Lookahead) buys partial fuel at expensive station to reach cheaper station ahead', () => {
  const pricedStations = computeStationPrices(
    MOCK_CANDIDATES,
    DEFAULT_PRICING_CONFIG,
    'metric',
    {}
  );

  // Tank = 50 L, consumption = 8.0 L/100km, start with 32% (16 L) -> can reach st-expensive-120 (burns 8.8 L, arrives with 7.2 L >= 5 L reserve)
  // Cannot reach st-cheap-260 directly from start (255 km burns 20.4 L > 16 L).
  // At st-expensive-120, Mode B should buy ONLY enough fuel to reach st-cheap-260 with 10% (5 L) reserve!
  const result = optimizeRefuelingSchedule({
    totalDistanceKm: 542,
    routeCoordinates: SAMPLE_ROUTE_COORDS,
    tankCapacityLiters: 50,
    fuelEconomyL100km: 8.0,
    initialFuelPercent: 32,
    minStopReservePercent: 10,
    targetArrivalReservePercent: 25,
    maxDetourMinutes: 25,
    maxDollarPerStop: null,
    detourCostWeightPerMinute: 0,
    policy: 'mode_b_partial_lookahead',
    unitSystem: 'metric',
    stations: pricedStations,
  });

  assert.equal(result.feasible, true);
  assert.ok(result.stops.length >= 2);
  // First stop is ONroute (expensive), and it should do a partial fill ('cheaper_station_ahead') rather than filling to 50 L
  const firstStop = result.stops[0];
  assert.equal(firstStop.station.id, 'st-expensive-120');
  assert.equal(firstStop.policyReason, 'cheaper_station_ahead');
  assert.ok(firstStop.departureFuelLiters < 30, 'Should partial-fill at expensive ONroute');

  // Second stop is Costco Kingston (cheap)
  const secondStop = result.stops[1];
  assert.equal(secondStop.station.id, 'st-cheap-260');
});

test('Mode A (Fill-to-Full DP) fills tank to capacity and respects Mode B cost advantage', () => {
  const pricedStations = computeStationPrices(
    MOCK_CANDIDATES,
    DEFAULT_PRICING_CONFIG,
    'metric',
    {}
  );

  const modeA = optimizeRefuelingSchedule({
    totalDistanceKm: 542,
    routeCoordinates: SAMPLE_ROUTE_COORDS,
    tankCapacityLiters: 50,
    fuelEconomyL100km: 8.0,
    initialFuelPercent: 32,
    minStopReservePercent: 10,
    targetArrivalReservePercent: 25,
    maxDetourMinutes: 25,
    maxDollarPerStop: null,
    detourCostWeightPerMinute: 0,
    policy: 'mode_a_fill_or_cap',
    unitSystem: 'metric',
    stations: pricedStations,
  });

  const modeB = optimizeRefuelingSchedule({
    totalDistanceKm: 542,
    routeCoordinates: SAMPLE_ROUTE_COORDS,
    tankCapacityLiters: 50,
    fuelEconomyL100km: 8.0,
    initialFuelPercent: 32,
    minStopReservePercent: 10,
    targetArrivalReservePercent: 25,
    maxDetourMinutes: 25,
    maxDollarPerStop: null,
    detourCostWeightPerMinute: 0,
    policy: 'mode_b_partial_lookahead',
    unitSystem: 'metric',
    stations: pricedStations,
  });

  assert.equal(modeA.feasible, true);
  assert.ok(modeA.stops.length >= 1);
  assert.equal(modeA.stops[0].policyReason, 'fill_to_capacity');
  assert.ok(
    modeB.totalCost <= modeA.totalCost,
    `Mode B (${modeB.totalCost}) should cost less than or equal to Mode A (${modeA.totalCost})`
  );
});

test('Optimizer returns structured UnreachableSegmentError when corridor has a Dead Zone gap exceeding vehicle range', () => {
  const pricedStations = computeStationPrices(
    [MOCK_CANDIDATES[0]], // Only one station at 110 km, then 432 km gap to 542 km destination
    DEFAULT_PRICING_CONFIG,
    'metric',
    {}
  );

  // Tank = 35 L, consumption = 10 L/100km -> max range is 350 km, cannot cover 432 km gap
  const result = optimizeRefuelingSchedule({
    totalDistanceKm: 542,
    routeCoordinates: SAMPLE_ROUTE_COORDS,
    tankCapacityLiters: 35,
    fuelEconomyL100km: 10.0,
    initialFuelPercent: 80,
    minStopReservePercent: 10,
    targetArrivalReservePercent: 20,
    maxDetourMinutes: 25,
    maxDollarPerStop: null,
    detourCostWeightPerMinute: 0,
    policy: 'mode_b_partial_lookahead',
    unitSystem: 'metric',
    stations: pricedStations,
  });

  assert.equal(result.feasible, false);
  assert.ok(result.error !== null);
  assert.equal(result.error?.code, 'UNREACHABLE_ARRIVAL_RESERVE');
});
