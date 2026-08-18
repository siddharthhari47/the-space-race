// Ground tracks — where a satellite actually is, over the turning Earth.
//
// DOM-free so it can be checked in Node (tools/groundtrack-check.mjs).
//
// The whole subject is one idea: a satellite's orbit stays put in inertial
// space while the planet rotates underneath it. Everything strange about
// ground tracks — the westward march, the sine-wave shape, the fact that
// geostationary is a dot — falls out of that one sentence.
//
//   u    = 2*pi*t/T                       argument of latitude
//   lat  = asin(sin i * sin u)
//   lon  = RAAN + atan2(cos i * sin u, cos u) - omega_earth * t
//
// The last term is the planet turning. Note it uses the *sidereal* day,
// 86164.09 s, not 86400 — Earth completes a rotation relative to the stars
// about four minutes quicker than relative to the Sun, and using the wrong
// one puts a geostationary satellite into a slow drift that would be
// visibly wrong within a few orbits.
//
// Two results this produces for free, which is how you know it is right:
// set inclination to zero and the period to a sidereal day and the track
// collapses to a single point; the maximum latitude reached is always
// exactly the inclination.

export const MU = 398600.4418; // km^3/s^2
export const R_EARTH = 6378.137; // km, equatorial — the right one for ground tracks
export const SIDEREAL_DAY = 86164.0905; // s
export const J2 = 1.08263e-3;

const DEG = Math.PI / 180;
const OMEGA_EARTH = (2 * Math.PI) / SIDEREAL_DAY; // rad/s
const OMEGA_SUN = (2 * Math.PI) / (365.2422 * 86400); // rad/s

export const period = (altKm) => 2 * Math.PI * Math.sqrt((R_EARTH + altKm) ** 3 / MU);
export const speed = (altKm) => Math.sqrt(MU / (R_EARTH + altKm));

/** Degrees the track shifts west each orbit, purely from Earth turning under it. */
export const westShift = (altKm) => (360 * period(altKm)) / SIDEREAL_DAY;

/**
 * Horizon half-angle: how far from the sub-satellite point the satellite is
 * still above the local horizon. acos(R/(R+h)) — pure geometry, a tangent
 * line from the ground to the spacecraft.
 */
export const horizonAngle = (altKm) => Math.acos(R_EARTH / (R_EARTH + altKm));
export const footprintRadius = (altKm) => horizonAngle(altKm) * R_EARTH; // km along the surface

/**
 * The inclination that makes an orbit sun-synchronous at a given altitude.
 *
 * Earth is not a sphere, and its equatorial bulge drags the orbit plane
 * round over time. Pick the inclination that makes that unwanted drift come
 * out at exactly one revolution per year, and the wobble stops being a
 * nuisance and starts doing a job: the orbit plane keeps a fixed angle to
 * the Sun, so the satellite crosses every latitude at the same local time
 * on every pass. That is why imaging satellites can compare today's picture
 * with last month's — identical lighting, identical shadows.
 *
 * Solving the J2 nodal precession for cos(i) gives a value above 90 degrees,
 * so every sun-synchronous orbit is retrograde. It has to fly slightly
 * backwards to make the maths work.
 */
export function sunSyncInclination(altKm) {
  const a = R_EARTH + altKm;
  const n = Math.sqrt(MU / a ** 3);
  const c = (-OMEGA_SUN * (2 / 3)) / (J2 * (R_EARTH / a) ** 2 * n);
  if (c < -1 || c > 1) return null; // no such orbit exists this high up
  return (Math.acos(c) / DEG);
}

/**
 * Sample the ground track.
 * @returns array of { lat, lon, t } in degrees / seconds, lon wrapped to [-180, 180].
 */
export function groundTrack({ altKm, incDeg, raanDeg = 0, orbits = 3, samples = 900 }) {
  const T = period(altKm);
  const i = incDeg * DEG;
  const raan = raanDeg * DEG;
  const total = T * orbits;
  const out = [];

  for (let k = 0; k <= samples; k++) {
    const t = (k / samples) * total;
    const u = (2 * Math.PI * t) / T;
    const lat = Math.asin(Math.sin(i) * Math.sin(u));
    let lon = raan + Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u)) - OMEGA_EARTH * t;

    // Wrap to [-pi, pi]. Done with a modulo rather than a while-loop because
    // a GEO track over many orbits would otherwise spin that loop thousands
    // of times per sample.
    lon = ((((lon + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

    out.push({ t, lat: lat / DEG, lon: lon / DEG });
  }
  return out;
}

/** Launch sites, with the latitude that sets their minimum easterly inclination. */
export const LAUNCH_SITES = [
  { name: "Kourou", lat: 5.2, lon: -52.8, note: "French Guiana. Closest to the equator of the major sites, which is why ESA launches geostationary payloads from here." },
  { name: "Sriharikota", lat: 13.7, lon: 80.2, note: "India's launch site, on the east coast so spent stages fall into the Bay of Bengal." },
  { name: "Cape Canaveral", lat: 28.5, lon: -80.6, note: "Launches east over the Atlantic. Its latitude is the floor on inclination for anything going up from here without a plane change." },
  { name: "Baikonur", lat: 45.6, lon: 63.3, note: "Landlocked, so its launch corridors are constrained by where debris may fall. The ISS's 51.6-degree inclination was chosen so Soyuz could reach it from here." },
  { name: "Plesetsk", lat: 62.9, lon: 40.6, note: "Far north, which suits the high-inclination and polar orbits it mostly serves." },
];

/**
 * Cheapest inclination reachable from a launch site without a plane change.
 * You cannot launch into an inclination lower than your own latitude — the
 * orbit plane has to pass through the launch point, and a plane through a
 * point at latitude L is tilted at least L from the equator. Getting below
 * that costs a plane change, which is one of the most expensive manoeuvres
 * in spaceflight.
 */
export const minInclinationFrom = (siteLat) => Math.abs(siteLat);
