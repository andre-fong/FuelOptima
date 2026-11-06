import { pricePerGalToLiter, pricePerLiterToGal, roundTo } from '../units';
import type {
  BrandTier,
  FuelStation,
  PricingConfig,
  RawStationCandidate,
  UnitSystem,
} from '../../types/trip';

const US_DISCOUNT_BRANDS = [
  'costco',
  "sam's club",
  'sams club',
  "bj's",
  'bjs',
  'arco',
  "buc-ee's",
  'bucees',
];

const US_PREMIUM_BRANDS = ['shell', 'chevron', 'exxon', 'mobil', 'bp', 'texaco', 'sunoco'];

const CA_DISCOUNT_BRANDS = [
  'costco',
  'canadian tire',
  'gas+',
  'pioneer',
  'ultramar',
  'super c',
  'no frills',
];

const CA_PREMIUM_BRANDS = ['petro-canada', 'petro canada', 'esso', 'shell'];

const CA_HIGHWAY_PLAZAS = ['onroute', 'on-route', 'halte routière'];

/**
 * Classifies a station's brand/operator into a BrandTier and calculates heuristic modifiers
 * in both $/L and $/gal according to US and Canadian localization rules.
 */
export function evaluateBrandHeuristics(
  brand: string,
  operator: string,
  name: string,
  isCanadian: boolean,
  enableBrandHeuristics: boolean,
  enableCanadianHeuristics: boolean
): {
  brandTier: BrandTier;
  modifierPerLiter: number;
  modifierPerGal: number;
} {
  const combined = `${brand} ${operator} ${name}`.toLowerCase();

  if (isCanadian && enableCanadianHeuristics) {
    if (CA_HIGHWAY_PLAZAS.some((b) => combined.includes(b))) {
      const modL = enableBrandHeuristics ? 0.06 : 0;
      return {
        brandTier: 'highway_plaza',
        modifierPerLiter: modL,
        modifierPerGal: roundTo(pricePerLiterToGal(modL), 3),
      };
    }
    if (CA_DISCOUNT_BRANDS.some((b) => combined.includes(b))) {
      const modL = enableBrandHeuristics ? -0.07 : 0;
      return {
        brandTier: 'discount',
        modifierPerLiter: modL,
        modifierPerGal: roundTo(pricePerLiterToGal(modL), 3),
      };
    }
    if (CA_PREMIUM_BRANDS.some((b) => combined.includes(b))) {
      const modL = enableBrandHeuristics ? 0.02 : 0;
      return {
        brandTier: 'premium',
        modifierPerLiter: modL,
        modifierPerGal: roundTo(pricePerLiterToGal(modL), 3),
      };
    }
    return {
      brandTier: 'standard',
      modifierPerLiter: 0,
      modifierPerGal: 0,
    };
  }

  // US / Imperial brand heuristics
  if (US_DISCOUNT_BRANDS.some((b) => combined.includes(b))) {
    const modGal = enableBrandHeuristics ? -0.2 : 0;
    return {
      brandTier: 'discount',
      modifierPerGal: modGal,
      modifierPerLiter: roundTo(pricePerGalToLiter(modGal), 3),
    };
  }
  if (US_PREMIUM_BRANDS.some((b) => combined.includes(b))) {
    const modGal = enableBrandHeuristics ? 0.08 : 0;
    return {
      brandTier: 'premium',
      modifierPerGal: modGal,
      modifierPerLiter: roundTo(pricePerGalToLiter(modGal), 3),
    };
  }

  return {
    brandTier: 'standard',
    modifierPerLiter: 0,
    modifierPerGal: 0,
  };
}

/**
 * Applies the 3-Layer Hybrid Fuel Pricing Engine to raw corridor stations.
 */
