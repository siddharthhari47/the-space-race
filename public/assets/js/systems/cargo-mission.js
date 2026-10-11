import {AIRCRAFT, initialLoading, evaluateLoading} from './loading.js';
import {MODEL, evaluateRunway} from './runway.js';

// One explicit fictional mission definition reuses the two validated models.
// It does not imply that CG is an input to the ground-run force equation.
export const MISSION=Object.freeze({id:'cargo-mission-v1',aircraft:AIRCRAFT,groundModel:MODEL,
  passengerMass:80,fuelMass:80,payloadTarget:180,
  airport:Object.freeze({altitude:1500,temperature:35,runway:450,throttle:1})});
export function initialManifest(){const loads=initialLoading();loads.baggage.mass=160;return loads;}
export function evaluateMission(loads){
 const loading=evaluateLoading(loads);
 if(loads.passenger.mass!==MISSION.passengerMass||loads.fuel.mass!==MISSION.fuelMass)throw new RangeError('Mission passenger and fuel masses are fixed');
 const runwayInput={...MISSION.airport,mass:loading.mass};
 const runway=evaluateRunway(runwayInput);
 const failures=[...loading.faults];
 if(runway.outcome!=='airborne')failures.push('runway');
 return {missionId:MISSION.id,loading,runwayInput,runway,failures,passed:failures.length===0};
}
export function manifestIdentity(loads){evaluateMission(loads);return JSON.stringify([MISSION.id,...['passenger','baggage','fuel'].flatMap(k=>[loads[k].mass,loads[k].station])]);}
export function saveAttempt(loads){return {missionId:MISSION.id,manifest:structuredClone(loads),identity:manifestIdentity(loads)};}
export function isCurrentAttempt(attempt,loads){
 try{return attempt?.missionId===MISSION.id&&attempt.identity===manifestIdentity(attempt.manifest)&&attempt.identity===manifestIdentity(loads);}catch{return false;}
}
