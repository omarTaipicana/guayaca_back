import crypto from 'node:crypto';
import Challenge from '../models/Challenge.js';
import {secret} from '../services/shared.service.js';
import {sendMail} from '../services/email.service.js';
import {securityEmail} from '../services/emailTemplates.service.js';
import {QueryTypes,Op} from 'sequelize';
import db from '../utils/connection.js';
import Category from '../models/TonnageCategory.js';
import Rate from '../models/ZoneRate.js';
import Audit from '../models/Audit.js';
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
function bad(message){const e=Error(message);e.status=400;throw e;}
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));
const precise=(v,n)=>Math.abs(Number(v)*10**n-Math.round(Number(v)*10**n))<0.00001;
const number=(v)=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v));
async function catalog(){const [row]=await db.query(`SELECT to_regclass('public."territorialDivisions"') IS NOT NULL AS ready`,{type:QueryTypes.SELECT});if(!row.ready){const e=Error('Importe primero las capas territoriales de BPA.');e.status=409;throw e;}}
async function log(req,action,details,transaction){await Audit.create({user_id:req.user.id,action,details,created_at:new Date()},{transaction});}
export const territories=wrap(async(req,res)=>{await catalog();const level=req.query.level||'canton';if(!['province','canton','parish'].includes(level))bad('Nivel territorial inválido');const q=String(req.query.q||'').trim().slice(0,100);res.json(await db.query(`SELECT t.id,t.name,t.code,t.level,p.name AS parent_name FROM public."territorialDivisions" t LEFT JOIN public."territorialDivisions" p ON p.id=t."parentId" WHERE t.status=true AND t.level::text=:level AND (t.name ILIKE :q OR t.code ILIKE :q) ORDER BY t.name LIMIT 100`,{replacements:{level,q:'%'+q+'%'},type:QueryTypes.SELECT}));});
export const territory=wrap(async(req,res)=>{await catalog();if(!uuid(req.params.id))bad('Zona inválida');const [row]=await db.query(`SELECT id,name,code,level,ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry,0.00015))::json AS geometry FROM public."territorialDivisions" WHERE id=:id AND status=true`,{replacements:{id:req.params.id},type:QueryTypes.SELECT});if(!row){res.status(404).json({error:'Zona no encontrada'});return;}res.json(row);});
export const categories=wrap(async(req,res)=>res.json(await Category.findAll({order:[['min_tons','ASC']]})));
export const saveCategory=wrap(async(req,res)=>{if(req.params.id&&!/^[1-9][0-9]*$/.test(req.params.id))bad('Categoría inválida');const x=req.body;const name=String(x.name||'').trim();if(!name||name.length>100||!number(x.min_tons)||+x.min_tons<0||+x.min_tons>100000||!precise(x.min_tons,3))bad('Nombre y mínimo de toneladas válidos son obligatorios');const max=x.max_tons===''||x.max_tons==null?null:Number(x.max_tons);if(max!==null&&(!number(x.max_tons)||max<=+x.min_tons||max>100000||!precise(max,3)))bad('El máximo debe ser mayor que el mínimo');if(typeof x.active!=='boolean')bad('Estado inválido');
 const result=await db.transaction(async transaction=>{await db.query('LOCK TABLE tonnage_categories IN SHARE ROW EXCLUSIVE MODE',{transaction});let row=req.params.id?await Category.findByPk(req.params.id,{transaction}):null;if(req.params.id&&!row)bad('Categoría no encontrada');if(x.active){const all=await Category.findAll({where:{active:true},transaction});if(all.some(c=>String(c.id)!==String(row?.id)&&+x.min_tons<(c.max_tons==null?Infinity:+c.max_tons)&&(max==null?Infinity:max)>+c.min_tons))bad('La categoría se superpone con otra activa');}const values={name,min_tons:+x.min_tons,max_tons:max,active:x.active};row=row?await row.update(values,{transaction}):await Category.create(values,{transaction});await log(req,'tarifa.categoria_guardada',{category_id:row.id,...values},transaction);return row;});res.json(result);});
