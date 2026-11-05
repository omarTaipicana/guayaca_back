import {hasAndroidSession} from '../services/androidSession.service.js';
import { jwt, User, secret, wrap } from "../services/shared.service.js";
const auth = wrap(async (req, res, next) => {
  let p;
  try {
    p = jwt.verify(
      (req.headers.authorization || "").replace(/^Bearer /, ""),
      secret,
      {algorithms:['HS256']},
    );
  } catch {
    return res.status(401).json({ error: "Sesión inválida o vencida" });
  }
  const u = await User.findByPk(p.sub);
  if (!u || !u.active || u.setup_pending || u.session_version !== p.sv)
    return res.status(401).json({ error: "Sesión inválida o vencida" });
  if(p.kind==='android'){
    if(!(await hasAndroidSession(p.sid,u.id)))return res.status(401).json({error:'Sesión inválida o vencida'});
    req.androidSession=p.sid;
  }else if(p.kind!==undefined||typeof p.exp!=='number'){
    return res.status(401).json({error:'Sesión inválida o vencida'});
  }
  req.user = u;
  next();
});
const allow = (p) => (req, res, next) =>
  req.user.role === "admin" || req.user.permissions.includes(p)
    ? next()
    : res.status(403).json({ error: "Sin permiso" });
const admin = (req, res, next) =>
  req.user.role === "admin"
    ? next()
    : res.status(403).json({ error: "Solo administrador" });
export { auth, allow, admin };
