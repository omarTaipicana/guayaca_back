import {Op} from 'sequelize';
import {documentFiles} from '../services/document.service.js';
import crypto from 'node:crypto';import Receipt from '../models/OfflineOperation.js';import Trip from '../models/Trip.js';import Stop from '../models/TripStop.js';import {wrap,fail,validateId} from '../services/catalog.service.js';import {tripAccess} from '../services/shared.service.js';
import {gpsPost,completeStop,resolveExit} from './gps.controllers.js';import {expensePost} from './trip.controllers.js';import {recordOutcome} from './tripControl.controllers.js';
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const invoke=(fn,req)=>new Promise((resolve,reject)=>fn(req,{json:resolve,status(){return this}},reject));
export const synchronize=wrap(async(req,res)=>{
 let op;try{op=JSON.parse(req.body.operation)}catch{fail('Operación de sincronización inválida')}
 if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(op.id||''))fail('Identificador de operación inválido');validateId(String(op.trip_id));
 const handlers={gps:gpsPost,point:completeStop,expense:expensePost,exit:resolveExit,outcome:recordOutcome};if(!handlers[op.kind]||!op.body||typeof op.body!=='object'||Array.isArray(op.body))fail('Tipo de operación no permitido');
 const at=new Date(op.captured_at);if(!Number.isFinite(+at))fail('Fecha original inválida');
 req.params={id:String(op.trip_id)};
 const files=req.files||[req.file].filter(Boolean);if(files.length){documentFiles(req);if(op.kind!=='point'&&files.length>1)fail('Esta operación admite un solo archivo');}req.file=files[0];
 const fileHash=req.file?crypto.createHash('sha256').update(req.file.buffer).digest('hex'):null;
 const hash=crypto.createHash('sha256').update(JSON.stringify(canonical({...op,captured_at:at.toISOString(),file:files.length>1?files.map(f=>({hash:crypto.createHash('sha256').update(f.buffer).digest('hex'),name:f.originalname,mime:f.mimetype})):req.file?{hash:fileHash,name:req.file.originalname,mime:req.file.mimetype}:null}))).digest('hex');
 const old=await Receipt.findByPk(op.id);if(old){if(String(old.user_id)!==String(req.user.id)||old.request_hash!==hash)fail('El identificador ya se usó con otros datos o cuenta',409);res.json({confirmed:true,id:old.id,result:old.result,confirmed_at:old.confirmed_at,replayed:true});return;}
 if(req.user.role!=='admin'&&!req.user.permissions.includes('viajes'))fail('Sin permiso para registrar operaciones',403);
 if(at-Date.now()>30000||Date.now()-at>90*86400000)fail('La fecha original está fuera del rango de sincronización (90 días)');
 const trip=await tripAccess(req,req.params.id);if(at<new Date(trip.created_at)-120000)fail('La operación es anterior a la creación del viaje');
 if(op.kind==='gps'&&(!Number.isFinite(+new Date(op.body.timestamp))||new Date(op.body.timestamp).toISOString()!==at.toISOString()))fail('La fecha GPS debe coincidir con su captura original');
 if(['point','exit'].includes(op.kind)){const position=Number(op.position);if(!Number.isInteger(position)||position<0||position>15)fail('Punto inválido');const stop=await Stop.findOne({where:{trip_id:trip.id,position}});if(!stop)fail('Todavía no existe el punto GPS. Sincroniza primero las coordenadas de llegada.',409);req.params.stop=String(stop.id);}
 req.body=op.body;req.sync={id:op.id,kind:op.kind,hash,captured_at:at.toISOString()};
 const result=await invoke(handlers[op.kind],req);const receipt=await Receipt.findByPk(op.id);if(!receipt)fail('La operación no obtuvo confirmación persistente',500);
 res.json({confirmed:true,id:op.id,result,confirmed_at:receipt.confirmed_at,replayed:!!req.sync.replayed});
});

export const deletedTrips=wrap(async(req,res)=>{
 const ids=req.body?.trip_ids;
 if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||! /^[1-9]\d{0,18}$/.test(id)||BigInt(id)>9223372036854775807n))fail('Lista de viajes inválida');
 const rows=ids.length?await Trip.unscoped().findAll({
  attributes:['id'],where:{id:{[Op.in]:ids},deleted_at:{[Op.ne]:null},...(req.user.role==='admin'?{}:{driver_id:req.user.id})}
 }):[];
 res.set('Cache-Control','no-store').json({deleted_trip_ids:rows.map(t=>String(t.id))});
});
