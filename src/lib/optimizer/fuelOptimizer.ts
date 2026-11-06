import * as turf from '@turf/turf';
import {
  computeDistanceFromFuelKm,
  computeFuelBurnedLiters,
  kmToMiles,
  litersToGallons,
  roundTo,
} from '../units';
import type {
  FuelStation,
  OptimalStop,
  OptimizationInput,
  OptimizationResult,
  TelemetryPoint,
  UnreachableSegmentError,
} from '../../types/trip';

/**
 * Slices a GeoJSON route coordinate array between `startKm` and `endKm` using `@turf/line-slice-along`.
 */
function sliceRouteSegment(
  coordinates: [number, number][],
  startKm: number,
  endKm: number
): [number, number][] {
  if (!coordinates || coordinates.length < 2) {
    return [];
  }
  try {
    const line = turf.lineString(coordinates);
    const totalLen = turf.length(line, { units: 'kilometers' });
    const safeStart = Math.max(0, Math.min(startKm, totalLen - 0.1));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(endKm, totalLen));
    const sliced = turf.lineSliceAlong(line, safeStart, safeEnd, { units: 'kilometers' });
    return sliced.geometry.coordinates as [number, number][];
  } catch {
    return [coordinates[0], coordinates[coordinates.length - 1]];
  }
}

/**
 * Interpolates a [lng, lat] point along the route at distance `distKm`.
 */
function interpolatePointAlongRoute(
  coordinates: [number, number][],
  distKm: number
): [number, number] {
  if (!coordinates || coordinates.length === 0) return [0, 0];
  if (coordinates.length === 1) return coordinates[0];
  try {
    const line = turf.lineString(coordinates);
    const totalLen = turf.length(line, { units: 'kilometers' });
    const clamped = Math.max(0, Math.min(distKm, totalLen));
    const pt = turf.along(line, clamped, { units: 'kilometers' });
    return pt.geometry.coordinates as [number, number];
  } catch {
    return coordinates[0];
  }
}

/**
 * Helper to compute the monetary cost of `liters` at a station in the active unitSystem currency.
 */
function computeFuelCost(
  liters: number,
  station: FuelStation,
  unitSystem: 'imperial' | 'metric'
): number {
  if (unitSystem === 'metric') {
    return liters * station.effectivePricePerLiter;
  }
  return litersToGallons(liters) * station.effectivePricePerGal;
}

/**
 * Computes maximum liters that can be purchased at `station` given `maxDollarPerStop`.
 */
function computeMaxLitersByDollarCap(
  maxDollarPerStop: number | null,
  station: FuelStation,
  unitSystem: 'imperial' | 'metric',
  tankCapacityLiters: number
): number {
  if (maxDollarPerStop === null || maxDollarPerStop <= 0) {
    return tankCapacityLiters;
  }
  if (unitSystem === 'metric') {
    return maxDollarPerStop / Math.max(0.01, station.effectivePricePerLiter);
  }
  const maxGallons = maxDollarPerStop / Math.max(0.01, station.effectivePricePerGal);
  return maxGallons * 3.785411784;
}

/**
 * Core Mathematical Refueling Optimizer
 * Supports:
 * - Mode A (`mode_a_fill_or_cap`): Discretized Dynamic Programming under strict Fill-to-Full / Max $ Cap policy
 * - Mode B (`mode_b_partial_lookahead`): Greedy Lookahead / Linear Programming variable partial refill policy
 */
