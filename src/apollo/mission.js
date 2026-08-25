// Apollo 11 — the mission model. No DOM, no three.js, no rendering.
//
// Everything in this file is a pure function of scroll progress or of a
// timestamp, which is the point: the visual layer is hard to verify in a
// headless environment, so the parts that can be checked by arithmetic are
// kept somewhere arithmetic can reach them. tools/apollo-mission-check.mjs
// imports this module directly under Node and asserts against it.
//
// It lives in src/ rather than public/assets/js/systems/ (where the site's
// other DOM-free models live) because it is part of the bundled Apollo
// island rather than the raw static site — putting it in public/ would
// ship it twice, once bundled and once verbatim.

/* =========================================================================
   THE VEHICLE AND THE PAD
   ========================================================================= */

// Launch Complex 39A, Kennedy Space Center. The coordinates matter more
// than they look: the launch point is placed on the globe by converting
// these to a surface vector, not by eyeballing a dot onto Florida. So they
// are the published pad figures rather than something read off a map —
// the geodetic latitude and longitude tabulated for Apollo 11 in the
// Launch Information table of NASA SP-2000-4029, Richard W. Orloff,
// "Apollo by the Numbers: A Statistical Reference":
//   Launch Complex 39A, 28.608422 deg N, -80.604133 deg E.
//   https://www.nasa.gov/wp-content/uploads/2023/04/sp-4029.pdf
export const LC39A = {
  name: "Launch Complex 39A",
  place: "Kennedy Space Center, Merritt Island, Florida",
  latDeg: 28.608422,
  lonDeg: -80.604133,
};

// 16 July 1969, 13:32:00 GMT — 09:32 EDT. Same source: "Apollo 11 was
// launched from Kennedy Space Center Launch Complex 39, Pad A, at a Range
// Zero time of 13:32:00 GMT". The table gives actual liftoff as 13:32:00.63;
// the extra 0.63 s is dropped here because it moves the Sun by 0.003 degrees
// and nothing on this page can resolve that.
//
// Used to place the Sun, so the terminator on the homepage is where it
// actually was that morning rather than wherever happened to look nice.
export const LAUNCH_EPOCH_MS = Date.UTC(1969, 6, 16, 13, 32, 0);

/* =========================================================================
   WHERE THE SUN WAS
   =========================================================================

   The low-precision solar position algorithm published by the U.S. Naval
   Observatory's Astronomical Applications Department as "Computing
   Approximate Solar Coordinates", which is the Astronomical Almanac's own
   page-C5 algorithm with its constants refitted against JPL DE405 to widen
   the useful date range. Quoted accuracy is about one arcminute within two
   centuries of 2000, so 1969 is comfortably inside it — and one arcminute
   is several orders of magnitude better than a lighting direction needs to
   be. The reason to compute it rather than hard-code a vector is that a
   computed value can be checked, and a hard-coded one can only be trusted.

   https://aa.usno.navy.mil/faq/sun_approx

   The constants below are transcribed from that page unchanged, which is
   the only way the citation is worth anything: someone can open it and
   compare. */

const DEG = Math.PI / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;
const norm180 = (d) => {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
};

// Days since J2000.0 (2000-01-01 12:00 UTC). Negative for Apollo, which is
// fine — every term below is a plain polynomial in this number.
export const daysSinceJ2000 = (ms) => ms / 86400000 + 2440587.5 - 2451545.0;

