import crypto from 'node:crypto';import db from '../utils/connection.js';import Receipt from '../models/OfflineOperation.js';import Trip from '../models/Trip.js';import {fail} from './catalog.service.js';
export async function operationTransaction(req,fn){
 if(!req.sync)return db.transaction(fn);
 return db.transaction(async transaction=>{
  const key=BigInt('0x'+crypto.createHash('sha256').update(req.sync.id).digest('hex').slice(0,15)).toString();
  await db.query('SELECT pg_advisory_xact_lock(CAST(:key AS bigint))',{replacements:{key},transaction});
  const old=await Receipt.findByPk(req.sync.id,{transaction});
  if(old){if(String(old.user_id)!==String(req.user.id)||old.request_hash!==req.sync.hash)fail('El identificador ya fue recibido con otros datos o cuenta',409);if(req.sync.cleanup)await req.sync.cleanup();req.sync.replayed=true;return old.result;}
  if(req.sync.kind==='outcome')await db.query('SELECT pg_advisory_xact_lock(782135)',{transaction});
  const trip=await Trip.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE});if(!trip)fail('Viaje no disponible para sincronizar',404);
  const result=await fn(transaction),plain=JSON.parse(JSON.stringify(result));
  await Receipt.create({id:req.sync.id,user_id:req.user.id,trip_id:trip.id,kind:req.sync.kind,request_hash:req.sync.hash,captured_at:req.sync.captured_at,result:plain},{transaction});return result;
 });
}
