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
  // against it.
  const lonDeg = norm180(rightAscension / DEG - gmstDeg(ms));

  return { latDeg: declination / DEG, lonDeg };
}

/* Greenwich mean sidereal time, in degrees.

   These are the IAU 1982 coefficients, as given by Jean Meeus, Astronomical
   Algorithms (2nd ed.), equation 12.4. The two century terms Meeus carries
   after them are dropped -- over the 31 years back to 1969 they come to
   under a thousandth of a degree.

   Pulled out of subSolarPoint so the Moon can be read against the same
   rotation the Sun is. Two bodies placed against two slightly different
   ideas of where Greenwich is pointing would put the terminator and the
   Moon in inconsistent places, and that error would be far too small to
   notice and far too annoying to find later.
*/
export function gmstDeg(ms) {
  return norm360(280.46061837 + 360.98564736629 * daysSinceJ2000(ms));
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
   WHERE THE MOON WAS
   =========================================================================

   Not a formula. The Sun above is computed, because a two-term equation of
   centre is good to an arcminute and fits in a paragraph. The Moon is not
   like that -- getting it right from series takes dozens of periodic terms,
   and a truncated version written from memory is exactly the kind of thing
   that looks authoritative and is quietly wrong by a degree.

   So these are measurements, not derivations: geocentric apparent right
   ascension, declination and range for the Moon, read straight out of NASA
   JPL's Horizons system on the DE441 ephemeris, at twelve-hour steps across
   the mission. Anyone can reproduce the table:

     https://ssd.jpl.nasa.gov/horizons/app.html
       Ephemeris Type  Observer Table
       Target Body     Moon (301)
       Observer        Geocentric (500@399)
       Time Span       1969-07-16 12:00 to 1969-07-21 12:00, step 12 h
       Table Settings  quantities 1,20 (astrometric RA & Dec, delta)

   The numbers below are transcribed unchanged, which is the only thing that
   makes the citation worth anything. RA and Dec are ICRF degrees; delta is
   in astronomical units, as Horizons gives it, and is converted here rather
   than in the table so the transcription stays a transcription.

   Twelve hours is close enough spacing that a straight line between samples
   is good to a few arcminutes, which is a small fraction of the Moon's own
   half-degree disc -- so the interpolation below is linear and does not
   pretend to be anything better.

   Over these five days the Moon moves about 56 degrees against the stars
   and closes about 12,000 km. It was near apogee when Apollo 11 left, which
   is why the range starts above 404,000 km rather than at the 384,400 km
   everyone quotes. */

const MOON_EPOCH_MS = Date.UTC(1969, 6, 16, 12, 0, 0);
const MOON_STEP_MS = 12 * 3600 * 1000;

// One astronomical unit in kilometres, IAU 2012 exact definition.
const AU_KM = 149597870.7;

//                 RA deg      Dec deg      delta AU
const MOON_ROWS = [
  [138.51259,   19.30417,  0.00270089451560], // 1969-Jul-16 12:00
  [144.34678,   17.03101,  0.00269416655715], // 1969-Jul-17 00:00
  [150.06184,   14.58330,  0.00268629719763], // 1969-Jul-17 12:00
  [155.67756,   11.98486,  0.00267726781006], // 1969-Jul-18 00:00
  [161.21785,    9.25899,  0.00266706260550], // 1969-Jul-18 12:00
  [166.71006,    6.42853,  0.00265567336021], // 1969-Jul-19 00:00
  [172.18439,    3.51613,  0.00264310453452], // 1969-Jul-19 12:00
  [177.67355,    0.54467,  0.00262937861400], // 1969-Jul-20 00:00
  [183.21252,   -2.46214,  0.00261454147778], // 1969-Jul-20 12:00
  [188.83834,   -5.47912,  0.00259866757222], // 1969-Jul-21 00:00
  [194.58986,   -8.47878,  0.00258186463644], // 1969-Jul-21 12:00
];

/* The Moon at a moment, in the frame the rest of this scene is drawn in.

   The subtlety worth stating: latDeg and lonDeg here are NOT the sub-lunar
   point at `ms`. They are the Moon's direction expressed in the Earth-fixed
   frame *frozen at the launch epoch*, which is the frame scene.js treats as
   world space -- at load time the ground and the world frame coincide, the
   Sun is pinned there once, and afterwards earthGroup spins underneath.
   Reading the Moon against gmstDeg(ms) instead would spin it around the
   planet once a day along with the ground, which is exactly backwards: over
   the minutes this page is open, and over the days the mission takes, the
   Moon does not go round the Earth once every twenty-four hours -- the
   Earth turns underneath it.

   So the longitude below is read against Greenwich as it was at 13:32 GMT
   on 16 July 1969 and never again, and what is left moving is the Moon's
   own 13 degrees a day along its orbit. */
export function moonAt(ms) {
  const t = (ms - MOON_EPOCH_MS) / MOON_STEP_MS;
  const last = MOON_ROWS.length - 1;
  const i = Math.max(0, Math.min(last - 1, Math.floor(t)));
  const f = Math.max(0, Math.min(1, t - i));
  const a = MOON_ROWS[i];
  const b = MOON_ROWS[i + 1];

  const raDeg = a[0] + (b[0] - a[0]) * f;
  const decDeg = a[1] + (b[1] - a[1]) * f;
  const deltaAu = a[2] + (b[2] - a[2]) * f;

  return {
    raDeg,
    decDeg,
    distanceKm: deltaAu * AU_KM,
    latDeg: decDeg,
    lonDeg: norm180(raDeg - gmstDeg(LAUNCH_EPOCH_MS)),
  };
}

// The Moon's radius, kilometres. IAU mean radius, the same number the
// texture in public/assets/textures was reprojected against.
export const MOON_RADIUS_KM = 1737.4;

// Obliquity of the ecliptic at J2000, degrees. IAU value.
export const OBLIQUITY_DEG = 23.4393;

/* Which way lunar north points, in the same frozen world frame as moonAt.

   The Moon's rotation axis is not the Earth's and is not the Moon's orbit
   normal either. What it is very nearly is the pole of the ecliptic: the
   axis sits 1.54 degrees from it, and unlike almost everything else about
   the Moon that angle stays put rather than wandering. So lunar north is
   taken to be the ecliptic pole exactly and the degree and a half is
   dropped, which rolls the visible disc by about that much -- a fifth of
   the libration that is already not modelled, and far below anything this
   page could show.

   The ecliptic pole is at right ascension 270 degrees, declination 90 minus
   the obliquity, by definition. Read into the scene the same way the Moon
   is: against Greenwich as it stood at the launch epoch, once. */
export const LUNAR_NORTH = {
  latDeg: 90 - OBLIQUITY_DEG,
  lonDeg: norm180(270 - gmstDeg(LAUNCH_EPOCH_MS)),
};

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

// staging1, staging2 and orbit are pinned to flight.js's EVENTS -- staging1,
// staging2 and orbitInsertion respectively -- because the interlude moved
// them there: #saturn-v now sits between #playground and #writing, and its
// five captions fire the separations they describe as each one comes fully
// into view. Everything from "ascent" to "tli" is squeezed into what used to
// be a much wider run of the page for the same reason: the events it used to
// have room around no longer have that room, having moved into the
// interlude's own three screens instead.
export const PHASES = [
  { key: "prelaunch", label: "Launch Complex 39A", from: 0.0, to: 0.075 },
  { key: "ignition", label: "Ignition", from: 0.075, to: 0.115 },
  { key: "liftoff", label: "Liftoff", from: 0.115, to: 0.185 },
  { key: "ascent", label: "First stage", from: 0.185, to: 0.593 },
  { key: "staging1", label: "S-IC separation", from: 0.593, to: 0.660 },
  { key: "secondStage", label: "Second stage", from: 0.660, to: 0.682 },
  { key: "staging2", label: "S-II separation", from: 0.682, to: 0.690 },
  { key: "thirdStage", label: "S-IVB", from: 0.690, to: 0.696 },
  { key: "orbit", label: "Earth orbit", from: 0.696, to: 0.702 },
  { key: "tli", label: "Translunar injection", from: 0.702, to: 0.734 },
  { key: "coast", label: "Translunar coast", from: 0.734, to: 0.955 },
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


