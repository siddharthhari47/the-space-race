// Solar scale — the Sun and the eight planets on one line, at one scale.
//
// Pure arithmetic, no DOM, so tools/solar-scale-check.mjs can run it in Node
// and the page can run the very same functions in a browser.
//
// The exhibit lays the Solar System out as a single vertical line, the Sun at
// the top and Neptune at the bottom, and puts both the distances and the
// sizes on the same scale. That is the whole lesson. Every poster of the
// planets cheats on one or the other, because at a scale where the planets
// are big enough to see, Neptune is a few kilometres down the road, and at a
// scale that fits on a screen the planets are smaller than a pixel. This
// module picks a scale where the Sun is 40 CSS pixels across, lets Earth come
// out at about a third of a pixel, and does not round anything up. The page
// draws a ring around each planet so it can be found; the ring is labelled as
// not to scale, and the dot inside it is.
//
// Distances are the fact sheet's "Distance from Sun", which its notes define
// as the average distance, also known as the semi-major axis. Real distances
// change over each orbit (Earth's runs from 147.1 to 152.1 million km on the
// same sheet), and the page says so in one line. Distances are measured from
// the Sun's centre, as the fact sheet's are, so the light times here are
// centre-to-centre too.
//
// Units: kilometres, seconds, CSS pixels.

/* ---------- Sourced constants ---------- */

// Speed of light in vacuum, exact by definition of the metre.
// NIST CODATA 2022, "speed of light in vacuum c": 299 792 458 m s^-1 (exact).
export const C_KM_S = 299792.458;

// The astronomical unit, exact by definition.
// IAU 2012 Resolution B2, recommends 1: "a conventional unit of length equal
// to 149 597 870 700 m exactly".
export const AU_KM = 149597870.7;

// The Sun's size. NASA NSSDCA Sun Fact Sheet, Bulk parameters,
// "Volumetric mean radius (km)": 695,700. The diameter is twice that. This is
// a mean diameter, while the planets' figures below are equatorial; the Sun
// is so nearly round that the difference is far below a pixel at this scale,
// and the references card says which is which.
export const SUN_RADIUS_KM = 695700;
export const SUN_DIAMETER_KM = 2 * SUN_RADIUS_KM;

// NASA NSSDCA Planetary Fact Sheet - Metric (last updated 18 March 2025).
// distanceKm: the row "Distance from Sun (10^6 km)", times 10^6.
// diameterKm: the row "Diameter (km)", the equatorial diameter per the
// sheet's notes.
// The same sheet's "Perihelion" and "Aphelion" rows give Earth 147.1 and
// 152.1; they are quoted on the page and not used to draw anything.
export const PLANETS = [
  { id: "mercury", name: "Mercury", distanceKm: 57.9e6, diameterKm: 4879 },
  { id: "venus", name: "Venus", distanceKm: 108.2e6, diameterKm: 12104 },
  { id: "earth", name: "Earth", distanceKm: 149.6e6, diameterKm: 12756 },
  { id: "mars", name: "Mars", distanceKm: 228.0e6, diameterKm: 6792 },
  { id: "jupiter", name: "Jupiter", distanceKm: 778.5e6, diameterKm: 142984 },
  { id: "saturn", name: "Saturn", distanceKm: 1432.0e6, diameterKm: 120536 },
  { id: "uranus", name: "Uranus", distanceKm: 2867.0e6, diameterKm: 51118 },
  { id: "neptune", name: "Neptune", distanceKm: 4515.0e6, diameterKm: 49528 },
];

export const EARTH_PERIHELION_KM = 147.1e6;
export const EARTH_APHELION_KM = 152.1e6;

// NASA NSSDCA Mars Fact Sheet (last updated 19 May 2025), "Distance from
// Earth": minimum 54.6 and maximum 401.4 (10^6 km). Used for the one line on
// how long a radio message to Mars takes at its closest and its farthest.
export const MARS_EARTH_MIN_KM = 54.6e6;
export const MARS_EARTH_MAX_KM = 401.4e6;

