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
export const usersGet = wrap(async (req, res) =>
  res.json(
    await User.findAll({
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "permissions",
        "active",
        "email_verified",
        "two_factor",
        "created_at",
      ],
      order: [["id", "ASC"]],
    }),
  ),
);
export const usersPost = wrap(async (req, res) => {
  let {
    name,
    email,
    password,
    role,
    permissions = [],
    two_factor = false,
  } = req.body;
  email = String(email || "")
    .trim()
    .toLowerCase();
  name = String(name || "").trim();
  if (
    !name ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    String(password || "").length < 12 ||
    !["conductor", "usuario", "admin"].includes(role) ||
    !Array.isArray(permissions) ||
    permissions.some((x) => !PERMS.includes(x))
  )
    fail(400, "Datos inválidos; la contraseña requiere al menos 12 caracteres");
  if (!mailReady()) fail(503, "Configure SMTP antes de crear usuarios");
  let u = await User.create({
    name,
    email,
    password_hash: await bcrypt.hash(password, 12),
    role,
    permissions,
    two_factor: !!two_factor,
  });
  await audit(req.user, "crear_usuario", { user_id: u.id });
  res.status(201).json(safe(u));
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
  let changes = { session_version: literal("session_version + 1") };
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
  });
  res.json(safe(rows[0]));
});
