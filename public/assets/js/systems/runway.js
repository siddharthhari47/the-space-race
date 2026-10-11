import { atmosphere, G0, R_AIR } from './atmosphere.js';

// Fictional constants, not an aircraft data set. NPTEL Flight 61 PDF p2
// supplies m dv/dt = T - D - mu(W-L). See References #runway-challenge.
export const MODEL = Object.freeze({ id: 'fictional-runway-v1', area: 16, cl: 0.6, cd: 0.055, clMax: 1.6, mu: 0.025, thrust: 2400, speedFactor: 1.2 });
export const DEFAULT = Object.freeze({ mass: 1100, altitude: 1500, temperature: 35, runway: 450, throttle: 1 });
export const LIMITS = Object.freeze({ mass: [700,1500], altitude:[0,3000], temperature:[-10,45], runway:[150,1500], throttle:[0,1] });
export function evaluateRunway(input) {
  for (const [k,[lo,hi]] of Object.entries(LIMITS)) if (!Number.isFinite(input[k]) || input[k]<lo || input[k]>hi) throw new RangeError(`Invalid ${k}`);
  const p = atmosphere(input.altitude).p, rho = p/(R_AIR*(input.temperature+273.15));
  const weight = input.mass*G0, target = MODEL.speedFactor*Math.sqrt(2*weight/(rho*MODEL.area*MODEL.clMax));
  const thrust = MODEL.thrust*(rho/1.225)*input.throttle;
  const A = thrust-MODEL.mu*weight, B = 0.5*rho*MODEL.area*(MODEL.cd-MODEL.mu*MODEL.cl);
  const possible = A > B*target*target;
  const required = possible ? -input.mass/(2*B)*Math.log1p(-B*target*target/A) : null;
  const outcome = !possible ? 'unable' : required <= input.runway ? 'airborne' : 'exhausted';
  const distance = A<=0 ? 0 : Math.min(required ?? input.runway, input.runway);
  const timeAt = x => A<=0 ? 0 : input.mass/Math.sqrt(A*B)*Math.acosh(Math.exp(B*x/input.mass));
  const duration = timeAt(distance);
  const stateAt = time => {
    const t = Math.max(0,Math.min(duration,time));
    const z = A>0 ? Math.sqrt(A*B)/input.mass*t : 0;
    const speed = A>0 ? Math.sqrt(A/B)*Math.tanh(z) : 0;
    const x = A>0 ? input.mass/B*Math.log(Math.cosh(z)) : 0;
    const q = 0.5*rho*speed*speed;
    const lift = q*MODEL.area*MODEL.cl, drag=q*MODEL.area*MODEL.cd;
    const rolling=MODEL.mu*Math.max(0,weight-lift);
    return {time:t,x,speed,lift,drag,rolling,thrust,acceleration:(thrust-drag-rolling)/input.mass};
  };
  return {rho,p,target,thrust,possible,required,outcome,distance,duration,stateAt,final:stateAt(duration)};
}
