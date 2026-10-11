import assert from 'node:assert/strict';
import {initialManifest,evaluateMission,saveAttempt,isCurrentAttempt} from '../public/assets/js/systems/cargo-mission.js';
const start=initialManifest();const a=evaluateMission(start);
assert.equal(a.loading.mass,1100);assert.equal(a.runwayInput.mass,a.loading.mass);
assert.ok(a.failures.includes('aft'));assert.ok(a.failures.includes('runway'));
const balanced=structuredClone(start);balanced.baggage.station=1;
const b=evaluateMission(balanced);assert.equal(b.loading.passed,true);assert.deepEqual(b.failures,['runway']);
const solution=structuredClone(balanced);solution.baggage.mass=100;
const c=evaluateMission(solution);assert.equal(c.loading.mass,1040);assert.equal(c.passed,true);
const insufficient=structuredClone(solution);insufficient.baggage.mass=90;assert.ok(evaluateMission(insufficient).failures.includes('payload'));
const saved=saveAttempt(solution);assert.equal(isCurrentAttempt(saved,solution),true);
solution.baggage.station=2;assert.equal(isCurrentAttempt(saved,solution),false);
assert.equal(isCurrentAttempt({...saved,missionId:'obsolete'},saved.manifest),false);
assert.equal(isCurrentAttempt({...saved,manifest:{}},solution),false);
const invalid=initialManifest();invalid.fuel.mass=0;assert.throws(()=>evaluateMission(invalid),RangeError);
let pass=0,fail=0;
for(const mass of [80,100,120,160,200])for(let p=0;p<3;p++)for(let b=0;b<3;b++)for(let f=0;f<3;f++){
 const m=initialManifest();m.baggage.mass=mass;m.passenger.station=p;m.baggage.station=b;m.fuel.station=f;
 const r=evaluateMission(m);assert.equal(r.runwayInput.mass,r.loading.mass);r.passed?pass++:fail++;
}
assert.ok(pass>0&&fail>0);console.log(`PASS: manifest mass continuity, balance-only failure, runway failure, successful mission, payload constraint, stale saves; ${pass} pass / ${fail} fail arrangements.`);
