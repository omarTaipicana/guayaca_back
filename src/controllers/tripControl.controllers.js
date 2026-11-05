import {visibleTrip,isAdmin} from '../services/tripVisibility.service.js';
import {operationTransaction} from '../services/operationTransaction.service.js';
import User from '../models/User.js';import Operational from '../models/OperationalNotification.js';
import {Op} from 'sequelize';import db from '../utils/connection.js';import Trip from '../models/Trip.js';import Stop from '../models/TripStop.js';import Charge from '../models/StandbyCharge.js';import Line from '../models/CollectionLine.js';import Revision from '../models/TripControlRevision.js';import Attachment from '../models/Attachment.js';
import {wrap,fail,validateId} from '../services/catalog.service.js';import {tripAccess} from '../services/shared.service.js';import {sendConfirmation,verifyConfirmation,consumeConfirmation} from '../services/confirmation.service.js';
import {controlState,controlValues,controlFingerprint,applyControl,saveRevision,hash} from '../services/tripControl.service.js';import {stopClock,tripProgress} from '../services/tripStop.service.js';import {accrueTrip} from '../services/standby.service.js';import {dispatchAlerts} from '../services/maintenanceAlert.service.js';
const confirmationType=(id,v,fingerprint)=>'trip_control:'+id+':'+hash({values:v,fingerprint});
export const getControl=wrap(async(req,res)=>{
 const t=await tripAccess(req,req.params.id);
 if(!isAdmin(req.user)){
  const stops=await Stop.findAll({where:{trip_id:t.id},order:[['position','ASC']]});
  const files=await Attachment.findAll({where:{trip_id:t.id,deleted_at:null,category:{[Op.in]:['guia','entrega']}},attributes:['id','original_name','category'],order:[['id','DESC']]});
  const {metadata,...trip}=visibleTrip(t,req.user);
  return res.json({trip,stops,files,progress:tripProgress(t,stops)});
 }
 const state=await controlState(t);const billed=await Line.findAll({where:{trip_id:t.id,active:true}});
 const revisions=await Revision.findAll({where:{trip_id:t.id},order:[['revision','DESC']],limit:100});
 const files=await Attachment.findAll({where:{trip_id:t.id,deleted_at:null,category:{[Op.in]:['guia','entrega']}},attributes:['id','original_name','category'],order:[['id','DESC']]});
 res.json({...state,progress:tripProgress(t,state.stops),billed:billed.length>0,charges:state.charges.map(c=>({...c,billed:billed.some(l=>String(l.charge_id)===String(c.id))})),revisions,files,fingerprint:controlFingerprint(state)});
});
export const correctionCode=wrap(async(req,res)=>{validateId(req.params.id);const t=await tripAccess(req,req.params.id);if(t.status==='cancelado')fail('Viaje cancelado');const v=controlValues(req.body);if(v.revision!==t.control_revision)fail('El viaje cambió. Actualiza sus detalles.',409);const state=await controlState(t),fingerprint=controlFingerprint(state);res.json({challenge:await sendConfirmation(req.user,confirmationType(t.id,v,fingerprint),`Autoriza ${v.action==='correct'?'corregir datos y evidencia de un punto':v.action==='standby'?'revisar un cargo de stand by':'resolver incidencias y confirmar el flete'} del viaje ${t.code}. Motivo: ${v.reason}. Se conservarán los datos anteriores en su historial.`),fingerprint});});
export const applyCorrection=wrap(async(req,res)=>{
 validateId(req.params.id);const t=await tripAccess(req,req.params.id),v=controlValues(req.body);if(t.status==='cancelado')fail('Viaje cancelado');
 const state=await controlState(t),fingerprint=controlFingerprint(state);if(v.revision!==t.control_revision||req.body.fingerprint!==fingerprint)fail('El viaje cambió desde la autorización. Revisa y solicita otro código.',409);
 const challenge=await verifyConfirmation(req.user,confirmationType(t.id,v,fingerprint),req.body);
 const result=await db.transaction(async transaction=>{await db.query('SELECT pg_advisory_xact_lock(782135)',{transaction});const row=await Trip.findByPk(t.id,{transaction,lock:transaction.LOCK.UPDATE});if(!row||row.status==='cancelado'||controlFingerprint(await controlState(row,transaction))!==fingerprint)fail('El viaje cambió. Solicita otro código.',409);await consumeConfirmation(challenge,transaction);return applyControl(row,req.user,v,transaction);});
 if(!t.is_test&&v.action==='correct'&&v.patch.arrival_odometer!=null)await dispatchAlerts(t.vehicle_id);res.json(result);
});
export const recordOutcome=wrap(async(req,res)=>{
 validateId(req.params.id);await tripAccess(req,req.params.id);const b=req.body,position=Number(b.position),reason=String(b.reason||'').trim(),outcome=b.outcome,request_id=String(b.request_id||'');
 if(!Number.isInteger(position)||position<1||!['partial','rejected','failed'].includes(outcome))fail('Selecciona un destino y una incidencia válida');if(reason.length<5||reason.length>1000)fail('Describe la novedad entre 5 y 1000 caracteres');if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(request_id))fail('Identificador de registro inválido');
 const tons=outcome==='partial'?Number(b.delivered_tons):0;if(!Number.isFinite(tons)||Math.abs(tons*1000-Math.round(tons*1000))>0.0001||tons<0||outcome==='partial'&&(b.delivered_tons==null||b.delivered_tons===''||tons<=0))fail('Indica el tonelaje total entregado parcialmente en este punto');
 const v={action:'outcome',position,outcome,reason,delivered_tons:tons,request_id},requestHash=hash(v);
 const result=await operationTransaction(req,async transaction=>{
  await db.query('SELECT pg_advisory_xact_lock(782135)',{transaction});const t=await Trip.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE});
  const previous=await Revision.findOne({where:{request_id},transaction});if(previous){if(String(previous.trip_id)!==String(t.id)||String(previous.user_id)!==String(req.user.id)||previous.request_hash!==requestHash)fail('El identificador ya se usó con otros datos',409);return {ok:true,duplicate:true,revision:previous.revision};}
  if(['finalizado','cancelado'].includes(t.status))fail('Viaje cerrado');if(await Line.count({where:{trip_id:t.id,active:true},transaction}))fail(isAdmin(req.user)?'El viaje ya está incluido en un corte; solicita revisión al administrador.':'Este viaje requiere revisión del administrador para registrar cambios.',409);
  if(outcome==='partial'&&tons>=Number(t.tonnage))fail('La entrega parcial debe ser menor al tonelaje total del viaje');
  const s=await Stop.findOne({where:{trip_id:t.id,position},transaction,lock:transaction.LOCK.UPDATE});if(!s?.arrived_at)fail('Primero debe registrarse la llegada al destino');if(!s.exception_resolved)fail('Este punto ya tiene una incidencia pendiente de revisión');
  const before=await controlState(t,transaction);await s.update({outcome,outcome_note:reason,outcome_at:s.received_at||stopClock(t,req),delivered_tons:tons,exception_resolved:false,received_at:null},{transaction});await accrueTrip(t,transaction,stopClock(t,req));await saveRevision(t,req.user,v,before,transaction,requestHash);const recipients=await User.findAll({where:{role:'admin',active:true},attributes:['id'],transaction});for(const id of new Set([String(t.driver_id),...recipients.map(u=>String(u.id))]))await Operational.create({user_id:id,trip_id:t.id,stop_id:s.id,phase:'incident'+t.control_revision,title:'Incidencia de entrega pendiente',message:`${t.code} · ${s.place.name}. ${outcome==='partial'?'Entrega parcial: '+tons+' t':outcome==='rejected'?'Entrega rechazada':'Entrega fallida'}. ${reason}. Requiere resolución del administrador antes del cierre y del corte.`},{transaction});
  return {ok:true,revision:t.control_revision};
 });res.json(result);
});
