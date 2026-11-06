/**
 * Explicit geospatial and volumetric unit conversions.
 * Internal canonical representations in the optimizer:
 * - Distance: Kilometres (km)
 * - Volume: Litres (L)
 * - Fuel Consumption: Litres per 100 km (L/100km)
 */

export const KM_PER_MILE = 1.609344;
export const MILES_PER_KM = 1 / KM_PER_MILE; // 0.6213711922

export const LITERS_PER_US_GALLON = 3.785411784;
export const US_GALLONS_PER_LITER = 1 / LITERS_PER_US_GALLON; // 0.2641720524

// 235.214583 = (100 * 3.785411784) / 1.609344
export const MPG_L100KM_CONSTANT = 235.214583;

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

export function kmToMiles(km: number): number {
  return km * MILES_PER_KM;
}

export function gallonsToLiters(gallons: number): number {
  return gallons * LITERS_PER_US_GALLON;
}

export function litersToGallons(liters: number): number {
  return liters * US_GALLONS_PER_LITER;
}

export function mpgToL100km(mpg: number): number {
  if (mpg <= 0) return 0;
  return MPG_L100KM_CONSTANT / mpg;
}

export function l100kmToMpg(l100km: number): number {
  if (l100km <= 0) return 0;
  return MPG_L100KM_CONSTANT / l100km;
}

/**
 * Converts a price per US Gallon ($/gal) to price per Liter ($/L)
 * Note: 1 gallon = 3.785411784 liters
 */
export function pricePerGalToLiter(pricePerGal: number): number {
  return pricePerGal / LITERS_PER_US_GALLON;
}

export function pricePerLiterToGal(pricePerLiter: number): number {
  return pricePerLiter * LITERS_PER_US_GALLON;
}

/**
 * Computes fuel burned in Litres over a given distance in km
 * at a given consumption rate in L/100km.
 */
export function computeFuelBurnedLiters(distanceKm: number, l100km: number): number {
  if (distanceKm <= 0 || l100km <= 0) return 0;
  return (distanceKm / 100) * l100km;
}

/**
 * Computes maximum driving range in km given available fuel in Litres
 * and consumption rate in L/100km.
 */
export function computeDistanceFromFuelKm(fuelLiters: number, l100km: number): number {
  if (fuelLiters <= 0 || l100km <= 0) return 0;
  return (fuelLiters / l100km) * 100;
}

export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
