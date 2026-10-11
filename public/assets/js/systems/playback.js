// A clock independent of the simulation: pause never advances model time.
export class Playback {
  constructor({duration, paint, done=()=>{}, changed=()=>{}, rate=5, request=cb=>requestAnimationFrame(cb), cancel=id=>cancelAnimationFrame(id)}) {
    Object.assign(this,{duration,paint,done,changed,rate,request,cancel});
    this.time=0; this.status='ready'; this.frame=null; this.previous=null;
  }
  start() {
    if(this.status==='playing')return;
    if(this.time>=this.duration)this.time=0;
    this.status='playing'; this.previous=null; this.changed();
    if(this.duration===0)return this.finish();
    this.paint(this.time); this.frame=this.request(now=>this.tick(now));
  }
  tick(now) {
    this.frame=null;
    if(this.status!=='playing')return;
    if(this.previous!==null)this.time=Math.min(this.duration,this.time+(now-this.previous)/1000*this.rate);
    this.previous=now; this.paint(this.time);
    if(this.time>=this.duration)this.finish();
    else this.frame=this.request(t=>this.tick(t));
  }
  pause() {
    if(this.frame!==null)this.cancel(this.frame);
    this.frame=null; this.previous=null;
    if(this.status==='playing')this.status='paused';
    this.changed();
  }
  seek(time) {
    this.pause(); this.time=Math.max(0,Math.min(this.duration,time));
    this.status='paused'; this.paint(this.time); this.changed();
    if(this.time===this.duration)this.finish();
  }
  finish() {
    this.pause(); this.time=this.duration; this.status='complete';
    this.paint(this.time); this.done(); this.changed();
  }
  dispose(){this.pause();this.status='disposed';}
}