export function computeStationPrices(
  candidates: RawStationCandidate[],
  config: PricingConfig,
  unitSystem: UnitSystem,
  manualOverridesPerLiter: Record<string, number>
): FuelStation[] {
  return candidates.map((st) => {
    // 1. Macro Regional Baseline
    let basePricePerLiter: number;
    let basePricePerGal: number;

    if (unitSystem === 'metric') {
      basePricePerLiter = config.useZonePricing
        ? config.zonePricesPerLiter[st.regionZone]
        : config.baselinePricePerLiter;
      basePricePerGal = roundTo(pricePerLiterToGal(basePricePerLiter), 3);
    } else {
      basePricePerGal = config.useZonePricing
        ? config.zonePricesPerGal[st.regionZone]
        : config.baselinePricePerGal;
      basePricePerLiter = roundTo(pricePerGalToLiter(basePricePerGal), 3);
    }

    // 2. Brand & Location Heuristic Modifiers
    const { brandTier, modifierPerLiter, modifierPerGal } = evaluateBrandHeuristics(
      st.brand,
      st.operator,
      st.name,
      st.isCanadian,
      config.enableBrandHeuristics,
      config.enableCanadianHeuristics
    );

    // Proximity penalty: Stations within 0.2 miles (0.322 km) of the highway get +0.05 $/gal (+0.013 $/L)
    const isHighwayAdjacent = st.straightLineDistKm <= 0.33;
    const proximityMarkupPerGal = config.enableProximityMarkup && isHighwayAdjacent ? 0.05 : 0;
    const proximityMarkupPerLiter =
      config.enableProximityMarkup && isHighwayAdjacent ? 0.01 : 0;

    // 3. Manual Crowd-Style Override
    const overrideL =
      typeof manualOverridesPerLiter[st.id] === 'number' && manualOverridesPerLiter[st.id] > 0
        ? manualOverridesPerLiter[st.id]
        : null;
    const overrideGal = overrideL !== null ? roundTo(pricePerLiterToGal(overrideL), 2) : null;

    const computedLiter = Math.max(
      0.2,
      roundTo(basePricePerLiter + modifierPerLiter + proximityMarkupPerLiter, 2)
    );
    const computedGal = Math.max(
      0.75,
      roundTo(basePricePerGal + modifierPerGal + proximityMarkupPerGal, 2)
    );

    const effectivePricePerLiter = overrideL !== null ? roundTo(overrideL, 3) : computedLiter;
    const effectivePricePerGal = overrideGal !== null ? roundTo(overrideGal, 2) : computedGal;

    return {
      ...st,
      brandTier,
      basePricePerLiter: roundTo(basePricePerLiter, 3),
      basePricePerGal: roundTo(basePricePerGal, 2),
      brandModifierPerLiter: modifierPerLiter,
      brandModifierPerGal: modifierPerGal,
      proximityMarkupPerLiter,
      proximityMarkupPerGal,
      manualOverridePricePerLiter: overrideL,
      manualOverridePricePerGal: overrideGal,
      effectivePricePerLiter,
      effectivePricePerGal,
    };
  });
}

/**
 * Parses a CSV string of station overrides (`station_id,price` or `brand_or_name,price`)
 * and returns a map of stationId -> pricePerLiter.
 */
export function parseStationOverridesCsv(
  csvText: string,
  stations: FuelStation[],
  unitSystem: UnitSystem
): { overridesPerLiter: Record<string, number>; matchedCount: number } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const overridesPerLiter: Record<string, number> = {};
  let matchedCount = 0;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('station_id') || line.toLowerCase().startsWith('id,')) {
      continue;
    }
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;

    const key = parts[0].toLowerCase();
    const rawPrice = parseFloat(parts[parts.length - 1].replace(/[^0-9.]/g, ''));
    if (Number.isNaN(rawPrice) || rawPrice <= 0) continue;

    const pricePerLiter =
      unitSystem === 'metric' ? rawPrice : roundTo(pricePerGalToLiter(rawPrice), 4);

    for (const st of stations) {
      if (
        st.id.toLowerCase() === key ||
        st.name.toLowerCase().includes(key) ||
        st.brand.toLowerCase() === key
      ) {
        overridesPerLiter[st.id] = pricePerLiter;
        matchedCount++;
      }
    }
  }

  return { overridesPerLiter, matchedCount };
}

/**
 * Exports current corridor stations and their effective prices to CSV format.
 */
export function exportStationsToCsv(stations: FuelStation[], unitSystem: UnitSystem): string {
  const header =
    unitSystem === 'metric'
      ? 'station_id,name,brand,distance_km,detour_min,price_per_liter'
      : 'station_id,name,brand,distance_miles,detour_min,price_per_gal';

  const rows = stations.map((st) => {
    const safeName = st.name.replace(/,/g, ' ');
    const safeBrand = st.brand.replace(/,/g, ' ');
    const dist = unitSystem === 'metric' ? st.distanceAlongRouteKm : st.distanceAlongRouteMiles;
    const price =
      unitSystem === 'metric'
        ? st.effectivePricePerLiter.toFixed(3)
        : st.effectivePricePerGal.toFixed(2);
    return `${st.id},${safeName},${safeBrand},${dist},${st.detourTimeMinutes},${price}`;
  });

  return [header, ...rows].join('\n');
}
