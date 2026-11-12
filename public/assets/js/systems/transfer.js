// Transfer — the Earth-to-Mars Hohmann transfer and the launch window it forces.
//
// Pure arithmetic, no DOM, so tools/mars-window-check.mjs can run it in Node
// and the page can run the very same functions in a browser.
//
// The model is deliberately the plainest one that still teaches the thing:
// the Sun at the origin, Earth and Mars on circular, coplanar orbits at their
// mean distances, and a spacecraft that leaves Earth tangentially and coasts
// along half of an ellipse that touches Earth's orbit at one end and Mars's
// orbit at the other. That is the Hohmann transfer, and JPL's Basics of Space
// Flight (chapter 4) names it as the least-propellant route to an outer
// planet. Nothing here is tuned. Every constant is a number NASA publishes,
// and every output (transfer time, phase angle, synodic period) is derived
// from those constants, so a reader can reproduce them with a calculator.
//
// What the circles leave out is stated on the page and on the references page:
// Mars's orbit is eccentric (0.0935) and tilted 1.85 degrees to Earth's, and
// real missions fly faster than the Hohmann ellipse. Those are the reasons a
// real flight time differs from the computed one, not errors in it.
//
// Angles are radians, measured counter-clockwise from the +x axis as seen from
// above the north pole of the Sun, which is the direction every planet
// orbits. Distances are kilometres. Time is days, except inside Kepler's
// equation, which wants the gravitational parameter in km^3/s^2 and so runs
// in seconds for one line.

/* ---------- Sourced constants ---------- */

// NASA Planetary Fact Sheet, Mars and Earth pages, "Semimajor axis (10^6 km)":
// Earth 149.598, Mars 227.956. Sidereal orbit periods in days: Earth 365.256,
// Mars 686.980. The Sun page gives GM = 132,712 x 10^6 km^3/s^2 (rounded to
// six figures on the sheet, which is plenty).
export const A_EARTH_KM = 149.598e6;
export const A_MARS_KM = 227.956e6;
export const GM_SUN = 132712e6; // km^3/s^2
export const PERIOD_EARTH_D = 365.256;
export const PERIOD_MARS_D = 686.98;

// The fact sheet publishes a synodic period for Mars as well, 779.94 days.
// It is not used to drive anything. It is here so the check can confirm that
// the value this module derives from the two sidereal periods agrees with the
// value NASA prints.
export const SYNODIC_PUBLISHED_D = 779.94;

// Mars's eccentricity and its perihelion and aphelion distances, from the same
// Mars fact sheet. Used only in the written comparison with real missions.
export const MARS_ECCENTRICITY = 0.0935;
export const MARS_PERIHELION_KM = 206.65e6;
export const MARS_APHELION_KM = 249.261e6;

// Not a NASA number. A teaching threshold chosen for this page: arriving
// within this distance of Mars counts as a hit. Real missions trim their aim
// with trajectory correction maneuvers during the cruise (the Perseverance
// press kit plans four of them), so a page that demanded a zero miss would be
// stricter than reality. 2.5 million km is about 1.4 launch days of slack
// either side of perfect timing, which is why a one-day slider can always
// find a hit and still shows that being a week out is not close.
export const CAPTURE_KM = 2.5e6;

// JPL, Basics of Space Flight chapter 4 and the mission pages the page quotes.
// Dates only; flight times are computed from them below.
export const REAL_MISSIONS = [
  { name: "Curiosity", launch: "2011-11-26", landing: "2012-08-06" },
  // The Perseverance landing press kit gives 203 days and about 471 million
  // km from Earth to Mars, so the distance travelled is a published figure.
  { name: "Perseverance", launch: "2020-07-30", landing: "2021-02-18", pathKm: 471e6 },
];

const TWO_PI = Math.PI * 2;
const SECONDS_PER_DAY = 86400;

/* ---------- Small helpers ---------- */

// Anything that could reach these functions from a slider, a URL or a
// division by zero is turned into a plain number first. A NaN launch day
// would otherwise travel through Math.sin and come out as a NaN pixel
// coordinate, and the browser drops a whole path without a word when it sees
// one.
const finiteOr = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);

export const wrap2pi = (a) => {
  const w = ((finiteOr(a) % TWO_PI) + TWO_PI) % TWO_PI;
  return w;
};

