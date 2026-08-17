// The International Standard Atmosphere, 0–32 km.
//
// Shared because three separate exhibits need the same numbers and they had
// better agree with each other: the flight envelope needs density and the
// speed of sound, the wind tunnel needs density to turn a lift coefficient
// into a force, and the rocket needs density for drag during the climb.
// One implementation means the site can't quietly contradict itself.
//
// This is the real ISA piecewise model (ISO 2533 / ICAO), not a curve fit:
//
//   0–11 km    troposphere    T falls at 6.5 K/km from 288.15 K
//   11–20 km   lower strat.   T constant at 216.65 K
//   20–32 km   upper strat.   T rises at 1.0 K/km
//
// Checked against the published table at the layer boundaries — see
// tools/atmosphere-check.mjs, which asserts the standard values to within
// 0.1%.

export const G0 = 9.80665; // m/s^2
export const R_AIR = 287.0528; // J/(kg·K)
export const GAMMA = 1.4;

const T0 = 288.15; // K at sea level
const P0 = 101325; // Pa at sea level
const LAPSE = 0.0065; // K/m in the troposphere

// Layer boundary values, derived once so the layers join continuously
// rather than each guessing at where the previous one ended.
const T11 = T0 - LAPSE * 11000; // 216.65 K
const P11 = P0 * Math.pow(T11 / T0, G0 / (R_AIR * LAPSE)); // 22632.1 Pa
const P20 = P11 * Math.exp((-G0 * (20000 - 11000)) / (R_AIR * T11)); // 5474.9 Pa
const T20 = T11;

/**
 * Standard atmosphere at a geopotential altitude.
 * @param {number} h altitude in metres
 * @returns {{T:number, p:number, rho:number, a:number}} kelvin, pascal, kg/m^3, m/s
 */
export function atmosphere(h) {
  // Above the modelled range the numbers stop meaning anything useful, but
  // returning NaN would poison every downstream calculation silently, so
  // clamp and let callers decide whether 32 km is far enough.
  const alt = Math.max(0, Math.min(h, 32000));

  let T;
  let p;
  if (alt <= 11000) {
    T = T0 - LAPSE * alt;
    p = P0 * Math.pow(T / T0, G0 / (R_AIR * LAPSE));
  } else if (alt <= 20000) {
    T = T11;
    p = P11 * Math.exp((-G0 * (alt - 11000)) / (R_AIR * T11));
  } else {
    const lapseUp = -0.001; // K/m, temperature rises
    T = T20 - lapseUp * (alt - 20000);
    p = P20 * Math.pow(T / T20, G0 / (R_AIR * lapseUp));
  }

  const rho = p / (R_AIR * T);
  const a = Math.sqrt(GAMMA * R_AIR * T);
  return { T, p, rho, a };
}

export const densityRatio = (h) => atmosphere(h).rho / 1.225;

/**
 * Minimum level-flight speed at altitude, as a Mach number.
 *
 * Straight from L = W in steady level flight: the wing has to make its own
 * weight in lift, so V_stall = sqrt(2(W/S) / (rho * CLmax)). The only reason
 * this climbs with altitude is that rho falls — the aircraft isn't getting
 * heavier, the air is getting thinner, so it has to go faster through it to
 * shift the same mass of air per second.
 *
 * @param {number} h altitude, metres
 * @param {number} wingLoading W/S in N/m^2
 * @param {number} clMax maximum usable lift coefficient
 */
export function stallMach(h, wingLoading, clMax) {
  const { rho, a } = atmosphere(h);
  const v = Math.sqrt((2 * wingLoading) / (rho * clMax));
  return v / a;
}

export const machToTas = (mach, h) => mach * atmosphere(h).a; // m/s
export const msToKnots = (v) => v * 1.943844;
