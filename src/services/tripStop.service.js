import {Op} from 'sequelize';
import db from '../utils/connection.js';
import Trip from '../models/Trip.js';
import Stop from '../models/TripStop.js';
import Operational from '../models/OperationalNotification.js';
export const documented=s=>Boolean((s.arrival_file_id||s.document_waived)&&s.arrival_odometer!=null);
export const stopClock=(t,req)=>t.is_test&&t.test_clock?new Date(t.test_clock):req?.sync?.captured_at?new Date(req.sync.captured_at):new Date();
export const history=(s,event,at,extra={})=>[...(s.exit_history||[]),{event,at:new Date(at).toISOString(),...extra}];
export async function finishTrip(t,stops,transaction){if(stops.length&&stops.every(s=>s.departed_at&&documented(s)&&s.exception_resolved!==false))await t.update({status:'finalizado',closed_at:new Date(Math.max(...stops.map(s=>+new Date(s.departed_at))))},{transaction});}
export async function clearStopNotices(t,s,transaction){await Operational.update({read_at:new Date()},{where:{stop_id:s.id,user_id:t.driver_id,read_at:null},transaction});}
export async function remindStop(t,s,transaction,{force=false,at=stopClock(t)}={}){
 const decision=s.exit_state==='pending'||s.exit_state==='review';
 if(!s.outside_at||documented(s))return;
 const needs=[...(!s.arrival_file_id&&!s.document_waived?[s.position===0?'guía de embarque':'documento de entrega']:[]),...(s.arrival_odometer==null?['kilometraje del punto']:[]),...(decision?['confirmar si entregaste o sigues esperando (hotel/comida/otra novedad)']:[])];
 // One notification for each actual departure, including during offline replay.
 const phase='salida:'+new Date(s.outside_at).getTime().toString(36);
 await Operational.findOrCreate({where:{user_id:t.driver_id,stop_id:s.id,phase},defaults:{trip_id:t.id,title:decision?'Confirma la salida de entrega':'Pendientes del punto del viaje',message:`${t.code} · ${s.place.name}. Falta: ${needs.join(', ')}. ${decision?'La salida física no confirma la entrega. El stand by posterior a esa salida queda en revisión hasta responder.':'Completa estos datos una sola vez; no se vuelven a pedir al salir.'}`},transaction});
 await s.update({reminded_at:at},{transaction});
}
let running=null;
export function refreshStopReminders(){if(running)return running;running=(async()=>{
 const trips=await Trip.findAll({where:{status:{[Op.in]:['creado','en_curso']}}});
 for(const t of trips)await db.transaction(async transaction=>{const row=await Trip.findByPk(t.id,{transaction,lock:transaction.LOCK.UPDATE});if(!row||!['creado','en_curso'].includes(row.status))return;const stops=await Stop.findAll({where:{trip_id:row.id},transaction});for(const s of stops)await remindStop(row,s,transaction);});
})().finally(()=>{running=null});return running;}
export function startReminderWorker(){const run=()=>refreshStopReminders().catch(e=>console.error('Recordatorios de viaje:',e.message));run();const timer=setInterval(run,60000);timer.unref();return timer;}

export function tripProgress(t,stops){if(t.status==='cancelado')return 'cancelado';if(t.status==='finalizado')return 'finalizado';if(stops.some(s=>s.exception_resolved===false))return 'pendiente_revision';if(stops.length&&stops.every(s=>s.departed_at))return 'recorrido_terminado_pendientes';if(stops.some(s=>s.exit_state==='pending'||s.exit_state==='review'))return 'salida_por_confirmar';if(stops.some(s=>s.exit_state==='waiting'&&!s.departed_at))return 'esperando_fuera';return t.status;}
