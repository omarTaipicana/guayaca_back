import {sendInvitation,validateInvitationConfig} from "../services/invitation.service.js";
import crypto from "node:crypto";
import {
  bcrypt,
  User,
  literal,
  wrap,
  fail,
  mailReady,
  safe,
  audit,
  PERMS,
} from "../services/shared.service.js";
export const usersGet = wrap(async (req, res) => {
  const users=await User.findAll({attributes:['id','name','last_name','document_number','birth_date','sex','phone','photo_filename','email','role','permissions','active','email_verified','two_factor','setup_pending','created_at'],order:[['id','ASC']]});
  res.json(users.map(u=>{const x=u.get({plain:true});x.has_photo=Boolean(x.photo_filename);delete x.photo_filename;return x}));
});
export const usersPost = wrap(async (req, res) => {
  let name=String(req.body.name||'').trim(),last_name=String(req.body.last_name||'').trim(),email=String(req.body.email||'').trim().toLowerCase();
  if(!name||name.length>120||!last_name||last_name.length>120||email.length>254||!/^\S+@\S+\.\S+$/.test(email))fail(400,'Ingrese nombres, apellidos y un correo válido.');
  validateInvitationConfig();
  const randomPassword=crypto.randomBytes(32).toString('base64url');
  const u=await User.create({name,last_name,email,password_hash:await bcrypt.hash(randomPassword,12),role:'conductor',permissions:['viajes'],two_factor:false,setup_pending:true,email_verified:false});
  let sent=false;
  try{sent=await sendInvitation(u)}catch(e){console.error('No se pudo crear la invitación:',e.name)}
  try{await audit(req.user,'crear_usuario',{user_id:u.id,invitation_sent:sent})}catch(e){console.error('No se pudo registrar auditoría de creación:',e.name)}
  res.status(201).json({user:safe(u),invitation_sent:sent});
});
export const resendInvitationPost = wrap(async (req,res)=>{
  let user=await User.findByPk(req.params.id);if(!user)fail(404,'Usuario no encontrado');
  const sent=await sendInvitation(user);
  try{await audit(req.user,'reenviar_invitacion',{user_id:user.id,invitation_sent:sent})}catch(e){console.error('No se pudo registrar auditoría de invitación:',e.name)}
  res.json({invitation_sent:sent});
});
export const userPatch = wrap(async (req, res) => {
  let { active, permissions, two_factor } = req.body;
  if (String(req.user.id) === req.params.id && active === false)
    fail(400, "No puede desactivarse a sí mismo");
  if (
    permissions !== undefined &&
    (!Array.isArray(permissions) || permissions.some((x) => !PERMS.includes(x)))
  )
    fail(400, "Permisos inválidos");
  if (req.body.role !== undefined && !["conductor", "usuario", "admin"].includes(req.body.role)) fail(400,"Rol inválido");
  if (String(req.user.id) === req.params.id && req.body.role !== undefined && req.body.role !== "admin") fail(400,"No puede cambiar su propio rol de administrador");
  let changes = { session_version: literal("session_version + 1") };
  if (req.body.role !== undefined) changes.role = req.body.role;
  if (typeof active === "boolean") changes.active = active;
  if (permissions !== undefined) changes.permissions = permissions;
  if (typeof two_factor === "boolean") changes.two_factor = two_factor;
  let [n, rows] = await User.update(changes, {
    where: { id: req.params.id },
    returning: true,
  });
  if (!n) fail(404, "Usuario no encontrado");
  await audit(req.user, "actualizar_usuario", {
    user_id: req.params.id,
    active,
    permissions,
    two_factor,
    role: req.body.role,
  });
  res.json(safe(rows[0]));
});

export const userActivityGet = wrap(async (req, res) => {
  const { Audit, Op } = await import('../services/shared.service.js');
  const user = await User.findByPk(req.params.id, { attributes: ['id'] });
  if (!user) fail(404, 'Usuario no encontrado');
  const before = req.query.before;
  if (before !== undefined && !/^\d+$/.test(String(before))) fail(400, 'Página inválida');
  const where = { user_id: user.id };
  if (before !== undefined) where.id = { [Op.lt]: before };
  const records = await Audit.findAll({ where, attributes: ['id','action','details','created_at'], order: [['id','DESC']], limit: 51 });
  const hasMore = records.length > 50;
  const items = records.slice(0,50);
  res.json({items, next_before: hasMore ? String(items[items.length-1].id) : null});
});
