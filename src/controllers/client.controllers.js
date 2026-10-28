import Client from '../models/Client.js';
import Audit from '../models/Audit.js';
import db from '../utils/connection.js';
import {wrap,validateId,common,text,listing,fail} from '../services/catalog.service.js';
export const listClients=wrap(async(req,res)=>{const options=listing(req);const {rows,count}=await Client.findAndCountAll(options);res.json({items:rows,total:count,page:options.page,pages:Math.max(1,Math.ceil(count/options.limit))});});
export const getClient=wrap(async(req,res)=>{validateId(req.params.id);const row=await Client.findByPk(req.params.id);if(!row)fail('Cliente no encontrado',404);res.json(row);});
export const saveClient=wrap(async(req,res)=>{if(req.params.id)validateId(req.params.id);const values={...common(req.body),contact_name:text(req.body.contact_name,180,'Contacto'),updated_at:new Date()};const result=await db.transaction(async transaction=>{let row=req.params.id?await Client.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE}):null;if(req.params.id&&!row)fail('Cliente no encontrado',404);row=row?await row.update(values,{transaction}):await Client.create(values,{transaction});await Audit.create({user_id:req.user.id,action:req.params.id?'cliente.actualizado':'cliente.creado',details:{client_id:row.id,name:row.name,active:row.active}},{transaction});return row;});res.status(req.params.id?200:201).json(result);});
