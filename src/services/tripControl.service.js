import Operational from '../models/OperationalNotification.js';
import {recordMileage} from './maintenanceAlert.service.js';
import crypto from 'node:crypto';
import {Op} from 'sequelize';
import Trip from '../models/Trip.js';import Stop from '../models/TripStop.js';import Charge from '../models/StandbyCharge.js';import Line from '../models/CollectionLine.js';import Revision from '../models/TripControlRevision.js';import Attachment from '../models/Attachment.js';import Audit from '../models/Audit.js';
import {fail} from './catalog.service.js';import {tripProgress,stopClock,finishTrip,clearStopNotices} from './tripStop.service.js';import {accrueTrip} from './standby.service.js';
export const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function controlState(t,transaction){const stops=await Stop.findAll({where:{trip_id:t.id},order:[['position','ASC']],transaction}),charges=await Charge.findAll({where:{trip_id:t.id},order:[['id','ASC']],transaction});return {trip:{id:t.id,status:t.status,started_at:t.started_at,closed_at:t.closed_at,base_amount:t.base_amount,standby_amount:t.standby_amount,control_revision:t.control_revision},stops:stops.map(s=>s.toJSON()),charges:charges.map(c=>c.toJSON())};}
export const controlFingerprint=state=>hash(state);
export function controlValues(body){
 const v=body?.values;if(!v||typeof v!=='object'||Array.isArray(v))fail('Datos de control inválidos');
 const request_id=String(v.request_id||''),reason=String(v.reason||'').trim(),revision=Number(v.revision);if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(request_id))fail('Identificador de operación inválido');if(reason.length<5||reason.length>1000)fail('Indica un motivo entre 5 y 1000 caracteres');if(!Number.isInteger(revision)||revision<0)fail('Revisión inválida');
 const result={action:v.action,revision,request_id,reason};
 if(v.action==='correct'){
  const position=Number(v.position);if(v.position==null||!Number.isInteger(position)||position<0||position>15)fail('Selecciona un punto');result.position=position;result.patch={};
  const patch=v.patch||{};for(const k of Object.keys(patch)){if(!['arrived_at','departed_at','received_at','arrival_odometer','arrival_file_id','document_waived'].includes(k))fail('Campo de corrección no permitido');const val=patch[k];
   if(k.endsWith('_at')){if(val===null){result.patch[k]=null;continue;}const d=new Date(val);if(!val||!Number.isFinite(+d))fail('Fecha inválida');result.patch[k]=d.toISOString();}
   else if(k==='arrival_odometer'){if(val===null){result.patch[k]=null;continue;}const n=Number(val);if(val===''||!Number.isFinite(n)||n<0||n>99999999999||Math.abs(n*10-Math.round(n*10))>0.0001)fail('Kilometraje inválido; máximo un decimal');result.patch[k]=n;}
   else if(k==='arrival_file_id'){if(!/^[1-9]\d*$/.test(String(val)))fail('Selecciona un documento del viaje');result.patch[k]=String(val);}
   else{if(typeof val!=='boolean')fail('Exención de documento inválida');result.patch[k]=val;}
  }if(!Object.keys(result.patch).length)fail('No hay cambios para autorizar');
 }else if(v.action==='standby'){
  if(!/^[1-9]\d*$/.test(String(v.charge_id))||!['approved','void'].includes(v.decision))fail('Selecciona el cargo y aprobar o anular');result.charge_id=String(v.charge_id);result.decision=v.decision;
 }else if(v.action==='settle'){
  const n=Number(v.base_amount);if(v.base_amount===''||v.base_amount==null||!Number.isFinite(n)||n<0||n>9999999999||Math.abs(n*100-Math.round(n*100))>0.0001)fail('Indica el flete autorizado, máximo dos decimales');result.base_amount=n;
 }else fail('Operación no permitida');return result;
}
export function validateTimeline(stops,now){let lastDeparture=null,lastKm=null;
 for(const s of stops){const a=s.arrived_at?+new Date(s.arrived_at):null,d=s.departed_at?+new Date(s.departed_at):null,r=s.received_at?+new Date(s.received_at):null;
  if([a,d,r].some(x=>x!=null&&x>+now+30000))fail('No se permiten horarios futuros');
  if((d!=null||r!=null)&&a==null)fail('Registra primero la llegada al punto');if(a!=null&&d!=null&&d<a)fail('La salida no puede ser anterior a la llegada');if(r!=null&&(r<a||d!=null&&r>d))fail('La recepción debe estar entre llegada y salida');if(a!=null&&lastDeparture!=null&&a<lastDeparture)fail('La llegada debe ser posterior a la salida del punto anterior');if(d!=null)lastDeparture=d;
  if(s.arrival_odometer!=null){const km=Number(s.arrival_odometer);if(lastKm!=null&&km<lastKm)fail('Los kilometrajes deben mantener el orden de los puntos');lastKm=km;}
 }
}
export async function ensurePlannedStops(t,transaction){if(!t.metadata?.origin_place||!t.metadata?.destination_places?.length)fail('Este viaje no tiene ruta georreferenciada de esta versión');for(const [position,place] of [t.metadata.origin_place,...t.metadata.destination_places].entries())await Stop.findOrCreate({where:{trip_id:t.id,position},defaults:{place},transaction});return Stop.findAll({where:{trip_id:t.id},order:[['position','ASC']],transaction});}
export async function saveRevision(t,user,v,before,transaction,requestHash=hash(v)){
 await t.update({control_revision:t.control_revision+1},{transaction});const after=await controlState(t,transaction);
 const row=await Revision.create({trip_id:t.id,user_id:user.id,revision:t.control_revision,action:v.action,reason:v.reason,before,after,request_id:v.request_id,request_hash:requestHash},{transaction});
 await Audit.create({user_id:user.id,action:'viaje.control_'+v.action,details:{trip_id:t.id,revision:t.control_revision,reason:v.reason,two_factor:v.action!=='outcome'}},{transaction});return row;
}
export async function applyControl(t,user,v,transaction){
 const before=await controlState(t,transaction),now=stopClock(t);
 if(v.action==='correct'){
  if(await Line.count({where:{trip_id:t.id,active:true},transaction}))fail('El viaje está incluido en un corte activo. Primero retira ese corte con su confirmación para corregir y volver a generar el reporte.',409);
  const stops=await ensurePlannedStops(t,transaction),s=stops.find(s=>s.position===v.position);if(!s)fail('Punto no encontrado');
  if(v.patch.document_waived&&s.position===0)fail('El embarque requiere guía; no permite exención');if(v.patch.document_waived&&!['partial','rejected','failed'].includes(s.outcome))fail('Solo se puede eximir documento con una incidencia de entrega registrada');
  if(v.patch.arrival_file_id){const f=await Attachment.findOne({where:{id:v.patch.arrival_file_id,trip_id:t.id,deleted_at:null,category:{[Op.in]:['guia','entrega']}},transaction});if(!f)fail('Documento no disponible en este viaje');}
  const merged=stops.map(x=>String(x.id)===String(s.id)?{...x.toJSON(),...v.patch}:x.toJSON());validateTimeline(merged,now);
  if(t.status==='finalizado'&&merged.some(x=>!x.departed_at||!((x.arrival_file_id||x.document_waived)&&x.arrival_odometer!=null)||!x.exception_resolved))fail('Esta corrección reabriría un viaje cerrado. Conserva sus datos completos; no se permite reabrirlo desde esta operación.');
  await s.update({...v.patch,...(v.patch.arrival_file_id?{arrival_file_ids:[String(v.patch.arrival_file_id),...(s.arrival_file_ids||[]).slice(1).filter(id=>String(id)!==String(v.patch.arrival_file_id))]}:{}),...('departed_at' in v.patch?{outside_at:v.patch.departed_at,exit_state:v.patch.departed_at?(['partial','rejected','failed'].includes(s.outcome)?'incident':'delivered'):null}:{}),candidate_at:null,candidate_count:0,candidate_type:null},{transaction});
  for(const stop of stops)if(stop.arrival_file_id&&stop.arrival_odometer!=null)await clearStopNotices(t,stop,transaction);
  const first=stops[0];if(first?.arrived_at&&(!t.started_at||new Date(t.started_at)>new Date(first.arrived_at)))await t.update({started_at:first.arrived_at,status:t.status==='creado'?'en_curso':t.status},{transaction});
  // A corrected date invalidates approval of unbilled charges; each retained day is reviewed again.
  await Charge.update({review_status:'pending',reviewed_at:null,reviewed_by:null,review_reason:null},{where:{trip_id:t.id},transaction});
  if(!t.is_test&&v.patch.arrival_odometer!=null)await recordMileage(t.vehicle_id,v.patch.arrival_odometer,null,transaction);await accrueTrip(t,transaction,now);await finishTrip(t,stops,transaction);if(t.status==='finalizado')await t.update({closed_at:stops.at(-1).departed_at},{transaction});
 }else if(v.action==='standby'){
  const c=await Charge.findOne({where:{id:v.charge_id,trip_id:t.id},transaction,lock:transaction.LOCK.UPDATE});if(!c||!c.calculation_valid)fail('El cargo ya no es válido para los horarios actuales');
  if(await Line.count({where:{charge_id:c.id,active:true},transaction}))fail('Este cargo ya pertenece a un corte activo. Retira el corte antes de modificarlo.',409);
  await c.update({review_status:v.decision,review_reason:v.reason,reviewed_by:user.id,reviewed_at:new Date()},{transaction});await accrueTrip(t,transaction,now);
 }else if(v.action==='settle'){
  if(await Line.count({where:{trip_id:t.id,active:true},transaction}))fail('El viaje ya está en un corte activo. Retira el corte antes de resolver sus importes.',409);
  const stops=await Stop.findAll({where:{trip_id:t.id},order:[['position','ASC']],transaction});if(!stops.some(s=>!s.exception_resolved))fail('No hay incidencias pendientes para resolver');
  for(const s of stops)if(!s.exception_resolved){await s.update({exception_resolved:true},{transaction});await Operational.update({read_at:new Date()},{where:{stop_id:s.id,phase:{[Op.like]:'incident%'}},transaction});}await t.update({base_amount:v.base_amount},{transaction});await accrueTrip(t,transaction,now);await finishTrip(t,stops,transaction);
 }
 await saveRevision(t,user,v,before,transaction);return {ok:true,revision:t.control_revision,progress:tripProgress(t,await Stop.findAll({where:{trip_id:t.id},transaction}))};
}
