import assert from 'node:assert/strict';
import { evaluateRunway as run, DEFAULT as d, MODEL as m } from '../public/assets/js/systems/runway.js';
const base=run(d);
assert.ok(Number.isFinite(base.duration));
assert.ok(run({...d,runway:1500}).outcome==='airborne');
assert.equal(run({...d,runway:150}).outcome,'exhausted');
assert.equal(run({...d,throttle:0}).outcome,'unable');
assert.equal(run({...d,throttle:0}).distance,0);
assert.ok(run({...d,mass:1400}).required>base.required);
assert.ok(run({...d,temperature:45}).required>base.required);
assert.ok(run({...d,altitude:2500}).required>base.required);
assert.equal(run({...d,runway:1500}).required,base.required);
assert.throws(()=>run({...d,mass:NaN}),RangeError);
assert.throws(()=>run({...d,temperature:-300}),RangeError);
// Independent small-step time integration checks analytical distance and time.
const r=run({...d,runway:1500});let v=0,x=0,t=0;const dt=0.0002;
while(v<r.target && t<300){const q=.5*r.rho*v*v;const a=(r.thrust-q*m.area*m.cd-m.mu*(d.mass*9.80665-q*m.area*m.cl))/d.mass;x+=v*dt;v+=a*dt;t+=dt;}
assert.ok(Math.abs(x-r.required)<.02);assert.ok(Math.abs(t-r.duration)<.002);
assert.ok(Math.abs(r.final.speed-r.target)<1e-9);
assert.ok(Math.abs(run({...d,runway:r.required}).distance-r.required)<1e-9);
for(const mass of [700,1100,1500])for(const altitude of [0,1500,3000])for(const temperature of [-10,15,45])for(const throttle of [0,.1,.5,1]){
 const q=run({...d,mass,altitude,temperature,throttle});
 assert.ok(Number.isFinite(q.duration));assert.ok(q.distance<=d.runway);assert.ok(q.final.speed>=0);
}
console.log('Runway: source equation, independent integration, boundaries, density/mass trends and impossible cases pass. Default:',base.outcome,base.required);
