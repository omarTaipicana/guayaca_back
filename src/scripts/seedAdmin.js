import "dotenv/config";
import bcrypt from "bcryptjs";
import { sequelize, User } from "../models/index.js";
const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
  password = process.env.ADMIN_PASSWORD || "";
try {
  if (!email || password.length < 12 || password.includes("CAMBIAR"))
    throw new Error(
      "Configure ADMIN_EMAIL y ADMIN_PASSWORD de al menos 12 caracteres en .env",
    );
  await sequelize.authenticate();
  const admin = await User.findOne({ where: { role: "admin" } });
  if (admin)
    console.log("Ya existe un administrador; no se modificó su contraseña.");
  else {
    await User.create({
      name: process.env.ADMIN_NAME || "Administrador",
      email,
      password_hash: await bcrypt.hash(password, 12),
      role: "admin",
      email_verified: true,
    });
    console.log("Administrador inicial creado.");
  }
} catch (e) {
  console.error("No se pudo crear el administrador:", e.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
