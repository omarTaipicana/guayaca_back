import {Op} from 'sequelize';
import db from '../utils/connection.js';
import State from '../models/NotificationState.js';
import Notice from '../models/Notification.js';
import Operational from '../models/OperationalNotification.js';
import Audit from '../models/Audit.js';
import {fail} from './catalog.service.js';
export async function inboxRows(user,folder='inbox'){
 if(!['inbox','archived'].includes(folder))fail('Bandeja inválida');
 const states=await State.findAll({where:{user_id:user.id}}),key=(kind,id)=>kind+':'+id,map=new Map(states.map(s=>[key(s.kind,s.notification_id),s]));
 async function rows(kind,Model,extra={}){const ids=states.filter(s=>s.kind===kind&&s.archived_at).map(s=>s.notification_id);if(folder==='archived'&&!ids.length)return [];
  const where={...extra,deleted_at:null,...(ids.length?{id:{[folder==='archived'?Op.in:Op.notIn]:ids}}:{})};
  return (await Model.findAll({where,order:[['id','DESC']],limit:100})).map(n=>{const pref=map.get(key(kind,n.id));return {...n.toJSON(),kind,read_at:kind==='maintenance'?(pref?.read_at||null):n.read_at,archived_at:pref?.archived_at||null};});
 }
 return [...await rows('trip',Operational,{user_id:user.id}),...(user.role==='admin'?await rows('maintenance',Notice):[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
}
export async function readMaintenance(user,id){return db.transaction(async transaction=>{
 const n=await Notice.findOne({where:{id,deleted_at:null},transaction,lock:transaction.LOCK.UPDATE});if(!n)fail('Notificación no encontrada',404);
 const [s]=await State.findOrCreate({where:{user_id:user.id,kind:'maintenance',notification_id:id},transaction});
 if(!s.read_at)await s.update({read_at:new Date()},{transaction});return {ok:true,read_at:s.read_at};
});}
export async function archiveSelection(user,body){
 if(typeof body?.archived!=='boolean'||!Array.isArray(body.items)||!body.items.length||body.items.length>500)fail('Selecciona entre 1 y 500 notificaciones y la acción');
 const items=body.items.map(x=>{if(!['trip','maintenance'].includes(x?.kind)||! /^[1-9]\d*$/.test(String(x.id)))fail('Selección inválida');return {kind:x.kind,id:String(x.id)}}).sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id));
 if(new Set(items.map(x=>x.kind+':'+x.id)).size!==items.length)fail('Hay notificaciones repetidas');
 return db.transaction(async transaction=>{
  const selected=[];
  for(const x of items){if(x.kind==='maintenance'&&user.role!=='admin')fail('Notificación no disponible para tu cuenta',403);
   const Model=x.kind==='trip'?Operational:Notice;const n=await Model.findOne({where:{id:x.id,deleted_at:null,...(x.kind==='trip'?{user_id:user.id}:{})},transaction,lock:transaction.LOCK.UPDATE});
   if(!n)fail('Una notificación ya no está disponible para tu cuenta',404);
   const [s]=await State.findOrCreate({where:{user_id:user.id,kind:x.kind,notification_id:x.id},transaction});
   if(body.archived&&!(x.kind==='trip'?n.read_at:s.read_at))fail('Solo puedes archivar notificaciones marcadas como leídas. No se archivó ninguna.',409);
   selected.push(s);
  }
  for(const s of selected)await s.update({archived_at:body.archived?(s.archived_at||new Date()):null},{transaction});
  await Audit.create({user_id:user.id,action:body.archived?'notificaciones.archivadas':'notificaciones.restauradas',details:{items,count:items.length}},{transaction});
  return {ok:true,count:items.length};
 });
}
