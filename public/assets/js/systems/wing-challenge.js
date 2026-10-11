// Measured section data only. No theoretical fallback or extrapolation.
export const DATASET_ID = 'ladson-tm4074-re6m-m015-80grit-v1';
export async function parseVerifiedDataset(raw) {
  const data = JSON.parse(raw);
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== '33de3049e66dcfa149afa66d9b0e5cc75f0013b53c9e9de9acd8c42e2c394784') throw new Error('Dataset integrity mismatch');
  return validateDataset(data);
}
export function validateDataset(d) {
  if (d?.id !== DATASET_ID || d.conditions?.reynolds !== 6000000 || d.conditions?.mach !== 0.15 || d.conditions?.transition !== '80 grit' || d.samples?.length !== 17) throw new Error('Unverified experimental dataset');
  d.samples.forEach((p, i) => {
    if (![p.alpha, p.cl, p.cd].every(Number.isFinite) || p.cd <= 0 || (i && p.alpha <= d.samples[i - 1].alpha)) throw new Error('Invalid experimental sample');
  });
  return d;
}
export function interpolate(samples, alpha) {
  if (!Number.isFinite(alpha) || alpha < samples[0].alpha || alpha > samples.at(-1).alpha) throw new RangeError('Outside the measured angle range');
  const hi = samples.findIndex(p => p.alpha >= alpha);
  if (samples[hi].alpha === alpha) return { ...samples[hi] };
  const a = samples[hi - 1], b = samples[hi], t = (alpha - a.alpha) / (b.alpha - a.alpha);
  return { alpha, cl: a.cl + t * (b.cl - a.cl), cd: a.cd + t * (b.cd - a.cd) };
}
export function objectives(samples) {
  const peakIndex = samples.reduce((best, p, i) => p.cl > samples[best].cl ? i : best, 0);
  const peak = samples[peakIndex];
  if (peakIndex < 1 || peakIndex === samples.length - 1 || peak.cl <= 0) throw new Error('Measured positive peak unavailable');
  const rising = samples.slice(0, peakIndex + 1);
  if (rising.some((p, i) => i && p.cl <= rising[i - 1].cl)) throw new Error('Ambiguous rising branch');
  const liftTarget = peak.cl * 0.7;
  const candidates = rising.filter(p => p.cl >= liftTarget);
  for (let i = 1; i < rising.length; i++) {
    const a = rising[i - 1], b = rising[i];
    if (a.cl < liftTarget && b.cl >= liftTarget) candidates.push(interpolate(samples, a.alpha + (liftTarget - a.cl) / (b.cl - a.cl) * (b.alpha - a.alpha)));
  }
  const minimum = candidates.reduce((a, b) => a.cd < b.cd ? a : b);
  return { peak, liftTarget, dragLimit: minimum.cd * 1.1, minimum };
}
export function evaluateMeasured(d, alpha) {
  const goal = objectives(d.samples), p = interpolate(d.samples, alpha);
  return { ...p, ld: p.cl / p.cd, stalled: alpha > goal.peak.alpha, alphaStallDeg: goal.peak.alpha, clMax: goal.peak.cl, mode: 'measured', datasetId: d.id };
}
export function verdict(result, goal, stage) {
  if (result.alpha > goal.peak.alpha) return 'beyond-peak';
  if (result.cl + 1e-10 < goal.liftTarget) return 'insufficient';
  if (stage === 2 && result.cd > goal.dragLimit + 1e-10) return 'excessive-drag';
  return 'reached';
}
export function createTrialStore(storage, validate) {
  const key = 'space-race-wing-trials-v1';
  let trials = { A: null, B: null }, persistent = true;
  try {
    const saved = JSON.parse(storage.getItem(key) || '{}');
    for (const slot of ['A', 'B']) if (validate(saved[slot])) trials[slot] = saved[slot];
  } catch { persistent = false; }
  return {
    get trials() { return trials; },
    get persistent() { return persistent; },
    save(slot, trial) {
      if (!['A', 'B'].includes(slot) || (trial !== null && !validate(trial))) throw new Error('Invalid trial');
      trials[slot] = trial;
      try { storage.setItem(key, JSON.stringify(trials)); } catch { persistent = false; }
    },
  };
}
