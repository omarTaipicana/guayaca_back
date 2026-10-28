import {fail} from './catalog.service.js';
const cache=new Map();let nextDemoRequest=0;
export async function roadRoute(places){const coords=places.map(p=>[Number(p.longitude),Number(p.latitude)]);if(coords.some(p=>!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))fail('Coordenadas inválidas');const key=JSON.stringify(coords),cached=cache.get(key);if(cached&&Date.now()-cached.at<300000)return cached.route;
 if(process.env.NODE_ENV==='production'&&!process.env.ROUTING_URL)fail('Configura ROUTING_URL con un servicio de rutas para producción.',503);
 const base=(process.env.ROUTING_URL||'https://router.project-osrm.org').replace(/\/$/,'');let url;try{url=new URL(base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();}catch{fail('ROUTING_URL no es válida',503)}
 url.pathname=url.pathname.replace(/\/$/,'')+'/route/v1/driving/'+coords.map(p=>p.join(',')).join(';');url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false',alternatives:'false'}).toString();
 if(!process.env.ROUTING_URL){const start=Math.max(Date.now(),nextDemoRequest);nextDemoRequest=start+1000;const delay=start-Date.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));}
 let data;try{const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'GUAYACA-Transport/0.3.0'}});if(!response.ok)throw Error();data=await response.json()}catch{fail('No se pudo calcular la ruta por carretera. Inténtalo de nuevo; el viaje no se guardó.',503)}
 const r=data.routes?.[0];if(data.code!=='Ok'||!r||!Number.isFinite(r.distance)||r.distance<0||!Number.isFinite(r.duration)||r.geometry?.type!=='LineString'||!Array.isArray(r.geometry.coordinates)||r.geometry.coordinates.length<2)fail('No se encontró una ruta válida entre los lugares seleccionados',422);
 if(data.waypoints?.some(p=>Number(p.distance)>2000))fail('Una ubicación está a más de 2 km de una vía enrutable. Revisa el punto exacto del lugar.',422);
 const route={legs:(r.legs||[]).map(l=>({distance_m:l.distance,duration_s:l.duration})),distance_m:r.distance,duration_s:r.duration,geometry:r.geometry,profile:'driving',provider:'OSRM',calculated_at:new Date().toISOString()};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),route});return route;
}