export function optimizeRefuelingSchedule(input: OptimizationInput): OptimizationResult {
  const startTime = performance.now();

  const {
    totalDistanceKm,
    routeCoordinates,
    tankCapacityLiters: C,
    fuelEconomyL100km: R100,
    initialFuelPercent,
    minStopReservePercent,
    targetArrivalReservePercent,
    maxDetourMinutes,
    maxDollarPerStop,
    detourCostWeightPerMinute,
    policy,
    unitSystem,
  } = input;

  const fStart = (Math.max(1, Math.min(100, initialFuelPercent)) / 100) * C;
  const fMinStop = (Math.max(0, Math.min(50, minStopReservePercent)) / 100) * C;
  const fTargetEnd = (Math.max(0, Math.min(90, targetArrivalReservePercent)) / 100) * C;

  // Filter candidate stations by maxDetourMinutes and valid route bounds, sorted by distanceAlongRouteKm
  const candidates = input.stations
    .filter(
      (s) =>
        s.detourTimeMinutes <= maxDetourMinutes &&
        s.distanceAlongRouteKm > 0.5 &&
        s.distanceAlongRouteKm < totalDistanceKm - 0.5
    )
    .sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);

  const maxRangeFromFullKm = computeDistanceFromFuelKm(Math.max(0, C - fMinStop), R100);
  const maxRangeFromStartKm = computeDistanceFromFuelKm(Math.max(0, fStart - fMinStop), R100);

  // Quick check: Can the vehicle reach Destination B with zero stops?
  const totalTripFuelNeeded = computeFuelBurnedLiters(totalDistanceKm, R100);
  if (fStart - totalTripFuelNeeded >= fTargetEnd - 1e-6) {
    const arrivalFuelLiters = fStart - totalTripFuelNeeded;
    const telemetry = buildTelemetryProfile(
      totalDistanceKm,
      routeCoordinates,
      C,
      R100,
      fStart,
      fMinStop,
      [],
      unitSystem
    );
    return {
      feasible: true,
      error: null,
      stops: [],
      totalCost: 0,
      totalFuelPurchasedLiters: 0,
      totalFuelPurchasedGal: 0,
      totalFuelBurnedLiters: roundTo(totalTripFuelNeeded, 2),
      totalFuelBurnedGal: roundTo(litersToGallons(totalTripFuelNeeded), 2),
      totalDetourMinutes: 0,
      naiveTotalCost: 0,
      savingsVsNaive: 0,
      savingsPercent: 0,
      departureFuelLiters: roundTo(fStart, 2),
      departureFuelGal: roundTo(litersToGallons(fStart), 2),
      arrivalFuelLiters: roundTo(arrivalFuelLiters, 2),
      arrivalFuelGal: roundTo(litersToGallons(arrivalFuelLiters), 2),
      arrivalFuelPercent: roundTo((arrivalFuelLiters / C) * 100, 1),
      telemetry,
      executionTimeMs: roundTo(performance.now() - startTime, 2),
    };
  }

  // Edge Case Check 1: Are there any candidate stations reachable from Origin?
  if (candidates.length === 0) {
    const deadDistKm = Math.min(totalDistanceKm, maxRangeFromStartKm);
    const err = createDeadZoneError(
      'DEAD_ZONE_EXCEEDS_RANGE',
      'No Corridor Stations Within Detour Limit',
      `No fuel stations were found within your ${maxDetourMinutes} min detour constraint, and starting fuel cannot reach the destination with the required ${targetArrivalReservePercent}% arrival reserve.`,
      'Origin',
      'Destination',
      0,
      totalDistanceKm,
      maxRangeFromStartKm,
      routeCoordinates
    );
    return buildInfeasibleResult(err, fStart, fMinStop, C, R100, deadDistKm, routeCoordinates, startTime);
  }

  // Check if the first station is reachable from Origin (including half detour to reach pump)
  const firstStation = candidates[0];
  const fuelToFirst =
    computeFuelBurnedLiters(firstStation.distanceAlongRouteKm, R100) +
    computeFuelBurnedLiters(firstStation.detourDistanceKm / 2, R100);

  if (fStart - fuelToFirst < fMinStop - 1e-5) {
    const err = createDeadZoneError(
      'INSUFFICIENT_INITIAL_FUEL',
      'Insufficient Starting Fuel to First Station',
      `Starting fuel (${roundTo(fStart, 1)} L / ${initialFuelPercent}%) cannot reach the first station (${firstStation.name} at ${firstStation.distanceAlongRouteKm} km) while maintaining the ${minStopReservePercent}% minimum station reserve.`,
      'Origin (Departure)',
      firstStation.name,
      0,
      firstStation.distanceAlongRouteKm,
      maxRangeFromStartKm,
      routeCoordinates
    );
    return buildInfeasibleResult(
      err,
      fStart,
      fMinStop,
      C,
      R100,
      maxRangeFromStartKm,
      routeCoordinates,
      startTime
    );
  }

  // Edge Case Check 2: Check for any Dead Zone gap between consecutive stations or from last station to Destination
  for (let i = 0; i < candidates.length - 1; i++) {
    const curr = candidates[i];
    const next = candidates[i + 1];
    const gapKm =
      next.distanceAlongRouteKm -
      curr.distanceAlongRouteKm +
      curr.detourDistanceKm / 2 +
      next.detourDistanceKm / 2;
    if (gapKm > maxRangeFromFullKm + 1e-5) {
      const err = createDeadZoneError(
        'DEAD_ZONE_EXCEEDS_RANGE',
        'Corridor Dead Zone Exceeds Max Vehicle Range',
        `The segment between ${curr.name} and ${next.name} (${roundTo(gapKm, 1)} km) exceeds your vehicle's usable range (${roundTo(maxRangeFromFullKm, 1)} km).`,
        curr.name,
        next.name,
        curr.distanceAlongRouteKm,
        next.distanceAlongRouteKm,
        maxRangeFromFullKm,
        routeCoordinates
      );
      return buildInfeasibleResult(
        err,
        fStart,
        fMinStop,
        C,
        R100,
        curr.distanceAlongRouteKm + maxRangeFromFullKm,
        routeCoordinates,
        startTime
      );
    }
  }

  const lastStation = candidates[candidates.length - 1];
  const lastLegKm =
    totalDistanceKm - lastStation.distanceAlongRouteKm + lastStation.detourDistanceKm / 2;
  const maxLastLegFuel = C - fTargetEnd;
  const maxLastLegRangeKm = computeDistanceFromFuelKm(Math.max(0, maxLastLegFuel), R100);

  if (lastLegKm > maxLastLegRangeKm + 1e-5) {
    // Check if ANY station in the corridor can reach Destination with fTargetEnd
    const anyCanReachEnd = candidates.some((st) => {
      const dist = totalDistanceKm - st.distanceAlongRouteKm + st.detourDistanceKm / 2;
      return dist <= maxLastLegRangeKm + 1e-5;
    });
    if (!anyCanReachEnd) {
      const err = createDeadZoneError(
        'UNREACHABLE_ARRIVAL_RESERVE',
        'Target Arrival Reserve Unreachable on Final Leg',
        `Even filling to 100% at the final station (${lastStation.name}), the remaining ${roundTo(lastLegKm, 1)} km to Destination leaves less than your required ${targetArrivalReservePercent}% arrival reserve.`,
        lastStation.name,
        'Destination',
        lastStation.distanceAlongRouteKm,
        totalDistanceKm,
        maxLastLegRangeKm,
        routeCoordinates
      );
      return buildInfeasibleResult(
        err,
        fStart,
        fMinStop,
        C,
        R100,
        lastStation.distanceAlongRouteKm + maxLastLegRangeKm,
        routeCoordinates,
        startTime
      );
    }
  }

  // Run the selected optimization policy
  let stops: OptimalStop[] | null = null;

  if (policy === 'mode_b_partial_lookahead') {
    stops = solveModeBPartialLookahead({
      candidates,
      totalDistanceKm,
      C,
      R100,
      fStart,
      fMinStop,
      fTargetEnd,
      maxDollarPerStop,
      detourCostWeightPerMinute,
      unitSystem,
    });
  } else {
    stops = solveModeAFillOrCapDP({
      candidates,
      totalDistanceKm,
      C,
      R100,
      fStart,
      fMinStop,
      fTargetEnd,
      maxDollarPerStop,
      detourCostWeightPerMinute,
      unitSystem,
    });
  }

  if (!stops) {
    // Fallback check: if strict dollar cap made the trip infeasible, report structured error
    const err = createDeadZoneError(
      'DEAD_ZONE_EXCEEDS_RANGE',
      'Per-Stop Dollar Cap Prevents Route Completion',
      maxDollarPerStop
        ? `With the $${maxDollarPerStop} per-stop cap, the vehicle cannot purchase enough fuel across available stations to reach the destination with ${targetArrivalReservePercent}% reserve.`
        : 'No feasible refueling sequence satisfies all reserve constraints along this corridor.',
      'Origin',
      'Destination',
      0,
      totalDistanceKm,
      maxRangeFromFullKm,
      routeCoordinates
    );
    return buildInfeasibleResult(
      err,
      fStart,
      fMinStop,
      C,
      R100,
      maxRangeFromStartKm,
      routeCoordinates,
      startTime
    );
  }

  // Compute totals and naive baseline comparison
  const totalCost = roundTo(stops.reduce((acc, s) => acc + s.stepCost, 0), 2);
  const totalFuelPurchasedLiters = roundTo(
    stops.reduce((acc, s) => acc + s.fuelPurchasedLiters, 0),
    2
  );
  const totalFuelPurchasedGal = roundTo(litersToGallons(totalFuelPurchasedLiters), 2);
  const totalDetourMinutes = roundTo(stops.reduce((acc, s) => acc + s.detourMinutes, 0), 1);
  const totalDetourBurnLiters = stops.reduce((acc, s) => acc + s.detourFuelBurnedLiters, 0);
  const totalFuelBurnedLiters = roundTo(totalTripFuelNeeded + totalDetourBurnLiters, 2);
  const totalFuelBurnedGal = roundTo(litersToGallons(totalFuelBurnedLiters), 2);

  const arrivalFuelLiters = roundTo(fStart + totalFuelPurchasedLiters - totalFuelBurnedLiters, 2);
  const arrivalFuelGal = roundTo(litersToGallons(arrivalFuelLiters), 2);
  const arrivalFuelPercent = roundTo((arrivalFuelLiters / C) * 100, 1);

  const naiveTotalCost = computeNaiveBaselineCost({
    candidates,
    totalFuelPurchasedLiters,
    unitSystem,
    optimalTotalCost: totalCost,
  });

  const savingsVsNaive = roundTo(Math.max(0, naiveTotalCost - totalCost), 2);
  const savingsPercent =
    naiveTotalCost > 0 ? roundTo((savingsVsNaive / naiveTotalCost) * 100, 1) : 0;

  const telemetry = buildTelemetryProfile(
    totalDistanceKm,
    routeCoordinates,
    C,
    R100,
    fStart,
    fMinStop,
    stops,
    unitSystem
  );

  return {
    feasible: true,
    error: null,
    stops,
    totalCost,
    totalFuelPurchasedLiters,
    totalFuelPurchasedGal,
    totalFuelBurnedLiters,
    totalFuelBurnedGal,
    totalDetourMinutes,
    naiveTotalCost,
    savingsVsNaive,
    savingsPercent,
    departureFuelLiters: roundTo(fStart, 2),
    departureFuelGal: roundTo(litersToGallons(fStart), 2),
    arrivalFuelLiters,
    arrivalFuelGal,
    arrivalFuelPercent,
    telemetry,
    executionTimeMs: roundTo(performance.now() - startTime, 2),
  };
}

