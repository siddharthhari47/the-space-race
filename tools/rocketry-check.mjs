// Does the launch simulation produce numbers a real rocket would recognise?
//
// The test case is a Falcon 9 Block 5 in expendable configuration, because
// its masses are public and its performance is well known. If the model is
// roughly right, this vehicle should:
//
//   * lift off at a thrust-to-weight of about 1.2-1.4
//   * hit max-Q somewhere around 11-14 km
//   * stage a bit over two minutes in
//   * total 10-11 km/s of ideal delta-v with a light payload
//   * reach orbit, and fail to at some payload in the high teens
//
// One number comes out low and is left that way rather than tuned: drag
// loss lands near 0.02 km/s where a real launch sees 0.1-0.15. The
// trajectory here is more lofted than a real one and the vehicle is
// through the thick air faster, so it genuinely loses less. Fudging the
// drag coefficient to hit the textbook figure would make one number look
// right by making the physics wrong.
//
// None of those are tuned for. They fall out of published engine figures
// and published stage masses, so if they land in the right place the
// physics is doing real work.
//
// Run: node tools/rocketry-check.mjs

import { simulate, deltaV, buildVehicle, STRUCTURE, circularVelocity } from "../public/assets/js/systems/rocketry.js";

const F9 = {
  engine1: "merlin1d",
  engines1: 9,
  prop1: 411000,
  engine2: "mvac",
  engines2: 1,
  prop2: 107500,
  payload: 12000,
  turnStart: 1200,
  turnEnd: 110000,
  targetAlt: 250000,
};

let failures = 0;
function check(label, value, lo, hi, unit = "") {
  const ok = value >= lo && value <= hi;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${label.padEnd(28)} ${value.toFixed(2).padStart(10)} ${unit.padEnd(6)} expected ${lo}-${hi}`
  );
}

console.log("=== Falcon 9 Block 5, expendable, 12 t payload ===\n");

const v = buildVehicle(F9);
console.log(`liftoff mass    ${(v.liftoffMass / 1000).toFixed(1)} t`);
console.log(`stage 1 dry     ${(v.dry1 / 1000).toFixed(1)} t  (published ~22 t)`);
console.log(`stage 2 dry     ${(v.dry2 / 1000).toFixed(1)} t  (published ~4 t)`);
console.log(`burn 1          ${v.burn1.toFixed(0)} s  (published ~162 s)`);
console.log(`burn 2          ${v.burn2.toFixed(0)} s  (published ~397 s)`);
console.log("");

const dv = deltaV(F9);
check("liftoff TWR", v.twr, 1.15, 1.5);
check("stage 1 burn time", v.burn1, 140, 185, "s");
check("stage 1 dry mass", v.dry1 / 1000, 20, 25, "t");
check("ideal dv stage 1", dv.dv1 / 1000, 3.0, 4.5, "km/s");
check("ideal dv stage 2", dv.dv2 / 1000, 6.0, 7.5, "km/s");
check("ideal dv total", dv.total / 1000, 10.0, 11.5, "km/s");

const sim = simulate(F9);
console.log("");
check("max-Q altitude", sim.maxQAlt / 1000, 9, 16, "km");
check("max-Q dynamic pressure", sim.maxQ / 1000, 25, 45, "kPa");
check("staging time", sim.sepTime ?? -1, 140, 190, "s");
check("periapsis altitude", sim.periapsis / 1000, 120, 400, "km");
check("apoapsis altitude", sim.apoapsis / 1000, 180, 3000, "km");
check("final speed", sim.finalSpeed / 1000, 7.4, 8.6, "km/s");

console.log("");
console.log(`reached orbit   ${sim.reachedOrbit}`);
check("gravity loss", sim.gravityLoss / 1000, 1.2, 2.1, "km/s");
console.log("");
console.log(`SECO at         ${sim.secoTime ? sim.secoTime.toFixed(0) + " s" : "propellant depletion"}`);
console.log(`propellant left ${(sim.propRemaining / 1000).toFixed(1)} t`);
console.log(`drag loss       ${(sim.dragLoss / 1000).toFixed(3)} km/s  (real launches: ~0.1-0.15)`);
console.log(`circular v at periapsis  ${(circularVelocity(sim.periapsis) / 1000).toFixed(3)} km/s`);
console.log(`trajectory points        ${sim.path.length}`);

if (!sim.reachedOrbit) {
  console.log("FAIL  vehicle did not reach orbit");
  failures++;
}

// Staging has to be worth something. Same propellant, same engines, flown
// as a single stage that never drops its tank: delta-v must come out lower.
console.log("\n=== Does staging actually help? ===");
const singleStage = {
  ...F9,
  prop1: F9.prop1 + F9.prop2,
  prop2: 1, // effectively none
};
const dvSingle = deltaV(singleStage);
const gain = dv.total - dvSingle.dv1;
console.log(`two stages      ${(dv.total / 1000).toFixed(3)} km/s`);
console.log(`one stage       ${(dvSingle.dv1 / 1000).toFixed(3)} km/s`);
console.log(`staging buys    ${(gain / 1000).toFixed(3)} km/s`);
if (gain <= 0) {
  console.log("FAIL  staging did not improve delta-v — the mass ratio is not being applied per stage");
  failures++;
} else {
  console.log("ok    staging improves delta-v, as it must");
}

// There has to be a payload the vehicle cannot lift, and it should be in
// the right neighbourhood. Real Falcon 9 expendable does about 22.8 t to
// LEO; this model has no Earth-rotation bonus (worth ~0.4 km/s from the
// Cape) so it should come in somewhat under that, and definitely not over.
console.log("");
console.log("=== Payload ceiling ===");
let ceiling = 0;
for (let pl = 4000; pl <= 30000; pl += 500) {
  if (simulate({ ...F9, payload: pl }).reachedOrbit) ceiling = pl;
}
console.log(`heaviest payload to orbit  ${(ceiling / 1000).toFixed(1)} t  (real expendable F9: 22.8 t)`);
check("payload ceiling", ceiling / 1000, 12, 22.8, "t");

// Structural coefficients should be the published-ish ratios.
console.log("");
console.log(`structure coefficients  s1 ${STRUCTURE.stage1}  s2 ${STRUCTURE.stage2}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks failed.`);
process.exit(failures === 0 ? 0 : 1);
