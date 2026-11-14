// Checks for the "A day on the ISS" model (systems/iss-day.js).
//
// Verified here, each against something worked out another way:
//   1. circular speed and period agree with groundtrack.js and with a hand
//      computation from MU and R_EARTH
//   2. energy is conserved along level-1 paths (RK4) and the closed-form
//      conic gives the same lowest and highest points the path reaches
//   3. the falls-in / orbit / escape speeds agree with the analytic ones
//   4. the shadow fraction with the Sun in the orbit plane is asin(R/r)/pi,
//      and the general-beta formula agrees with a brute-force sweep
//   5. sunrises in 24 h are 86400/T to within one
//   6. visibility is never true in shadow or with the observer's Sun above
//      the twilight angle (swept over places and times)
//   7. a known geometry (observer under the station, Sun just below the
//      horizon) gives a visible pass, and the two near misses do not
//   8. the model's ground position agrees with groundTrack()

import {
  MU, R_EARTH, SIDEREAL_DAY, ALT_KM, INC_DEG, STOP_ALT_KM, MIN_ELEV_DEG, TWILIGHT_DEG, DAY_S,
  period, speed, groundTrack,
  circularSpeed, escapeSpeed, gravityFraction, conic, fallSpeed, throwOutcome, simulateThrow,
  orbitPeriod, meanMotion, criticalBetaDeg, eclipseFraction, inShadowPlane, sunEvents,
  CREW_BLOCKS, makeScenario, stationECI, sunVector, stationInSun, subPoint, sunElevation,
  subSolarPoint, look, scanDay, whyNone, nodalRateDegPerDay, relativeDriftDegPerDay, maxLatitudeFor,
} from "../public/assets/js/systems/iss-day.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log("  ok  " + msg);
  else { failures++; console.log("  FAIL " + msg); }
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b}, tol ${tol})`);
const DEG = Math.PI / 180;

console.log("1. circular speed and period");
{
  const r = R_EARTH + ALT_KM;
  near(circularSpeed(), Math.sqrt(398600.4418 / r), 1e-9, "circular speed = sqrt(mu/r) by hand");
  near(circularSpeed(), speed(ALT_KM), 1e-12, "circular speed matches groundtrack.speed");
  near(orbitPeriod(), 2 * Math.PI * Math.sqrt(r ** 3 / 398600.4418), 1e-6, "period by hand");
  near(orbitPeriod(), period(ALT_KM), 1e-12, "period matches groundtrack.period");
  near(circularSpeed(), 7.668, 0.002, "about 7.67 km/s");
  near(orbitPeriod() / 60, 92.5, 0.1, "about 92.5 minutes");
  near(gravityFraction(), (R_EARTH / r) ** 2, 1e-12, "gravity fraction (R/r)^2");
  near(escapeSpeed(), Math.SQRT2 * circularSpeed(), 1e-12, "escape = sqrt2 x circular");
}

console.log("2. energy along level-1 paths");
for (const v of [3, 5.5, 7.0, 7.668, 8.2, 9.5, 10.5, 11.5]) {
  const s = simulateThrow(v);
  const c = conic(v);
  ok(s.energyDrift < 1e-6, `v=${v}: energy drift ${s.energyDrift.toExponential(2)} < 1e-6 (${s.outcome})`);
  // Angular momentum from the path's own points: r x v is not stored, so use
  // the closed-form radius at the end instead: path radius must lie on the conic.
  let worst = 0;
  const h = c.h;
  for (const p of s.path) {
    // Polar angle from the launch point (clockwise). Launch is at periapsis for v >= vc
    // and at apoapsis for v < vc; the conic radius in terms of the angle phi from launch:
    const phi = Math.atan2(p.x, p.y);
    const ph = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // r = p / (1 + e cos(nu)), nu = ph (launch at periapsis) or ph + pi (launch at apoapsis)
    const nu = v >= circularSpeed() ? ph : ph + Math.PI;
    const rr = c.p / (1 + c.e * Math.cos(nu));
    if (rr > 0 && Number.isFinite(rr)) worst = Math.max(worst, Math.abs(rr - p.r) / p.r);
  }
  ok(worst < 1e-4, `v=${v}: path lies on the closed-form conic (worst ${worst.toExponential(2)})`);
}

console.log("3. speed thresholds");
{
  const r0 = R_EARTH + ALT_KM; const rs = R_EARTH + STOP_ALT_KM;
  const vFall = fallSpeed();
  // By hand: apoapsis speed of the ellipse whose perigee is rs.
  const a = (r0 + rs) / 2;
  const byHand = Math.sqrt(MU * (2 / r0 - 1 / a));
  near(vFall, byHand, 1e-9, "fall threshold = vis-viva at apogee of the grazing ellipse");
  ok(throwOutcome(vFall - 0.01) === "falls", "just below the fall speed falls in");
  ok(throwOutcome(vFall + 0.01) === "orbits", "just above the fall speed orbits");
  ok(throwOutcome(circularSpeed()) === "orbits", "circular speed orbits");
  ok(throwOutcome(escapeSpeed() - 0.01) === "orbits", "just below escape orbits");
  ok(throwOutcome(escapeSpeed() + 0.01) === "escapes", "just above escape escapes");
  ok(simulateThrow(vFall - 0.05).fell, "integrated path just below the fall speed reaches the stop line");
  ok(!simulateThrow(vFall + 0.05).fell, "integrated path just above it does not");
  near(simulateThrow(vFall - 0.05).path.at(-1).h, STOP_ALT_KM, 1e-6, "a falling path ends at the stop altitude");
  const e = simulateThrow(escapeSpeed() + 0.2);
  ok(e.leaves && !e.fell, "above escape the path leaves the view");
  const c = simulateThrow(circularSpeed());
  ok(c.laps, "circular speed goes once round");
  ok(c.maxAltKm - c.minAltKm < 0.5, "circular path keeps its height (" + (c.maxAltKm - c.minAltKm).toFixed(4) + " km spread)");
  near(conic(circularSpeed()).e, 0, 1e-9, "circular speed has eccentricity 0");
  near(conic(escapeSpeed()).energy, 0, 1e-9, "escape speed has zero energy");
}

console.log("4. shadow fraction");
{
  const r = R_EARTH + ALT_KM;
  near(eclipseFraction(0), Math.asin(R_EARTH / r) / Math.PI, 1e-12, "beta 0: asin(R/r)/pi");
  near(eclipseFraction(0) * orbitPeriod() / 60, 36.1, 0.3, "about 36 minutes of night per orbit");
  ok(eclipseFraction(criticalBetaDeg() + 0.1) === 0, "no night above the critical beta");
  near(criticalBetaDeg(), 70.2, 0.1, "critical beta about 70 degrees");
  for (const beta of [0, 20, 45, 60, 68]) {
    let n = 0; const N = 36000;
    for (let k = 0; k < N; k++) if (inShadowPlane((k / N) * 2 * Math.PI, beta)) n++;
    near(n / N, eclipseFraction(beta), 2e-4, `beta ${beta}: brute-force sweep agrees with the formula`);
  }
}

console.log("5. sunrises in 24 h");
for (const beta of [0, 30, 60]) {
  for (const phi0 of [0, 1, 2.5, 4]) {
    const ev = sunEvents(DAY_S, { betaDeg: beta, phi0 });
    const expected = DAY_S / orbitPeriod();
    ok(Math.abs(ev.sunrises.length - expected) <= 1, `beta ${beta} phi0 ${phi0}: ${ev.sunrises.length} sunrises vs ${expected.toFixed(2)}`);
    // Every event must really be an edge of the shadow test.
    const n = meanMotion();
    let good = true;
    for (const t of ev.sunrises) {
      const before = inShadowPlane(phi0 + n * (t - 2), beta); const after = inShadowPlane(phi0 + n * (t + 2), beta);
      if (!(before && !after)) good = false;
    }
    ok(good, `beta ${beta} phi0 ${phi0}: every sunrise is a shadow exit`);
  }
}
ok(sunEvents(DAY_S, { betaDeg: 75 }).sunrises.length === 0, "above critical beta: no sunrises");

console.log("6. visibility rules");
{
  let seen = 0; let visible = 0; let bad = 0;
  for (const day of [0, 3]) {
    const sc = makeScenario(day);
    for (let lat = -60; lat <= 60; lat += 15) {
      for (let lon = -180; lon < 180; lon += 45) {
        for (let t = 0; t < DAY_S; t += 97) {
          const l = look(t, lat, lon, sc);
          seen++;
          if (l.visible) {
            visible++;
            if (!l.inSun || l.sunElevDeg > -TWILIGHT_DEG || l.elevDeg < MIN_ELEV_DEG) bad++;
            // independent check of sunlight: shadow test from the raw vectors
            const p = stationECI(t, sc); const s = sunVector(t, sc);
            const along = p[0] * s[0] + p[1] * s[1] + p[2] * s[2];
            const perp = Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2 - along * along);
            if (along < 0 && perp < R_EARTH) bad++;
          }
        }
      }
    }
  }
  ok(seen > 50000, `swept ${seen} place-times`);
  ok(visible > 0, `${visible} of them were visible, so the test is not empty`);
  ok(bad === 0, "no visible sample is in shadow, in daylight or below the minimum elevation");
}

console.log("7. known geometry");
{
  // Put the observer under the station and set the Sun a chosen angle below
  // that observer's horizon. A station overhead is lit iff the Sun is less
  // than acos(R/r) below the horizon, about 19.8 degrees at 400 km.
  const sc = makeScenario(0);
  const t = 1234;
  const sp = subPoint(t, sc);
  const th = sp.lon * DEG + sc.theta0 + (2 * Math.PI / SIDEREAL_DAY) * t;
  const la = sp.lat * DEG;
  const up = [Math.cos(la) * Math.cos(th), Math.cos(la) * Math.sin(th), Math.sin(la)];
  // Build a Sun direction at depression d below the observer's horizon, in
  // the plane of the observer's up and any perpendicular.
  const perp = [-Math.sin(th), Math.cos(th), 0];
  const place = (d) => {
    const s = up.map((u, i) => -Math.sin(d * DEG) * u + Math.cos(d * DEG) * perp[i]);
    const lam = Math.atan2(s[1], s[0]);
    // This scenario's Sun stays on the equator; use it only if s_z ~ 0. Our
    // perp is horizontal in the equatorial plane, so s_z = -sin(d) up_z.
    return { s, lam };
  };
  // The scenario's Sun is on the equator, so test with a fresh scenario whose
  // Sun is placed by hand: override lam0 and use the observer at the equator.
  const crossing = { ...sc };
  const rows = [];
  for (const d of [3, 8, 15, 25]) {
    // Observer on the equator under the station: choose t so the station is on the equator.
    // u = pi*k gives lat 0; pick t where u = 0 (t = 0 with u0 = 0).
    const t0 = 0;
    const sub = subPoint(t0, sc);
    const th0 = sub.lon * DEG + sc.theta0;
    // Sun at depression d along the observer's east direction on the equator:
    // the Sun's ECI longitude is th0 + (90 + d) degrees (east of the observer's meridian by 90+d => d below).
    const lamSun = th0 - (90 + d) * DEG; // west side: evening
    const scx = { ...sc, lam0: lamSun };
    const l = look(t0, sub.lat, sub.lon, scx);
    rows.push({ d, l });
  }
  const byD = Object.fromEntries(rows.map((r) => [r.d, r.l]));
  near(byD[8].elevDeg, 90, 1e-6, "observer under the station sees it at 90 degrees");
  near(byD[8].sunElevDeg, -8, 1e-6, "Sun is 8 degrees below the horizon as built");
  ok(byD[8].visible, "Sun 8 degrees down, station overhead: visible");
  ok(byD[15].visible, "Sun 15 degrees down: still lit (limit 19.8), visible");
  ok(!byD[3].visible && byD[3].inSun, "Sun 3 degrees down: lit but too bright a sky, not visible");
  ok(!byD[25].visible && !byD[25].inSun, "Sun 25 degrees down: station in shadow, not visible");
  near(Math.acos(R_EARTH / (R_EARTH + ALT_KM)) / DEG, 19.8, 0.1, "the lit limit is about 19.8 degrees");
  void place; void crossing;
}

console.log("8. ground position matches groundTrack()");
{
  const sc = makeScenario(0);
  const T = orbitPeriod();
  const gt = groundTrack({ altKm: ALT_KM, incDeg: INC_DEG, raanDeg: sc.raan / DEG, orbits: DAY_S / T, samples: 400 });
  // groundTrack's own start phase and Earth angle may differ; compare the
  // curve's shape instead: same latitude range and the same lon step per orbit.
  const lats = gt.map((p) => p.lat ?? p[0]);
  near(Math.max(...lats), INC_DEG, 0.3, "track reaches the inclination in latitude");
  const track = [];
  for (let t = 0; t <= DAY_S; t += 60) track.push(subPoint(t, sc));
  near(Math.max(...track.map((p) => p.lat)), INC_DEG, 0.3, "model track reaches the inclination too");
  // Westward shift per orbit: Earth turns T * 360/sidereal degrees.
  const unwrapShift = (arr) => {
    // longitude of the ascending crossing of the equator, orbit to orbit
    const out = [];
    for (let i = 1; i < arr.length; i++) if (arr[i - 1].lat < 0 && arr[i].lat >= 0) {
      // interpolate to the crossing; unwrap the longitude step first
      let dl = arr[i].lon - arr[i - 1].lon; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
      const f = -arr[i - 1].lat / (arr[i].lat - arr[i - 1].lat);
      out.push(arr[i - 1].lon + dl * f);
    }
    return out;
  };
  const cr = unwrapShift(track);
  let d = (cr[1] - cr[0]); while (d > 180) d -= 360; while (d < -180) d += 360;
  near(d, -(T * 360) / SIDEREAL_DAY, 0.4, "successive equator crossings step west by T x 360/sidereal day");
  ok(Array.isArray(gt) && gt.length > 100, "groundTrack() returned a track to compare against");
}

console.log("9. day, Sun and scenario");
{
  const sc = makeScenario(0);
  const s0 = subSolarPoint(0, sc); const s1 = subSolarPoint(DAY_S, sc);
  near(Math.abs(s0.lon), 180, 1e-6, "Sun over longitude 180 at 00:00 GMT");
  let dd = s1.lon - s0.lon; while (dd > 180) dd -= 360; while (dd < -180) dd += 360;
  near(dd, 0, 0.3, "a 24 h day brings the Sun back to the same longitude");
  near(sunElevation(0, 0, 12 * 3600, sc), 90, 0.3, "Sun overhead at the equator, longitude 0, at 12:00 GMT");
  const dr = nodalRateDegPerDay();
  near(dr, -5.0, 0.2, "J2 node drift about -5 degrees a day (model value " + dr.toFixed(2) + ")");
  near(relativeDriftDegPerDay(), dr - 0.9856, 0.01, "relative to the Sun it is about 0.99 degree more westward");
  near(maxLatitudeFor(10), 51.6 + (Math.acos(R_EARTH * Math.cos(10 * DEG) / (R_EARTH + ALT_KM)) / DEG - 10), 1e-9, "highest latitude for a 10 degree pass");
  ok(CREW_BLOCKS.length >= 5 && CREW_BLOCKS.every((b) => b.end > b.start), "crew blocks are well-formed");
  // search for at least one visible pass over a mid latitude in some day of ten
  let found = 0;
  for (let day = 0; day < 10; day++) {
    const passes = scanDay(40, -75, makeScenario(day), { stepS: 20 });
    if (passes.some((p) => p.visible)) found++;
  }
  ok(found > 0 && found < 10, `visible passes exist on ${found} of 10 days at 40N 75W (some days, not all)`);
  const none = scanDay(80, 0, sc, { stepS: 30 });
  ok(whyNone(none, 80) === "never-up", "latitude 80: the station never rises, so the reason is never-up");
}

console.log(failures === 0 ? "\nAll ISS day checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
