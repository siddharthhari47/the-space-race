export const R=6371, MU=398600.4418;
export const period=h=>2*Math.PI*Math.sqrt((R+h)**3/MU);
export const pathLoss=(mhz,km)=>32.4+20*Math.log10(mhz)+20*Math.log10(km);
export function linkBudget({power,gain,frequency,range,rate,loss}){
 const fspl=pathLoss(frequency,range),received=10*Math.log10(power)+30+2+gain-fspl-loss;
 // Illustrative receiver: -120 dBm at 9.6 kbit/s; constant required energy/bit.
 const required=-120+10*Math.log10(rate/9.6);
 return {fspl,received,required,margin:received-required};
}
export function plan({altitude,inclination,latitude,longitude,mask,rate,production}){
 const rad=Math.PI/180,i=inclination*rad,lat=latitude*rad,lon=longitude*rad,n=2*Math.PI/period(altitude),a=R+altitude;
 const windows=[];let current=null;const track=[];
 for(let t=0;t<86400;t+=20){
  const u=n*(t+10),rot=2*Math.PI*(t+10)/86164, x=a*Math.cos(u), y=a*Math.sin(u)*Math.cos(i),z=a*Math.sin(u)*Math.sin(i);
  const ex=x*Math.cos(rot)+y*Math.sin(rot),ey=-x*Math.sin(rot)+y*Math.cos(rot),sx=R*Math.cos(lat)*Math.cos(lon),sy=R*Math.cos(lat)*Math.sin(lon),sz=R*Math.sin(lat);
  const dx=ex-sx,dy=ey-sy,dz=z-sz,d=Math.hypot(dx,dy,dz),e=Math.asin((dx*sx+dy*sy+dz*sz)/(d*R))/rad;
  if(t<period(altitude)*2)track.push([Math.atan2(ey,ex)/rad,Math.asin(z/a)/rad]);
  if(e>=mask){if(!current){current={start:t,end:t,peak:e};windows.push(current);}current.end=t+20;current.peak=Math.max(current.peak,e);}else current=null;
 }
 const seconds=windows.reduce((s,w)=>s+w.end-w.start,0);
 return {windows,seconds,capacity:seconds*rate/8000,generated:production*24,track};
}
export function dockStep(s,dt){
 const next={...s,x:s.x+s.vx*dt,y:s.y+s.vy*dt};
 if(next.x<=0){next.result=Math.abs(next.y)<=.6&&Math.abs(next.vx)<=.25&&Math.abs(next.vy)<=.15?'Docked':'Contact failed';next.x=0;}
 if(next.x>32||Math.abs(next.y)>10)next.result='Outside approach corridor';
 return next;
}