export const rates=wrap(async(req,res)=>{if(req.query.territory_id&&!uuid(req.query.territory_id))bad('Zona inválida');return res.json(await Rate.findAll({where:req.query.territory_id?{territory_id:req.query.territory_id}:{},order:[['id','DESC']],limit:2000}));});
export const saveRate=wrap(async(req,res)=>{await catalog();const x=req.body;if(!uuid(x.territory_id)||!Number.isInteger(+x.category_id)||!number(x.amount)||+x.amount<0||+x.amount>9999999999.99||!precise(x.amount,2)||typeof x.active!=='boolean')bad('Revise zona, categoría, precio y estado');const [zone]=await db.query('SELECT id FROM public."territorialDivisions" WHERE id=:id AND status=true',{replacements:{id:x.territory_id},type:QueryTypes.SELECT});if(!zone||!await Category.findByPk(x.category_id))bad('Zona o categoría inexistente');const values={territory_id:x.territory_id,category_id:+x.category_id,amount:Number(x.amount).toFixed(2),active:x.active};await db.transaction(async transaction=>{await Rate.upsert(values,{transaction,conflictFields:['territory_id','category_id']});await log(req,'tarifa.zona_guardada',values,transaction);});res.json({ok:true});});

const deleteHash=(id,code)=>crypto.createHmac('sha256',secret).update(id+':'+code).digest('hex');
export const requestCategoryDelete=wrap(async(req,res)=>{
 if(!/^[1-9][0-9]*$/.test(req.params.id))bad('Categoría inválida');
 const row=await Category.findByPk(req.params.id);
 if(!row){const e=Error('Categoría no encontrada');e.status=404;throw e;}
 if(await Rate.count({where:{category_id:row.id}})){const e=Error('La categoría tiene tarifas registradas y no se puede eliminar.');e.status=409;throw e;}
 const type='category_delete:'+row.id,id=crypto.randomUUID(),code=String(crypto.randomInt(100000,1000000));
 await Challenge.destroy({where:{user_id:req.user.id,type}});
 await Challenge.create({id,user_id:req.user.id,type,code_hash:deleteHash(id,code),expires_at:new Date(Date.now()+600000)});
 try{const mail=securityEmail('category_delete',code);await sendMail(req.user.email,mail.subject,mail.text+'\nCategoría: '+row.name,mail.html);}catch(e){await Challenge.destroy({where:{id}});e.status=503;e.message='No se pudo enviar el código. Revisa la configuración SMTP y vuelve a solicitarlo.';throw e;}
 await log(req,'tarifa.eliminacion_codigo_solicitado',{category_id:row.id});
 res.json({challenge:id,message:'Código enviado al correo de tu cuenta. Vence en 10 minutos.'});
});
export const deleteCategory=wrap(async(req,res)=>{
 if(!/^[1-9][0-9]*$/.test(req.params.id))bad('Categoría inválida');
 const {challenge,code}=req.body||{};
 if(!uuid(challenge)||!/^\d{6}$/.test(String(code||'')))bad('Ingresa el código de seis dígitos enviado a tu correo.');
 const type='category_delete:'+req.params.id;
 const [count,rows]=await Challenge.update({attempts:db.literal('attempts + 1')},{where:{id:challenge,user_id:req.user.id,type,used_at:null,expires_at:{[Op.gt]:new Date()},attempts:{[Op.lt]:5}},returning:true});
 if(!count)bad('Código vencido, utilizado o sin intentos disponibles. Solicita otro.');
 const expected=Buffer.from(rows[0].code_hash),actual=Buffer.from(deleteHash(challenge,String(code)));
 if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))bad('Código incorrecto.');
 await db.transaction(async transaction=>{
  const check=await Challenge.findOne({where:{id:challenge,user_id:req.user.id,type,used_at:null,expires_at:{[Op.gt]:new Date()}},transaction,lock:transaction.LOCK.UPDATE});
  if(!check)bad('Código vencido o ya utilizado.');
  const row=await Category.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE});
  if(!row){const e=Error('Categoría no encontrada');e.status=404;throw e;}
  if(await Rate.count({where:{category_id:row.id},transaction})){const e=Error('La categoría tiene tarifas registradas, incluso inactivas. Puede desactivarla.');e.status=409;throw e;}
  await check.update({used_at:new Date()},{transaction});
  await log(req,'tarifa.categoria_eliminada',{category_id:row.id,name:row.name,min_tons:row.min_tons,max_tons:row.max_tons,two_factor:true},transaction);
  await row.destroy({transaction});
 });
 res.json({ok:true});
});