/**
 * Mode B: "True Minimum Cost / Variable Partial Fill" Policy (Greedy Lookahead / Linear Programming)
 * Solves the Fixed-Path Refueling Problem with detour awareness and optional per-stop dollar cap.
 */
function solveModeBPartialLookahead(params: {
  candidates: FuelStation[];
  totalDistanceKm: number;
  C: number;
  R100: number;
  fStart: number;
  fMinStop: number;
  fTargetEnd: number;
  maxDollarPerStop: number | null;
  detourCostWeightPerMinute: number;
  unitSystem: 'imperial' | 'metric';
}): OptimalStop[] | null {
  const {
    candidates,
    totalDistanceKm,
    C,
    R100,
    fStart,
    fMinStop,
    fTargetEnd,
    maxDollarPerStop,
    detourCostWeightPerMinute,
    unitSystem,
  } = params;

  // Effective unit price including slight detour cost amortization so lookahead favors genuinely cheaper stops
  const effectiveRankPrice = (st: FuelStation) => {
    const base = unitSystem === 'metric' ? st.effectivePricePerLiter : st.effectivePricePerGal;
    const detourPenalty = (st.detourTimeMinutes * detourCostWeightPerMinute) / 25;
    return base + detourPenalty;
  };

  // Step 1: Select initial station to visit from Origin (0 km)
  // Among all stations reachable from Origin with >= fMinStop, pick the cheapest effective station;
  // or if a station can get us closer to an even cheaper one, pick the cheapest reachable from start.
  const reachableFromStart: Array<{ idx: number; arrivalFuel: number }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const st = candidates[i];
    const burnToPump =
      computeFuelBurnedLiters(st.distanceAlongRouteKm, R100) +
      computeFuelBurnedLiters(st.detourDistanceKm / 2, R100);
    const arrivalFuel = fStart - burnToPump;
    if (arrivalFuel >= fMinStop - 1e-5) {
      reachableFromStart.push({ idx: i, arrivalFuel: Math.max(fMinStop, arrivalFuel) });
    }
  }

  if (reachableFromStart.length === 0) return null;

  // Choose the reachable station from start with the lowest effective price
  reachableFromStart.sort(
    (a, b) => effectiveRankPrice(candidates[a.idx]) - effectiveRankPrice(candidates[b.idx])
  );

  let currIdx = reachableFromStart[0].idx;
  let currArrivalFuel = reachableFromStart[0].arrivalFuel;
  let prevDistKm = 0;

  const stops: OptimalStop[] = [];
  const visited = new Set<number>();

  while (currIdx >= 0 && currIdx < candidates.length) {
    if (visited.has(currIdx)) break;
    visited.add(currIdx);

    const currStation = candidates[currIdx];
    const halfDetourBurn = computeFuelBurnedLiters(currStation.detourDistanceKm / 2, R100);
    const maxPurchaseByCap = computeMaxLitersByDollarCap(
      maxDollarPerStop,
      currStation,
      unitSystem,
      C
    );
    const maxPossibleDepartureAtPump = Math.min(C, currArrivalFuel + maxPurchaseByCap);

    // Fuel needed at pump of currStation to reach Destination B with fTargetEnd
    const distToDestKm = totalDistanceKm - currStation.distanceAlongRouteKm;
    const fuelNeededForDest =
      halfDetourBurn + computeFuelBurnedLiters(distToDestKm, R100) + fTargetEnd;

    // Scan all stations j > currIdx reachable with maxPossibleDepartureAtPump
    const reachableAhead: Array<{
      j: number;
      fuelNeededAtPumpToReachJWithMinReserve: number;
    }> = [];

    for (let j = currIdx + 1; j < candidates.length; j++) {
      const nextSt = candidates[j];
      const legDistKm = nextSt.distanceAlongRouteKm - currStation.distanceAlongRouteKm;
      const burnPumpToNextPump =
        halfDetourBurn +
        computeFuelBurnedLiters(legDistKm, R100) +
        computeFuelBurnedLiters(nextSt.detourDistanceKm / 2, R100);
      const neededAtCurrPump = burnPumpToNextPump + fMinStop;

      if (neededAtCurrPump <= maxPossibleDepartureAtPump + 1e-5) {
        reachableAhead.push({
          j,
          fuelNeededAtPumpToReachJWithMinReserve: neededAtCurrPump,
        });
      }
    }

    // Look for the first reachable station j that is strictly cheaper than currStation
    const cheaperAhead = reachableAhead.find(
      (item) =>
        effectiveRankPrice(candidates[item.j]) < effectiveRankPrice(currStation) - 1e-4
    );

    let targetDepartureFuelAtPump: number;
    let nextIdx: number | null = null;
    let policyReason: OptimalStop['policyReason'] = 'fill_to_capacity';
    let policyExplanation = '';

    if (cheaperAhead) {
      // Case 1: A cheaper station S_j is within range!
      // Purchase ONLY enough fuel at S_i to reach S_j with exactly f_min_stop reserve.
      const nextSt = candidates[cheaperAhead.j];
      targetDepartureFuelAtPump = Math.max(
        currArrivalFuel,
        Math.min(maxPossibleDepartureAtPump, cheaperAhead.fuelNeededAtPumpToReachJWithMinReserve)
      );
      nextIdx = cheaperAhead.j;
      policyReason = 'cheaper_station_ahead';
      const nextPriceStr =
        unitSystem === 'metric'
          ? `$${nextSt.effectivePricePerLiter.toFixed(2)}/L`
          : `$${nextSt.effectivePricePerGal.toFixed(2)}/gal`;
      policyExplanation = `Partial fill: buy just enough to reach cheaper ${nextSt.brand} ahead (${nextPriceStr}) with ${roundTo((fMinStop / C) * 100, 0)}% reserve.`;
    } else if (fuelNeededForDest <= maxPossibleDepartureAtPump + 1e-5) {
      // Case 2a: Destination B is reachable and no cheaper station is ahead -> buy exact amount for Destination B
      targetDepartureFuelAtPump = Math.max(currArrivalFuel, fuelNeededForDest);
      nextIdx = null;
      policyReason = 'exact_for_destination';
      policyExplanation = `Exact fill to arrive at Destination with target ${roundTo((fTargetEnd / C) * 100, 0)}% reserve.`;
    } else {
      // Case 2b: No cheaper station within range and Destination is beyond range -> fill to capacity C (or $ cap)
      targetDepartureFuelAtPump = maxPossibleDepartureAtPump;
      if (maxPossibleDepartureAtPump < C - 0.05) {
        policyReason = 'capped_by_max_dollar';
        policyExplanation = `Filled to $${maxDollarPerStop} per-stop cap (cheapest station in current range).`;
      } else {
        policyReason = 'fill_to_capacity';
        policyExplanation = `Full tank fill (100%): no cheaper station within ${roundTo(computeDistanceFromFuelKm(C - fMinStop, R100), 0)} km range.`;
      }

      if (reachableAhead.length === 0) {
        return null; // Dead end
      }
      // Transition to the cheapest reachable station ahead
      const sortedByPrice = [...reachableAhead].sort(
        (a, b) => effectiveRankPrice(candidates[a.j]) - effectiveRankPrice(candidates[b.j])
      );
      nextIdx = sortedByPrice[0].j;
    }

    const fuelPurchasedLiters = Math.max(0, targetDepartureFuelAtPump - currArrivalFuel);
    const departureAfterReturnToHighway = Math.max(
      0,
      targetDepartureFuelAtPump - halfDetourBurn
    );

    if (fuelPurchasedLiters > 0.05) {
      const stepCost = computeFuelCost(fuelPurchasedLiters, currStation, unitSystem);
      const legDistKm = currStation.distanceAlongRouteKm - prevDistKm;
      const detourBurnLiters = computeFuelBurnedLiters(currStation.detourDistanceKm, R100);

      stops.push({
        stopNumber: stops.length + 1,
        station: currStation,
        arrivalFuelLiters: roundTo(currArrivalFuel, 2),
        arrivalFuelGal: roundTo(litersToGallons(currArrivalFuel), 2),
        arrivalFuelPercent: roundTo((currArrivalFuel / C) * 100, 1),
        fuelPurchasedLiters: roundTo(fuelPurchasedLiters, 2),
        fuelPurchasedGal: roundTo(litersToGallons(fuelPurchasedLiters), 2),
        departureFuelLiters: roundTo(departureAfterReturnToHighway, 2),
        departureFuelGal: roundTo(litersToGallons(departureAfterReturnToHighway), 2),
        departureFuelPercent: roundTo((departureAfterReturnToHighway / C) * 100, 1),
        pricePerLiter: currStation.effectivePricePerLiter,
        pricePerGal: currStation.effectivePricePerGal,
        stepCost: roundTo(stepCost, 2),
        detourMinutes: currStation.detourTimeMinutes,
        detourFuelBurnedLiters: roundTo(detourBurnLiters, 2),
        detourFuelBurnedGal: roundTo(litersToGallons(detourBurnLiters), 2),
        legDistanceFromPrevKm: roundTo(legDistKm, 1),
        legDistanceFromPrevMiles: roundTo(kmToMiles(legDistKm), 1),
        policyReason,
        policyExplanation,
      });

      prevDistKm = currStation.distanceAlongRouteKm;
    }

    if (nextIdx === null) {
      // Reached destination
      return stops;
    }

    const nextStation = candidates[nextIdx];
    const legKm = nextStation.distanceAlongRouteKm - currStation.distanceAlongRouteKm;
    const burnToNextPump =
      halfDetourBurn +
      computeFuelBurnedLiters(legKm, R100) +
      computeFuelBurnedLiters(nextStation.detourDistanceKm / 2, R100);

    currArrivalFuel = Math.max(fMinStop, targetDepartureFuelAtPump - burnToNextPump);
    currIdx = nextIdx;
  }

  return null;
}