/* ---------- The scale ---------- */

// Not a NASA number: the page's own choice. The Sun is 40 CSS pixels across,
// small enough that the walk to Neptune is about 130,000 pixels and not a
// million, and large enough that the Sun is still a disc on screen. Every
// distance and every size on the page is divided by the same KM_PER_PX.
export const SUN_PX = 40;
export const KM_PER_PX = SUN_DIAMETER_KM / SUN_PX;

const finiteOr = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);

export const kmToPx = (km) => finiteOr(km) / KM_PER_PX;
export const pxToKm = (px) => finiteOr(px) * KM_PER_PX;
export const kmToAu = (km) => finiteOr(km) / AU_KM;

// The far end of the walk. Scrolling stops exactly on Neptune.
export const NEPTUNE = PLANETS[PLANETS.length - 1];
export const WALK_KM = NEPTUNE.distanceKm;
export const WALK_PX = kmToPx(WALK_KM);

// A clamp to the walk, for anything that comes from a scroll position or a
// clock and might overshoot by a frame.
export const clampKm = (km) => Math.min(Math.max(finiteOr(km), 0), WALK_KM);

/* ---------- Light ---------- */

// One-way light time over a distance, in seconds.
export const lightSeconds = (km) => finiteOr(km) / C_KM_S;

// Where a photon is after t seconds, at a speed multiplier, starting from the
// Sun. At 1x it is the real speed of light and takes about 8 min 19 s to
// reach Earth.
export const photonKm = (seconds, multiplier = 1) =>
  clampKm(C_KM_S * finiteOr(seconds) * finiteOr(multiplier, 1));

// The rule the page's photon race actually runs. The race is a chain of
// segments, one per speed: each starts at a known distance and a known
// wall-clock time, and the photon's distance is worked out fresh from the
// clock on every frame rather than added up frame by frame. Adding up loses
// time whenever the browser skips frames, and a background tab skips all of
// them, so a visitor who started at 1x and looked away for five minutes
// would come back to a photon five minutes behind real light. Worked from
// the clock, it catches up on the first frame back. The clamp comes after
// the addition, so a segment that starts partway out still stops at Neptune.
export const photonAt = (startKm, seconds, multiplier = 1) =>
  clampKm(finiteOr(startKm) + C_KM_S * Math.max(0, finiteOr(seconds)) * finiteOr(multiplier, 1));

// How long, in real seconds, the photon needs to cover a distance at a speed
// multiplier. The readout counts this down to the next planet while racing.
export const raceSeconds = (km, multiplier = 1) =>
  Math.max(0, finiteOr(km)) / C_KM_S / Math.max(finiteOr(multiplier, 1), 1e-9);

// Screen speed of light at this scale, in CSS pixels per second, at 1x.
export const LIGHT_PX_PER_S = kmToPx(C_KM_S);

