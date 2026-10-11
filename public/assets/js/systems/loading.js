// All aircraft values below are original teaching/game assumptions, not aircraft data.
export const AIRCRAFT = Object.freeze({ emptyMass:700, emptyArm:2.4, pilotMass:80, pilotArm:1.8, forward:2.35, aft:2.6, maxMass:1100, payloadTarget:180, neutralPoint:2.8, chord:2, liftSlope:4.5 });
export const LOADS = Object.freeze({
  passenger:{label:'Passenger',mass:80,max:150,stations:[1.8,3.2,4.6],names:['Front seat','Middle seat','Rear seat']},
  baggage:{label:'Baggage',mass:100,max:200,stations:[1,3.2,5.4],names:['Forward hold','Centre hold','Rear hold']},
  fuel:{label:'Fuel',mass:80,max:180,stations:[1.4,2.6,4.4],names:['Forward tank','Centre tank','Rear tank']},
});
export function initialLoading() { return {passenger:{mass:80,station:2},baggage:{mass:100,station:2},fuel:{mass:80,station:0}}; }
export function evaluateLoading(loads) {
  let mass=AIRCRAFT.emptyMass+AIRCRAFT.pilotMass;
  let moment=AIRCRAFT.emptyMass*AIRCRAFT.emptyArm+AIRCRAFT.pilotMass*AIRCRAFT.pilotArm;
  const rows=[];
  for(const [id,def] of Object.entries(LOADS)) {
    const p=loads[id];
    if(!p || !Number.isFinite(p.mass) || p.mass<0 || p.mass>def.max || !Number.isInteger(p.station) || p.station<0 || p.station>=def.stations.length) throw new RangeError('Invalid load');
    const arm=def.stations[p.station]; mass+=p.mass;moment+=p.mass*arm;
    rows.push({id,label:def.label,mass:p.mass,arm,moment:p.mass*arm});
  }
  const cg=moment/mass,payload=loads.passenger.mass+loads.baggage.mass;
  const faults=[];
  if(mass>AIRCRAFT.maxMass)faults.push('overweight');
  if(cg<AIRCRAFT.forward)faults.push('forward');
  if(cg>AIRCRAFT.aft)faults.push('aft');
  if(payload<AIRCRAFT.payloadTarget)faults.push('payload');
  return {mass,moment,cg,payload,rows,faults,passed:!faults.length,staticMargin:(AIRCRAFT.neutralPoint-cg)/AIRCRAFT.chord};
}
export function moveLoad(loads,id,station) {
  const next=structuredClone(loads);next[id].station=station;evaluateLoading(next);return next;
}
export function initialPitchMoment(cg,alphaDegrees=5) {
  if(!Number.isFinite(cg)||!Number.isFinite(alphaDegrees))throw new RangeError('Finite pitch inputs required');
  // Linear static increment about an assumed trimmed reference: C_m_alpha = -a * SM.
  return AIRCRAFT.liftSlope*(cg-AIRCRAFT.neutralPoint)/AIRCRAFT.chord*alphaDegrees*Math.PI/180;
}
export function suggestedMove(loads) {
  const before=evaluateLoading(loads), centre=(AIRCRAFT.forward+AIRCRAFT.aft)/2;
  const candidates=[];
  for(const [id,def] of Object.entries(LOADS))for(let station=0;station<def.stations.length;station++) {
    if(station===loads[id].station || loads[id].mass===0)continue;
    const next=evaluateLoading(moveLoad(loads,id,station));
    if(Math.abs(next.cg-centre)<Math.abs(before.cg-centre)) candidates.push({id,station,...next,shift:next.cg-before.cg});
  }
  return candidates.sort((a,b)=>Math.abs(a.cg-centre)-Math.abs(b.cg-centre))[0]||null;
}
