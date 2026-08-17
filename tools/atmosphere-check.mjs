// Assert the ISA implementation against the published standard table.
//
// The reference values are the ICAO/ISO 2533 standard atmosphere at the
// altitudes where the model changes behaviour plus a few in between, which
// is where a piecewise implementation goes wrong if it is going to.
//
// Run: node tools/atmosphere-check.mjs

import { atmosphere } from "../public/assets/js/systems/atmosphere.js";

// altitude m, T K, p Pa, rho kg/m^3, a m/s
const TABLE = [
  [0, 288.15, 101325, 1.2250, 340.29],
  [1000, 281.65, 89874.6, 1.11164, 336.43],
  [5000, 255.65, 54019.9, 0.73612, 320.53],
  [11000, 216.65, 22632.1, 0.363918, 295.07],
  [15000, 216.65, 12044.6, 0.193674, 295.07],
  [20000, 216.65, 5474.89, 0.0880349, 295.07],
  [25000, 221.65, 2511.02, 0.0394658, 298.455],
  [32000, 228.65, 868.019, 0.0132250, 303.131],
];

const TOL = 0.001; // 0.1%
let failures = 0;

console.log("alt(m)     quantity   computed      standard      rel.err");
for (const [h, T, p, rho, a] of TABLE) {
  const got = atmosphere(h);
  const checks = [
    ["T", got.T, T],
    ["p", got.p, p],
    ["rho", got.rho, rho],
    ["a", got.a, a],
  ];
  for (const [name, computed, standard] of checks) {
    const err = Math.abs(computed - standard) / standard;
    const ok = err <= TOL;
    if (!ok) failures++;
    console.log(
      `${String(h).padStart(6)}     ${name.padEnd(9)} ${computed.toFixed(5).padStart(12)} ${standard
        .toFixed(5)
        .padStart(13)}   ${(err * 100).toFixed(4)}%  ${ok ? "" : "  <-- FAIL"}`
    );
  }
}

console.log(
  failures === 0
    ? "\nISA matches the standard table within 0.1% at every checked altitude."
    : `\n${failures} values outside tolerance.`
);
process.exit(failures === 0 ? 0 : 1);
