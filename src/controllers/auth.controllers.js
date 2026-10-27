import {activateAccount} from "../services/invitation.service.js";
import {requestPasswordReset, resetPassword} from "../services/passwordRecovery.service.js";
import {
  bcrypt,
  User,
  literal,
  wrap,
  fail,
  challenge,
  consume,
  safe,
  audit,
  token,
} from "../services/shared.service.js";
export const loginPost = wrap(async (req, res) => {
  let email = String(req.body.email || "")
      .toLowerCase()
      .trim(),
    u = await User.findOne({ where: { email } });
  if (
    !u ||
    !u.active ||
    u.setup_pending ||
    !(await bcrypt.compare(String(req.body.password || ""), u.password_hash))
  )
    fail(401, "Credenciales incorrectas o usuario inactivo");
  if (!u.email_verified) {
    const id = await challenge(u, "verify");
    return res.json({ step: "verify", challenge: id });
  }
  if (u.two_factor) {
    const id = await challenge(u, "login");
    return res.json({ step: "2fa", challenge: id });
  }
  await audit(u, "inicio_sesion");
  res.json({ token: token(u), user: safe(u) });
});
export const codePost = wrap(async (req, res) => {
  const type =
    req.body.step === "verify"
      ? "verify"
      : req.body.step === "2fa"
        ? "login"
        : null;
  if (!type) fail(400, "Paso inválido");
  const id = await consume(req.body.challenge, req.body.code, type);
  if (type === "verify")
    await User.update({ email_verified: true }, { where: { id } });
  const u = await User.findByPk(id);
  if (!u || !u.active) fail(403, "Usuario inactivo");
  if (type === "verify" && u.two_factor) {
    const c = await challenge(u, "login");
    return res.json({ step: "2fa", challenge: c });
  }
  await audit(u, "inicio_sesion");
  res.json({ token: token(u), user: safe(u) });
});
export const meGet = (req, res) => res.json(safe(req.user));
export const logoutPost = wrap(async (req, res) => {
  await User.update(
    { session_version: literal("session_version + 1") },
    { where: { id: req.user.id } },
  );
  await audit(req.user, "cierre_sesion");
  res.json({ ok: true });
});

export const forgotPasswordPost = wrap(async (req, res) => res.json(await requestPasswordReset(req.body.email)));
export const resetPasswordPost = wrap(async (req, res) => res.json(await resetPassword(req.body.challenge, req.body.code, req.body.password)));

export const activateAccountPost = wrap(async (req,res) => {const u=await activateAccount(req.body.token,req.body.password);try{await audit(u,"activar_cuenta")}catch(e){console.error("No se pudo registrar auditoría de activación:",e.name)}res.json({ok:true,message:"Cuenta activada. Ya puedes iniciar sesión."});});
