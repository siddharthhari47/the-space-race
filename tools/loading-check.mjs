import assert from 'node:assert/strict';
import {AIRCRAFT,initialLoading,evaluateLoading,moveLoad,initialPitchMoment,suggestedMove} from '../public/assets/js/systems/loading.js';
const start=initialLoading(),a=evaluateLoading(start);
assert.equal(a.mass,1040);assert.equal(a.moment,2844);assert.equal(a.cg,2844/1040);assert.deepEqual(a.faults,['aft']);
const middle=moveLoad(start,'baggage',1),b=evaluateLoading(middle);
assert.equal(b.mass,a.mass);assert.equal(b.moment,2624);assert.equal(b.cg,2624/1040);assert.equal(b.passed,true);
assert.ok(Math.abs((b.cg-a.cg)-100*(3.2-5.4)/1040)<1e-12,'Shift matches independent load-shift calculation');
assert.equal(start.baggage.station,2,'Moves must not mutate the initial state');
assert.ok(evaluateLoading(moveLoad(start,'baggage',0)).faults.includes('forward'));
let passed=0,failed=0;
for(let p=0;p<3;p++)for(let bag=0;bag<3;bag++)for(let f=0;f<3;f++){
  const loads=initialLoading();loads.passenger.station=p;loads.baggage.station=bag;loads.fuel.station=f;
  const r=evaluateLoading(loads);assert.equal(r.mass,1040);assert.equal(r.payload,180);r.passed?passed++:failed++;
}
assert.ok(passed>0&&failed>0);
const heavy=initialLoading();heavy.baggage.mass=200;assert.ok(evaluateLoading(heavy).faults.includes('overweight'));
const light=initialLoading();light.baggage.mass=0;assert.ok(evaluateLoading(light).faults.includes('payload'));
for(const value of [-1,NaN,201,Infinity]){const bad=initialLoading();bad.baggage.mass=value;assert.throws(()=>evaluateLoading(bad));}
assert.throws(()=>moveLoad(start,'fuel',3));assert.throws(()=>moveLoad(start,'fuel',.5));
assert.equal(initialPitchMoment(AIRCRAFT.neutralPoint),0);assert.ok(initialPitchMoment(2.5)<0);assert.ok(initialPitchMoment(3.1)>0);assert.equal(Math.abs(initialPitchMoment(2.5,0)),0);
assert.ok(Math.abs(initialPitchMoment(2.5)+.05890486225480862)<1e-12);
const hint=suggestedMove(start);assert.equal(hint.passed,true);assert.equal(hint.mass,a.mass);assert.ok(Math.abs(hint.cg-2.475)<Math.abs(a.cg-2.475));
console.log(`PASS: independent mass/moment/CG calculation, shift identity, all 27 arrangements (${passed} pass, ${failed} fail), overload/payload limits, invalid inputs, static-moment signs and useful hint.`);