/**
 * Mode A: Strict "Fill-to-Full / Max Dollar Cap" Policy (Discretized Dynamic Programming)
 * At each stop S_i, the driver fills the tank to capacity C (or adds up to `maxDollarPerStop / p_i`).
 * Formulates the shortest-path DP over station transitions (Origin -> S_i -> ... -> S_k -> Destination).
 */
function solveModeAFillOrCapDP(params: {
  candidates: FuelStation[];
  totalDistanceKm: number;
  C: number;
  R100: number;
  fStart: number;
  fMinStop: number;
  fTargetEnd: number;
  maxDollarPerStop: number | null;
  detourCostWeightPerMinute: number;
  unitSystem: 'imperial' | 'metric';
}): OptimalStop[] | null {
  const {
    candidates,
    totalDistanceKm,
    C,
    R100,
    fStart,
    fMinStop,
    fTargetEnd,
    maxDollarPerStop,
    detourCostWeightPerMinute,
    unitSystem,
  } = params;

  const n = candidates.length;

  interface DPState {
    cost: number; // Monetary + weighted detour objective
    monetaryCost: number;
    arrivalFuelAtPump: number;
    purchasedLiters: number;
    departureFuelAtPump: number;
    prevStationIdx: number; // -1 for Origin
    prevStateKey: string | null;
  }

  // Discretize fuel level to 0.5 L buckets to track exact fuel state when maxDollarPerStop caps refills
  const bucketize = (liters: number) => Math.round(liters * 2) / 2;

  const dp: Array<Map<number, DPState>> = Array.from({ length: n }, () => new Map());

  // Initialize transitions from Origin (-1) to Station i
  for (let i = 0; i < n; i++) {
    const st = candidates[i];
    const burnToPump =
      computeFuelBurnedLiters(st.distanceAlongRouteKm, R100) +
      computeFuelBurnedLiters(st.detourDistanceKm / 2, R100);
    const arrivalFuel = fStart - burnToPump;

    if (arrivalFuel >= fMinStop - 1e-5) {
      const safeArrival = Math.max(fMinStop, arrivalFuel);
      const maxAdd = computeMaxLitersByDollarCap(maxDollarPerStop, st, unitSystem, C);
      const depFuelAtPump = Math.min(C, safeArrival + maxAdd);
      const purchased = Math.max(0, depFuelAtPump - safeArrival);
      const money = computeFuelCost(purchased, st, unitSystem);
      const objCost = money + st.detourTimeMinutes * detourCostWeightPerMinute;
      const bucket = bucketize(depFuelAtPump);

      dp[i].set(bucket, {
        cost: objCost,
        monetaryCost: money,
        arrivalFuelAtPump: safeArrival,
        purchasedLiters: purchased,
        departureFuelAtPump: depFuelAtPump,
        prevStationIdx: -1,
        prevStateKey: null,
      });
    }
  }

  // Transitions S_i -> S_j
  for (let i = 0; i < n; i++) {
    if (dp[i].size === 0) continue;
    const stI = candidates[i];
    const halfDetourI = computeFuelBurnedLiters(stI.detourDistanceKm / 2, R100);

    for (const [depBucket, stateI] of dp[i].entries()) {
      const depFuelI = stateI.departureFuelAtPump;

      for (let j = i + 1; j < n; j++) {
        const stJ = candidates[j];
        const legKm = stJ.distanceAlongRouteKm - stI.distanceAlongRouteKm;
        const burnItoJ =
          halfDetourI +
          computeFuelBurnedLiters(legKm, R100) +
          computeFuelBurnedLiters(stJ.detourDistanceKm / 2, R100);

        const arrivalJ = depFuelI - burnItoJ;
        if (arrivalJ < fMinStop - 1e-5) {
          // Since stations are sorted by distance, if depFuelI is C and even straight line exceeds, we can continue
          continue;
        }

        const safeArrivalJ = Math.max(fMinStop, arrivalJ);
        const maxAddJ = computeMaxLitersByDollarCap(maxDollarPerStop, stJ, unitSystem, C);
        const depFuelJ = Math.min(C, safeArrivalJ + maxAddJ);
        const purchasedJ = Math.max(0, depFuelJ - safeArrivalJ);
        const moneyJ = computeFuelCost(purchasedJ, stJ, unitSystem);
        const stepObj = moneyJ + stJ.detourTimeMinutes * detourCostWeightPerMinute;
        const totalObj = stateI.cost + stepObj;
        const nextBucket = bucketize(depFuelJ);

        const existing = dp[j].get(nextBucket);
        if (!existing || totalObj < existing.cost - 1e-6) {
          dp[j].set(nextBucket, {
            cost: totalObj,
            monetaryCost: stateI.monetaryCost + moneyJ,
            arrivalFuelAtPump: safeArrivalJ,
            purchasedLiters: purchasedJ,
            departureFuelAtPump: depFuelJ,
            prevStationIdx: i,
            prevStateKey: String(depBucket),
          });
        }
      }
    }
  }

  // Find optimal final station S_k that can reach Destination B with >= fTargetEnd
  let bestEndIdx = -1;
  let bestEndBucket = -1;
  let bestEndCost = Infinity;

  for (let k = 0; k < n; k++) {
    if (dp[k].size === 0) continue;
    const stK = candidates[k];
    const halfDetourK = computeFuelBurnedLiters(stK.detourDistanceKm / 2, R100);
    const distToDest = totalDistanceKm - stK.distanceAlongRouteKm;
    const burnToDest = halfDetourK + computeFuelBurnedLiters(distToDest, R100);

    for (const [bucket, stateK] of dp[k].entries()) {
      const finalArrivalFuel = stateK.departureFuelAtPump - burnToDest;
      if (finalArrivalFuel >= fTargetEnd - 1e-5) {
        if (stateK.cost < bestEndCost) {
          bestEndCost = stateK.cost;
          bestEndIdx = k;
          bestEndBucket = bucket;
        }
      }
    }
  }

  if (bestEndIdx === -1) {
    return null;
  }

  // Backtrack to reconstruct optimal stop sequence
  const chain: Array<{ stationIdx: number; state: DPState }> = [];
  let currIdx = bestEndIdx;
  let currBucket = bestEndBucket;

  while (currIdx !== -1) {
    const stMap = dp[currIdx];
    const stState = stMap.get(currBucket);
    if (!stState) break;
    chain.push({ stationIdx: currIdx, state: stState });
    currIdx = stState.prevStationIdx;
    currBucket = stState.prevStateKey !== null ? Number(stState.prevStateKey) : -1;
  }

  chain.reverse();

  let prevDistKm = 0;
  return chain.map((item, idx) => {
    const st = candidates[item.stationIdx];
    const s = item.state;
    const halfDetourBurn = computeFuelBurnedLiters(st.detourDistanceKm / 2, R100);
    const depHighway = Math.max(0, s.departureFuelAtPump - halfDetourBurn);
    const detourBurn = computeFuelBurnedLiters(st.detourDistanceKm, R100);
    const legKm = st.distanceAlongRouteKm - prevDistKm;
    prevDistKm = st.distanceAlongRouteKm;

    const isCapped = s.departureFuelAtPump < C - 0.05 && maxDollarPerStop !== null;
    const stepCost = computeFuelCost(s.purchasedLiters, st, unitSystem);

    return {
      stopNumber: idx + 1,
      station: st,
      arrivalFuelLiters: roundTo(s.arrivalFuelAtPump, 2),
      arrivalFuelGal: roundTo(litersToGallons(s.arrivalFuelAtPump), 2),
      arrivalFuelPercent: roundTo((s.arrivalFuelAtPump / C) * 100, 1),
      fuelPurchasedLiters: roundTo(s.purchasedLiters, 2),
      fuelPurchasedGal: roundTo(litersToGallons(s.purchasedLiters), 2),
      departureFuelLiters: roundTo(depHighway, 2),
      departureFuelGal: roundTo(litersToGallons(depHighway), 2),
      departureFuelPercent: roundTo((depHighway / C) * 100, 1),
      pricePerLiter: st.effectivePricePerLiter,
      pricePerGal: st.effectivePricePerGal,
      stepCost: roundTo(stepCost, 2),
      detourMinutes: st.detourTimeMinutes,
      detourFuelBurnedLiters: roundTo(detourBurn, 2),
      detourFuelBurnedGal: roundTo(litersToGallons(detourBurn), 2),
      legDistanceFromPrevKm: roundTo(legKm, 1),
      legDistanceFromPrevMiles: roundTo(kmToMiles(legKm), 1),
      policyReason: isCapped ? 'capped_by_max_dollar' : 'fill_to_capacity',
      policyExplanation: isCapped
        ? `DP Optimal Stop: capped at $${maxDollarPerStop} per-stop limit.`
        : `DP Optimal Stop: filled tank to 100% capacity (${roundTo(C, 1)} L / ${roundTo(litersToGallons(C), 1)} gal).`,
    };
  });
}

