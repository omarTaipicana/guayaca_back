export const MAX_ROUTE_ACCURACY=100;
export const radiusOf=s=>Number(s.place.radius_m||150);
const stopAccuracy=s=>Math.max(25,Math.min(MAX_ROUTE_ACCURACY,radiusOf(s)/2));
export function distance(a,b){
 const rad=x=>x*Math.PI/180,dy=rad(Number(b.latitude)-Number(a.latitude)),dx=rad(Number(b.longitude)-Number(a.longitude)),h=Math.sin(dy/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dx/2)**2;
 return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function gpsCandidate(stops,fix){
 const pending=stops.filter(s=>!s.departed_at),origin=pending.find(s=>Number(s.position)===0);
 const active=origin||pending.find(s=>s.arrived_at&&!s.outside_at);
 const accuracy=Number(fix.accuracy);
 if(active){
  const d=distance(fix,active.place),radius=radiusOf(active);
  if(accuracy>stopAccuracy(active))return null;
  if(!active.arrived_at&&d<=radius)return {stop:active,kind:'arrival',d};
  if(active.arrived_at&&d>=radius+Math.max(50,accuracy))return {stop:active,kind:'departure',d};
  return null;
 }
 let best=null;
 for(const stop of pending){
  if(accuracy>stopAccuracy(stop))continue;
  const d=distance(fix,stop.place);
  if(d<=radiusOf(stop)&&(!best||d<best.d||d===best.d&&stop.position<best.stop.position))best={stop,kind:stop.arrived_at?'return':'arrival',d};
 }
 return best;
}
