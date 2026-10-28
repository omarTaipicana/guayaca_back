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
  if (origin && origin === process.env.APP_URL) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
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
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ error: "Archivo supera 12 MB" });
  res.status(err.status || 500).json({
    error: err.status ? err.message : "Error interno; revise el servidor",
  });
});
export default app;