/**
 * Estimates the cost of a naive highway refueling strategy (pumping at convenient highway-adjacent
 * top-tier/plaza stations without lookahead or partial-fill optimization).
 */
function computeNaiveBaselineCost(params: {
  candidates: FuelStation[];
  totalFuelPurchasedLiters: number;
  unitSystem: 'imperial' | 'metric';
  optimalTotalCost: number;
}): number {
  const { candidates, totalFuelPurchasedLiters, unitSystem, optimalTotalCost } = params;
  if (candidates.length === 0 || totalFuelPurchasedLiters <= 0) return optimalTotalCost;

  // Naive drivers stop at highway-adjacent stations (upper 65th percentile price along corridor)
  const prices = candidates
    .map((c) => (unitSystem === 'metric' ? c.effectivePricePerLiter : c.effectivePricePerGal))
    .sort((a, b) => a - b);

  const p70Idx = Math.min(prices.length - 1, Math.floor(prices.length * 0.72));
  const naiveUnitPrice = prices[p70Idx];
  const volumeInUnits =
    unitSystem === 'metric'
      ? totalFuelPurchasedLiters
      : litersToGallons(totalFuelPurchasedLiters);

  const rawNaive = roundTo(volumeInUnits * naiveUnitPrice, 2);
  return Math.max(optimalTotalCost, rawNaive);
}

