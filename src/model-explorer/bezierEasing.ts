// Parametric cubic-bezier(x) -> y evaluator, solved via Newton-Raphson —
// the standard technique (as used by e.g. the gre/bezier-easing package)
// for inverting a bezier curve that isn't a plain function of x. Exists so
// the camera fly-to tween can match the site's one motion curve exactly,
// --ease-standard: cubic-bezier(0.4, 0, 0.2, 1), rather than approximating
// it with a built-in easeInOut. Pure math, no DOM/WebGL dependency —
// independently testable: bezierEasing(...)(0) === 0, (1) === 1, and the
// curve is monotonic in x for these particular control points.
export function bezierEasing(mX1: number, mY1: number, mX2: number, mY2: number) {
  const A = (a1: number, a2: number) => 1.0 - 3.0 * a2 + 3.0 * a1;
  const B = (a1: number, a2: number) => 3.0 * a2 - 6.0 * a1;
  const C = (a1: number) => 3.0 * a1;

  const calcBezier = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const getSlope = (t: number, a1: number, a2: number) => 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1);

  function getTForX(x: number): number {
    let guessT = x;
    for (let i = 0; i < 4; i++) {
      const slope = getSlope(guessT, mX1, mX2);
      if (slope === 0) return guessT;
      const currentX = calcBezier(guessT, mX1, mX2) - x;
      guessT -= currentX / slope;
    }
    return guessT;
  }

  return function ease(x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return calcBezier(getTForX(x), mY1, mY2);
  };
}

export const easeStandard = bezierEasing(0.4, 0, 0.2, 1);