// Latitude and longitude of the point with the Sun directly overhead.
export function subSolarPoint(ms) {
  const n = daysSinceJ2000(ms);

  const meanLongitude = norm360(280.459 + 0.98564736 * n);
  const meanAnomaly = norm360(357.529 + 0.98560028 * n) * DEG;

  // Equation of centre, to two terms. The third is under an arcsecond here.
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG;

  const obliquity = (23.439 - 0.00000036 * n) * DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude)
  );

  // Greenwich mean sidereal time gives the rotation of the Earth under the
  // sky; the sub-solar longitude is just the Sun's right ascension read
  // against it. Different source from the block above: these are the IAU
  // 1982 coefficients, as given by Jean Meeus, Astronomical Algorithms
  // (2nd ed.), equation 12.4. The two century terms Meeus carries after
  // them are dropped — over the 31 years back to 1969 they come to under
  // a thousandth of a degree.
  const gmst = norm360(280.46061837 + 360.98564736629 * n);
  const lonDeg = norm180(rightAscension / DEG - gmst);

  return { latDeg: declination / DEG, lonDeg };
}

/* =========================================================================
   GEOMETRY ON THE GLOBE
   =========================================================================

   One conversion, used for both the launch site and the Sun, so the two
   cannot drift apart. The frame is the one three.js's SphereGeometry
   produces for an equirectangular texture: +X at 0 deg longitude, +Z at
   90 deg west, +Y at the north pole. */

export function latLonToUnitVector(latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const c = Math.cos(lat);
  return { x: c * Math.cos(lon), y: Math.sin(lat), z: -c * Math.sin(lon) };
}

// Sun elevation above the local horizon, in degrees. Only used as a check —
// it is the cheapest way to tell whether the lighting is pointing at the
// right side of the planet, because "the Sun was 30 degrees up over Florida
// that morning" is a claim that can be falsified.
export function sunElevationDeg(ms, latDeg, lonDeg) {
  const sun = subSolarPoint(ms);
  const s = latLonToUnitVector(sun.latDeg, sun.lonDeg);
  const p = latLonToUnitVector(latDeg, lonDeg);
  const dot = s.x * p.x + s.y * p.y + s.z * p.z;
  return Math.asin(Math.max(-1, Math.min(1, dot))) / DEG;
}

/* =========================================================================
   THE TIMELINE
   =========================================================================

   Scroll progress is not proportional to mission time, and pretending
   otherwise would be worse, not more honest. Apollo 11 spent two minutes
   forty on the first stage and three days coasting to the Moon; at a
   constant page-distance-per-second the entire launch would occupy about
   one pixel. So the page distance below is authored, and the mission times
   it corresponds to are recorded alongside it rather than derived from it.

   `p` throughout this file is scroll progress through the whole document,
   0 at the top and 1 at the bottom. Nothing here pins, traps or consumes
   scroll — it only reads it. */

export const PHASES = [
  { key: "prelaunch", label: "Launch Complex 39A", from: 0.0, to: 0.075 },
  { key: "ignition", label: "Ignition", from: 0.075, to: 0.115 },
  { key: "liftoff", label: "Liftoff", from: 0.115, to: 0.185 },
  { key: "ascent", label: "First stage", from: 0.185, to: 0.375 },
  { key: "staging1", label: "S-IC separation", from: 0.375, to: 0.425 },
  { key: "secondStage", label: "Second stage", from: 0.425, to: 0.555 },
  { key: "staging2", label: "S-II separation", from: 0.555, to: 0.6 },
  { key: "thirdStage", label: "S-IVB", from: 0.6, to: 0.675 },
  { key: "orbit", label: "Earth orbit", from: 0.675, to: 0.765 },
  { key: "tli", label: "Translunar injection", from: 0.765, to: 0.845 },
  { key: "coast", label: "Translunar coast", from: 0.845, to: 0.955 },
  { key: "lunar", label: "Approaching the Moon", from: 0.955, to: 1.0001 },
];

export function phaseAt(p) {
  for (const phase of PHASES) {
    if (p < phase.to) return phase;
  }
  return PHASES[PHASES.length - 1];
}

/* =========================================================================
   SMALL SHARED MATHS
   ========================================================================= */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Smootherstep. Zero first *and second* derivative at both ends, which is
// the difference between a camera move that reads as a camera move and one
// that reads as a slider being dragged.
export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}