/**
 * Generates high-resolution telemetry array for the "Fuel Tank Level vs. Distance" area chart.
 * Includes exact arrival and departure points at each stop to render crisp refill spikes.
 */
function buildTelemetryProfile(
  totalDistanceKm: number,
  routeCoordinates: [number, number][],
  C: number,
  R100: number,
  fStart: number,
  fMinStop: number,
  stops: OptimalStop[],
  unitSystem: 'imperial' | 'metric'
): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const stepKm = Math.max(4, Math.min(12, totalDistanceKm / 85));
  const minReserveGal = roundTo(litersToGallons(fMinStop), 2);
  const minReserveLiters = roundTo(fMinStop, 2);

  let currentFuelLiters = fStart;
  let lastDistKm = 0;

  // Origin departure point
  const [startLng, startLat] = interpolatePointAlongRoute(routeCoordinates, 0);
  points.push({
    distanceKm: 0,
    distanceMiles: 0,
    fuelRemainingLiters: roundTo(currentFuelLiters, 2),
    fuelRemainingGal: roundTo(litersToGallons(currentFuelLiters), 2),
    fuelRemainingPercent: roundTo((currentFuelLiters / C) * 100, 1),
    minReserveLiters,
    minReserveGal,
    lat: startLat,
    lng: startLng,
    event: 'departure',
  });

  for (const stop of stops) {
    const stopDistKm = stop.station.distanceAlongRouteKm;

    // Add intermediate slope samples between lastDistKm and stopDistKm
    for (let d = lastDistKm + stepKm; d < stopDistKm - 0.5; d += stepKm) {
      const burned = computeFuelBurnedLiters(d - lastDistKm, R100);
      const remL = Math.max(0, currentFuelLiters - burned);
      const [lng, lat] = interpolatePointAlongRoute(routeCoordinates, d);
      points.push({
        distanceKm: roundTo(d, 1),
        distanceMiles: roundTo(kmToMiles(d), 1),
        fuelRemainingLiters: roundTo(remL, 2),
        fuelRemainingGal: roundTo(litersToGallons(remL), 2),
        fuelRemainingPercent: roundTo((remL / C) * 100, 1),
        minReserveLiters,
        minReserveGal,
        lat,
        lng,
      });
    }

    const priceDisplay =
      unitSystem === 'metric'
        ? `$${stop.pricePerLiter.toFixed(2)}/L`
        : `$${stop.pricePerGal.toFixed(2)}/gal`;

    // Point 1 at stop: Arrival at pump (bottom of refill spike)
    points.push({
      distanceKm: roundTo(stopDistKm, 1),
      distanceMiles: roundTo(stop.station.distanceAlongRouteMiles, 1),
      fuelRemainingLiters: stop.arrivalFuelLiters,
      fuelRemainingGal: stop.arrivalFuelGal,
      fuelRemainingPercent: stop.arrivalFuelPercent,
      minReserveLiters,
      minReserveGal,
      lat: stop.station.lat,
      lng: stop.station.lng,
      event: 'arrival_at_stop',
      stopNumber: stop.stopNumber,
      stationName: stop.station.name,
      stationPriceDisplay: priceDisplay,
    });

    // Point 2 at stop: Departure after pumping (top of refill spike)
    points.push({
      distanceKm: roundTo(stopDistKm + 0.01, 2),
      distanceMiles: roundTo(stop.station.distanceAlongRouteMiles + 0.01, 2),
      fuelRemainingLiters: stop.departureFuelLiters,
      fuelRemainingGal: stop.departureFuelGal,
      fuelRemainingPercent: stop.departureFuelPercent,
      minReserveLiters,
      minReserveGal,
      lat: stop.station.lat,
      lng: stop.station.lng,
      event: 'refuel_complete',
      stopNumber: stop.stopNumber,
      stationName: stop.station.name,
      stationPriceDisplay: priceDisplay,
      fuelAddedLiters: stop.fuelPurchasedLiters,
      fuelAddedGal: stop.fuelPurchasedGal,
    });

    currentFuelLiters = stop.departureFuelLiters;
    lastDistKm = stopDistKm;
  }

  // Final leg from last stop to Destination
  for (let d = lastDistKm + stepKm; d < totalDistanceKm - 0.5; d += stepKm) {
    const burned = computeFuelBurnedLiters(d - lastDistKm, R100);
    const remL = Math.max(0, currentFuelLiters - burned);
    const [lng, lat] = interpolatePointAlongRoute(routeCoordinates, d);
    points.push({
      distanceKm: roundTo(d, 1),
      distanceMiles: roundTo(kmToMiles(d), 1),
      fuelRemainingLiters: roundTo(remL, 2),
      fuelRemainingGal: roundTo(litersToGallons(remL), 2),
      fuelRemainingPercent: roundTo((remL / C) * 100, 1),
      minReserveLiters,
      minReserveGal,
      lat,
      lng,
    });
  }

  const finalBurn = computeFuelBurnedLiters(totalDistanceKm - lastDistKm, R100);
  const finalRemL = Math.max(0, currentFuelLiters - finalBurn);
  const [endLng, endLat] = interpolatePointAlongRoute(routeCoordinates, totalDistanceKm);

  points.push({
    distanceKm: roundTo(totalDistanceKm, 1),
    distanceMiles: roundTo(kmToMiles(totalDistanceKm), 1),
    fuelRemainingLiters: roundTo(finalRemL, 2),
    fuelRemainingGal: roundTo(litersToGallons(finalRemL), 2),
    fuelRemainingPercent: roundTo((finalRemL / C) * 100, 1),
    minReserveLiters,
    minReserveGal,
    lat: endLat,
    lng: endLng,
    event: 'destination',
  });

  return points;
}

