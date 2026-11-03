import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const origins=[process.env.APP_URL,...(process.env.CORS_ORIGINS||'').split(',')].map(x=>x?.trim()).filter(Boolean);
  if (origin && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth", limiter);
app.use(router);
app.use((err, req, res, next) => {
  console.error(err.message);
  if (
    err.name === "SequelizeUniqueConstraintError" ||
    err.original?.code === "23505"
  )
    return res.status(409).json({ error: "El dato ya existe" });
  if (
    err.name === "SequelizeForeignKeyConstraintError" ||
    err.original?.code === "23503"
  )
    return res.status(400).json({ error: "Referencia inválida" });
  if(['LIMIT_FILE_COUNT','LIMIT_UNEXPECTED_FILE'].includes(err.code))return res.status(400).json({error:'Demasiados adjuntos o campo no permitido. Una guía admite hasta 10 archivos; los demás registros admiten uno.'});
  if(err.code==='LIMIT_FIELD_VALUE')return res.status(400).json({error:'Los datos del formulario exceden el límite permitido'});
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ error: "Archivo supera 12 MB" });
  res.status(err.status || 500).json({
    error: err.status ? err.message : "Error interno; revise el servidor",
  });
});
export default app;