// Map to [-pi, pi): the signed shortest way round. A miss of 359 degrees is a
// miss of one degree in the other direction, and the page has to say so.
export const wrapPi = (a) => wrap2pi(a + Math.PI) - Math.PI;

export const toDeg = (r) => (r * 180) / Math.PI;
export const toRad = (d) => (d * Math.PI) / 180;

// Mean length of a month in days, for the "when is the next window" slider.
export const DAYS_PER_MONTH = PERIOD_EARTH_D / 12;

/* ---------- The transfer orbit ---------- */

// Hohmann transfer between circular orbits of radius r1 (inner) and r2
// (outer). The ellipse has its perihelion at r1 and its aphelion at r2, so
// its semi-major axis is the mean of the two, and the flight is exactly half
// of one revolution: t = pi * sqrt(a^3 / mu).
export function hohmann(r1, r2, mu = GM_SUN) {
  if (!(r1 > 0) || !(r2 > r1) || !(mu > 0)) {
    throw new RangeError("hohmann needs 0 < r1 < r2 and mu > 0");
  }
  const a = (r1 + r2) / 2;
  const e = (r2 - r1) / (r2 + r1);
  const seconds = Math.PI * Math.sqrt((a * a * a) / mu);
  return { a, e, r1, r2, mu, days: seconds / SECONDS_PER_DAY };
}

// A planet's mean motion in radians per day from its sidereal period.
export const meanMotion = (periodDays) => TWO_PI / periodDays;

// Synodic period: how long until the faster planet has gained one full lap on
// the slower. 1/S = 1/P1 - 1/P2.
export function synodicPeriod(p1 = PERIOD_EARTH_D, p2 = PERIOD_MARS_D) {
  return 1 / Math.abs(1 / p1 - 1 / p2);
}

// Where Mars must be, ahead of Earth, at the moment of launch. While the
// spacecraft coasts for `transferDays`, Mars moves through n_mars * t. The
// ship sweeps pi (half the ellipse) and lands at the point opposite its
// launch point, so Mars has to start pi minus that far ahead.
export function requiredLead(transferDays, marsPeriodDays = PERIOD_MARS_D) {
  return wrap2pi(Math.PI - meanMotion(marsPeriodDays) * transferDays);
}

/* ---------- The world: two planets on a day clock ---------- */

// `startLeadDeg` is how far Mars is ahead of Earth on day 0. It is the only
// free parameter, and the page picks it so the first launch misses.
export function makeWorld({ startLeadDeg = 100 } = {}) {
  const transfer = hohmann(A_EARTH_KM, A_MARS_KM);
  const nEarth = meanMotion(PERIOD_EARTH_D);
  const nMars = meanMotion(PERIOD_MARS_D);
  return Object.freeze({
    rEarth: A_EARTH_KM,
    rMars: A_MARS_KM,
    nEarth,
    nMars,
    lead0: wrap2pi(toRad(finiteOr(startLeadDeg, 100))),
    transfer,
    needLead: requiredLead(transfer.days),
    synodic: synodicPeriod(),
  });
}

export const earthAngle = (w, day) => wrap2pi(w.nEarth * finiteOr(day));
export const marsAngle = (w, day) => wrap2pi(w.lead0 + w.nMars * finiteOr(day));

export function planetXY(r, angle) {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

// Mars's lead over Earth on a given day, in [0, 2pi).
export const leadAt = (w, day) => wrap2pi(marsAngle(w, day) - earthAngle(w, day));

// Signed distance from the ideal lead, in [-pi, pi). Positive means Mars is
// further ahead than it should be, so by the time the ship arrives Mars has
// already gone past the arrival point. Negative means the ship arrives early
// and has to wait for Mars.
export const leadError = (w, day) => wrapPi(leadAt(w, day) - w.needLead);

/* ---------- The spacecraft ---------- */

// Kepler's equation M = E - e sin E, solved by Newton's method. The
// eccentricity here is about 0.21 so it settles in three or four steps; the
// loop is bounded anyway so a bad input cannot hang the page.
function eccentricAnomaly(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

// The spacecraft `daysSinceLaunch` after leaving from Earth's position at
// `launchAngle`. Perihelion is the launch point, the motion is prograde, and
// the mean anomaly runs from 0 to pi over the flight. Time is clamped to the
// flight so that asking for the craft after arrival returns the arrival
// point, not an orbit the ship never flew.
export function craftAt(transfer, launchAngle, daysSinceLaunch) {
  const T = transfer.days;
  const t = Math.min(Math.max(finiteOr(daysSinceLaunch), 0), T);
  const M = Math.PI * (t / T);
  const E = eccentricAnomaly(M, transfer.e);
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + transfer.e) * Math.sin(E / 2),
    Math.sqrt(1 - transfer.e) * Math.cos(E / 2)
  );
  const r = transfer.a * (1 - transfer.e * Math.cos(E));
  const angle = finiteOr(launchAngle) + nu;
  return { r, angle, t, fraction: t / T, ...planetXY(r, angle) };
}