function createDeadZoneError(
  code: UnreachableSegmentError['code'],
  title: string,
  message: string,
  fromLabel: string,
  toLabel: string,
  fromDistanceKm: number,
  toDistanceKm: number,
  maxReachableKm: number,
  routeCoordinates: [number, number][]
): UnreachableSegmentError {
  const gapDistanceKm = Math.max(0, toDistanceKm - fromDistanceKm);
  const deadZoneCoordinates = sliceRouteSegment(routeCoordinates, fromDistanceKm, toDistanceKm);

  return {
    code,
    title,
    message,
    fromLabel,
    toLabel,
    fromDistanceKm: roundTo(fromDistanceKm, 1),
    toDistanceKm: roundTo(toDistanceKm, 1),
    fromDistanceMiles: roundTo(kmToMiles(fromDistanceKm), 1),
    toDistanceMiles: roundTo(kmToMiles(toDistanceKm), 1),
    gapDistanceKm: roundTo(gapDistanceKm, 1),
    gapDistanceMiles: roundTo(kmToMiles(gapDistanceKm), 1),
    maxReachableKm: roundTo(maxReachableKm, 1),
    maxReachableMiles: roundTo(kmToMiles(maxReachableKm), 1),
    deadZoneCoordinates,
  };
}

function buildInfeasibleResult(
  error: UnreachableSegmentError,
  fStart: number,
  fMinStop: number,
  C: number,
  R100: number,
  exhaustionDistKm: number,
  routeCoordinates: [number, number][],
  startTime: number
): OptimizationResult {
  const [startLng, startLat] = interpolatePointAlongRoute(routeCoordinates, 0);
  const [deadLng, deadLat] = interpolatePointAlongRoute(routeCoordinates, exhaustionDistKm);
  const minReserveGal = roundTo(litersToGallons(fMinStop), 2);

  const telemetry: TelemetryPoint[] = [
    {
      distanceKm: 0,
      distanceMiles: 0,
      fuelRemainingLiters: roundTo(fStart, 2),
      fuelRemainingGal: roundTo(litersToGallons(fStart), 2),
      fuelRemainingPercent: roundTo((fStart / C) * 100, 1),
      minReserveLiters: roundTo(fMinStop, 2),
      minReserveGal,
      lat: startLat,
      lng: startLng,
      event: 'departure',
    },
    {
      distanceKm: roundTo(exhaustionDistKm, 1),
      distanceMiles: roundTo(kmToMiles(exhaustionDistKm), 1),
      fuelRemainingLiters: roundTo(fMinStop, 2),
      fuelRemainingGal: minReserveGal,
      fuelRemainingPercent: roundTo((fMinStop / C) * 100, 1),
      minReserveLiters: roundTo(fMinStop, 2),
      minReserveGal,
      lat: deadLat,
      lng: deadLng,
      event: 'dead_zone',
    },
  ];

  return {
    feasible: false,
    error,
    stops: [],
    totalCost: 0,
    totalFuelPurchasedLiters: 0,
    totalFuelPurchasedGal: 0,
    totalFuelBurnedLiters: roundTo(computeFuelBurnedLiters(exhaustionDistKm, R100), 2),
    totalFuelBurnedGal: roundTo(
      litersToGallons(computeFuelBurnedLiters(exhaustionDistKm, R100)),
      2
    ),
    totalDetourMinutes: 0,
    naiveTotalCost: 0,
    savingsVsNaive: 0,
    savingsPercent: 0,
    departureFuelLiters: roundTo(fStart, 2),
    departureFuelGal: roundTo(litersToGallons(fStart), 2),
    arrivalFuelLiters: 0,
    arrivalFuelGal: 0,
    arrivalFuelPercent: 0,
    telemetry,
    executionTimeMs: roundTo(performance.now() - startTime, 2),
  };
}