// "8 min 19 s", "4 h 11 min 0 s", "42 s". Seconds are floored, so a clock
// counting up never shows a second it has not reached yet.
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(finiteOr(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} h ${m} min ${r} s`;
  if (m > 0) return `${m} min ${r} s`;
  return `${r} s`;
}

// The same format for a fixed figure (a table row, a planet label, the Mars
// radio delay). Those are not counting up, so they round to the nearest
// second: Venus at 360.9 s is 6 min 1 s, not 6 min 0 s.
export const formatFixed = (seconds) => formatDuration(Math.round(finiteOr(seconds)));

/* ---------- Where you are ---------- */

// The planet at or just past a distance, or null beyond Neptune.
export function nextPlanet(km) {
  const d = finiteOr(km);
  return PLANETS.find((p) => p.distanceKm > d + 1) || null;
}

// The last planet passed, or null before Mercury.
export function lastPlanet(km) {
  const d = finiteOr(km);
  let last = null;
  for (const p of PLANETS) if (p.distanceKm <= d + 1) last = p;
  return last;
}

// The planet within `windowKm` of a distance, used to say "You are at Mars"
// rather than "Mars in 0.2 million km".
export function planetNear(km, windowKm) {
  const d = finiteOr(km);
  return PLANETS.find((p) => Math.abs(p.distanceKm - d) <= windowKm) || null;
}

/* ---------- Derived figures the page quotes ---------- */

// How many Sun diameters out each planet is. Earth is about 107.5, which is
// the answer to "if the Sun were a 1 cm bead, how far away is Earth?":
// 107.5 cm.
export const sunWidthsOut = (p) => p.distanceKm / SUN_DIAMETER_KM;

// Fraction of the Sun-to-Neptune line covered if the Sun and all eight
// planets were laid along it end to end. About 0.04%.
export function filledFraction() {
  const bodies = SUN_DIAMETER_KM + PLANETS.reduce((t, p) => t + p.diameterKm, 0);
  return bodies / WALK_KM;
}

// A planet's true size on screen at this scale.
export const sizePx = (p) => kmToPx(p.diameterKm);

// The page draws a second copy of each planet, magnified, so they can be
// compared with each other. One magnification for all of them, so the copies
// are still to scale with one another.
export const INSET_MAG = 40;

/* ---------- The predictions ---------- */

// Each question's choices and which one is right, decided by the numbers
// above rather than written in by hand, so a change to a constant cannot
// leave a question scoring the wrong answer.
export const QUESTIONS = {
  bead: {
    // If the Sun were a 1 cm bead, Earth would be sunWidthsOut(Earth) cm away.
    choices: [
      { id: "10cm", label: "About 10 cm", cm: 10 },
      { id: "1m", label: "About 1 m", cm: 100 },
      { id: "10m", label: "About 10 m", cm: 1000 },
      { id: "100m", label: "About 100 m", cm: 10000 },
    ],
    answerCm: () => sunWidthsOut(PLANETS[2]),
  },
  neptune: {
    choices: [
      { id: "4min", label: "About 4 minutes", s: 240 },
      { id: "40min", label: "About 40 minutes", s: 2400 },
      { id: "4h", label: "About 4 hours", s: 14400 },
      { id: "4d", label: "About 4 days", s: 345600 },
    ],
    answerS: () => lightSeconds(NEPTUNE.distanceKm),
  },
};

// The right choice is the one nearest the true value on a log scale, since
// the choices are a factor of ten apart.
export function correctChoice(question) {
  const q = QUESTIONS[question];
  if (!q) return null;
  const truth = question === "bead" ? q.answerCm() : q.answerS();
  const key = question === "bead" ? "cm" : "s";
  let best = null;
  let bestErr = Infinity;
  for (const c of q.choices) {
    const err = Math.abs(Math.log10(c[key] / truth));
    if (err < bestErr) { bestErr = err; best = c; }
  }
  return best;
}

/* ---------- Marks along the strip ---------- */

// The strip carries two kinds of mark on its left-hand rail: one every
// light-minute, labelled with the time light takes to get there, and one
// every astronomical unit. They share the rail because the right-hand side is
// where the planet labels go, and a phone has no room for a third column.
// Two marks closer than `minGapPx` would print on top of each other, which
// happens a few times out to Neptune (19 AU is 158.02 light-minutes, nine
// pixels from the 158-minute mark), so the light-minute label gives way and
// keeps only its tick. The AU label wins because there are fewer of them.
export function lightMinuteLabel(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function railMarks(minGapPx = 18) {
  const marks = [];
  const auMarks = [];
  for (let n = 1; n * AU_KM <= WALK_KM; n++) {
    auMarks.push({ kind: "au", px: kmToPx(n * AU_KM), text: `${n} AU` });
  }
  const minuteKm = C_KM_S * 60;
  for (let n = 1; n * minuteKm <= WALK_KM; n++) {
    const px = kmToPx(n * minuteKm);
    const clash = auMarks.some((a) => Math.abs(a.px - px) < minGapPx);
    marks.push({ kind: "min", px, text: clash ? "" : lightMinuteLabel(n) });
  }
  return [...marks, ...auMarks].sort((a, b) => a.px - b.px);
}