// The whole half-ellipse as a polyline, for drawing and for measuring.
export function transferPath(transfer, launchAngle, steps = 90) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    pts.push(craftAt(transfer, launchAngle, (transfer.days * i) / steps));
  }
  return pts;
}

// Length of the half-ellipse in km, by summing straight segments. Used to
// compare with the 471 million km the Perseverance press kit gives.
export function pathLengthKm(transfer, steps = 2000) {
  const pts = transferPath(transfer, 0, steps);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

/* ---------- Launching on a particular day ---------- */

// Fly the transfer from a launch day and report what happened at arrival.
//
// `signedDeg` is how far along its orbit Mars is from the arrival point, in
// degrees. Planets move counter-clockwise, so positive means Mars is already
// beyond the arrival point: it went through that spot earlier and the ship is
// late. Negative means Mars has not reached it yet and the ship is early.
// `daysOff` is the same gap in days at Mars's own angular rate: positive,
// Mars passed the arrival point that many days before the ship; negative,
// Mars gets there that many days after.
export function flyby(w, launchDay) {
  const day0 = Math.max(0, finiteOr(launchDay));
  const T = w.transfer.days;
  const launchAngle = earthAngle(w, day0);
  const arriveDay = day0 + T;
  const craft = craftAt(w.transfer, launchAngle, T);
  const marsA = marsAngle(w, arriveDay);
  const mars = planetXY(w.rMars, marsA);
  const missKm = Math.hypot(craft.x - mars.x, craft.y - mars.y);
  const signed = wrapPi(marsA - craft.angle);
  return {
    launchDay: day0,
    arriveDay,
    launchAngle,
    craft,
    marsAngle: marsA,
    mars,
    missKm,
    hit: missKm <= CAPTURE_KM,
    signedDeg: toDeg(signed),
    daysOff: signed / w.nMars,
  };
}

// Launch days in [from, to] where the lead is exactly right, one per
// synodic period. The lead falls by (nEarth - nMars) every day, so the
// first such day after day zero comes from a single division and each
// later one is a synodic period further on.
export function windowDays(w, from, to) {
  const rate = w.nEarth - w.nMars; // radians per day the lead shrinks by
  const first = wrap2pi(w.lead0 - w.needLead) / rate;
  const out = [];
  for (let d = first; d <= to; d += w.synodic) {
    if (d >= from) out.push(d);
  }
  return out;
}

/* ---------- The clock ---------- */

// Advance a running clock toward a target day. With reduced motion the
// answer is the target itself, so a flight that would have taken six seconds
// of animation is simply over, and the page shows its result frame.
export function stepClock(day, target, dt, daysPerSecond, reduced = false) {
  const d = finiteOr(day);
  const t = finiteOr(target, d);
  if (reduced) return t;
  const step = Math.max(0, finiteOr(dt)) * Math.max(0, finiteOr(daysPerSecond));
  return d < t ? Math.min(t, d + step) : Math.max(t, d - step);
}

/* ---------- Real flights, for comparison ---------- */

const MS_PER_DAY = 86400000;

// Whole days between two ISO dates. Both are read as UTC midnights, so a
// daylight-saving change cannot add or remove an hour.
export function daysBetween(isoA, isoB) {
  const parse = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(isoB) - parse(isoA)) / MS_PER_DAY);
}

export const missionDays = (m) => daysBetween(m.launch, m.landing);
