import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {Op,literal} from 'sequelize';
import {sequelize,User,Challenge} from '../models/index.js';
import {sendMail,smtpConfigured} from './email.service.js';
import {securityEmail} from './emailTemplates.service.js';
import {audit} from './shared.service.js';

const type='password_reset';
const CODE_TTL=10*60*1000, HOURLY_WINDOW=60*60*1000, MAX_PER_HOUR=3;
function codeHash(id,code){return crypto.createHmac('sha256',process.env.JWT_SECRET).update(id+':'+code).digest('hex')}
function error(status,message){let e=new Error(message);e.status=status;return e}
export async function requestPasswordReset(email){
 if(!smtpConfigured())throw error(503,'El servicio de correo no está configurado. Contacte al administrador.');
 const id=crypto.randomUUID();
 const normalized=String(email||'').trim().toLowerCase();
 if(!/^\S+@\S+\.\S+$/.test(normalized)||normalized.length>254)throw error(400,'Ingrese un correo válido.');
 const code=String(crypto.randomInt(100000,1000000));
 const recipient=await sequelize.transaction(async transaction=>{
  // Lock the account so concurrent requests across server workers share the same cooldown.
  const user=await User.findOne({where:{email:normalized,active:true,setup_pending:false},transaction,lock:transaction.LOCK.UPDATE});
  if(!user)return null;
  const now=new Date();
  // expires_at includes the TTL; subtract it from the stored time when measuring request age.
  const cutoff=new Date(+now-HOURLY_WINDOW+CODE_TTL);
  const recent=await Challenge.findAll({where:{user_id:user.id,type,expires_at:{[Op.gt]:cutoff}},attributes:['expires_at'],transaction});
  if(recent.length>=MAX_PER_HOUR||recent.some(row=>row.expires_at>now))return null;
  await Challenge.destroy({where:{user_id:user.id,type,expires_at:{[Op.lte]:cutoff}},transaction});
  await Challenge.create({id,user_id:user.id,type,code_hash:codeHash(id,code),expires_at:new Date(+now+CODE_TTL)},{transaction});
  return user.email;
 });
 if(recipient){
  try{const email=securityEmail(type,code);await sendMail(recipient,email.subject,email.text,email.html)}
  catch(err){console.error('No fue posible enviar el correo de recuperación:',err.code||err.name);}
 }
 return {challenge:id,message:'Si existe una cuenta activa y no tiene un código vigente, recibirás un correo. Si ya solicitaste un código, usa la pantalla de la primera solicitud o vuelve a intentarlo más tarde.'};
}
export async function resetPassword(id,code,password){
 if(typeof id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)||!/^\d{6}$/.test(String(code||'')))throw error(400,'Código inválido o vencido.');
 if(typeof password!=='string'||password.length<12||Buffer.byteLength(password,'utf8')>72)throw error(400,'La contraseña debe tener al menos 12 caracteres y no superar 72 bytes.');
 // Registrar el intento fuera de la transacción: incluso si el código es incorrecto, cuenta.
 const [count,rows]=await Challenge.update({attempts:literal('attempts + 1')},{where:{id,type,used_at:null,expires_at:{[Op.gt]:new Date()},attempts:{[Op.lt]:5}},returning:true});
 if(!count)throw error(400,'Código inválido o vencido.');
 const actual=Buffer.from(rows[0].code_hash,'hex'),provided=Buffer.from(codeHash(id,String(code)),'hex');
 if(actual.length!==provided.length||!crypto.timingSafeEqual(actual,provided))throw error(400,'Código inválido o vencido.');
 const password_hash=await bcrypt.hash(password,12);
 const user=await sequelize.transaction(async transaction=>{
  // Use the same lock order as requestPasswordReset.
  const u=await User.findOne({where:{id:rows[0].user_id,active:true,setup_pending:false},transaction,lock:transaction.LOCK.UPDATE});
  if(!u)throw error(400,'Código inválido o vencido.');
  const c=await Challenge.findOne({where:{id,type,user_id:u.id,used_at:null,expires_at:{[Op.gt]:new Date()}},transaction,lock:transaction.LOCK.UPDATE});
  if(!c)throw error(400,'Código inválido o vencido.');
  await u.update({password_hash,session_version:literal('session_version + 1')},{transaction});
  await c.update({used_at:new Date()},{transaction});
  await Challenge.destroy({where:{user_id:u.id,type:{[Op.ne]:type}},transaction});
  return u;
 });
 // Si falla la auditoría, la contraseña ya se actualizó; no reportar un fallo engañoso al usuario.
 try{await audit(user,'recuperar_contrasena')}catch(e){console.error('No se pudo registrar la auditoría de recuperación:',e.name)}
 return {ok:true,message:'Contraseña actualizada. Ya puedes iniciar sesión.'};
}
