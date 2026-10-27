import os from "node:os";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import {smtpConfigured, sendMail} from "./email.service.js";
import sharp from "sharp";
import { Op, literal } from "sequelize";
import {
  sequelize,
  User,
  Challenge,
  Audit,
  Vehicle,
  Trip,
  TripEvent,
  Expense,
  Attachment,
} from "../models/index.js";
const secret = process.env.JWT_SECRET || "",
  uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
if (secret.length < 32 || secret.includes("CAMBIAR"))
  throw Error("JWT_SECRET debe ser único y tener al menos 32 caracteres");
await fs.mkdir(uploadDir, { recursive: true });
const wrap = (f) => (req, res, next) =>
  Promise.resolve(f(req, res, next)).catch(next);
const fail = (status, message) => {
  let e = Error(message);
  e.status = status;
  throw e;
};
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
const mailReady = smtpConfigured;
const send = sendMail;
async function challenge(user, type) {
  const id = crypto.randomUUID(),
    code = String(crypto.randomInt(100000, 1000000));
  await Challenge.destroy({ where: { user_id: user.id, type } });
  await Challenge.create({
    id,
    user_id: user.id,
    type,
    code_hash: hash(code),
    expires_at: new Date(Date.now() + 600000),
  });
  try {
    await send(
      user.email,
      "GUAYACA código de seguridad",
      `Su código es ${code}. Válido por 10 minutos. No lo comparta.`,
    );
  } catch (e) {
    await Challenge.destroy({ where: { id } });
    throw e;
  }
  return id;
}
async function consume(id, code, type) {
  const [count, rows] = await Challenge.update(
    { attempts: literal("attempts + 1") },
    {
      where: {
        id,
        type,
        used_at: null,
        expires_at: { [Op.gt]: new Date() },
        attempts: { [Op.lt]: 5 },
      },
      returning: true,
    },
  );
  if (!count) fail(400, "Código vencido o inválido");
  let c = rows[0],
    a = Buffer.from(c.code_hash),
    b = Buffer.from(hash(String(code || "")));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    fail(400, "Código incorrecto");
  const [n] = await Challenge.update(
    { used_at: new Date() },
    { where: { id, used_at: null } },
  );
  if (!n) fail(400, "Código ya utilizado");
  return c.user_id;
}
const safe = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  permissions: u.permissions,
  active: u.active,
  email_verified: u.email_verified,
  two_factor: u.two_factor,
});
async function audit(user, action, details = {}) {
  await Audit.create({ user_id: user?.id || null, action, details });
}
function token(u) {
  return jwt.sign({ sub: String(u.id), sv: u.session_version }, secret, {
    expiresIn: "8h",
  });
}
const PERMS = ["viajes", "reportes"];
async function tripAccess(req, id) {
  let t = await Trip.findByPk(id);
  if (!t) fail(404, "Viaje no encontrado");
  if (req.user.role !== "admin" && String(t.driver_id) !== String(req.user.id))
    fail(403, "Viaje no autorizado");
  return t;
}
export {
  os,
  jwt,
  bcrypt,
  crypto,
  path,
  fs,
  sharp,
  Op,
  literal,
  sequelize,
  User,
  Challenge,
  Audit,
  Vehicle,
  Trip,
  TripEvent,
  Expense,
  Attachment,
  secret,
  uploadDir,
  wrap,
  fail,
  mailReady,
  challenge,
  consume,
  safe,
  audit,
  token,
  PERMS,
  tripAccess,
};
