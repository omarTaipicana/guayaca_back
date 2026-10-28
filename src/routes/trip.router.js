import rateLimit from 'express-rate-limit';
import {tripOptions,quoteTrip} from '../controllers/tripQuote.controllers.js';
import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import {
  tripsGet,
  tripsPost,
  tripGet,
  eventPost,
  expensePost,
  filePost,
} from "../controllers/trip.controllers.js";
const router = Router();
router.get(
  "/api/trips",
  auth,
  (req, res, next) =>
    req.user.role === "admin" ||
    req.user.permissions.includes("viajes") ||
    req.user.permissions.includes("reportes")
      ? next()
      : res.status(403).json({ error: "Sin permiso" }),
  tripsGet,
);
const quotesLimit=rateLimit({windowMs:60000,limit:10,keyGenerator:req=>String(req.user.id),standardHeaders:true,legacyHeaders:false,message:{error:'Espera un minuto antes de volver a calcular rutas.'}});
router.get('/api/trips/options',auth,allow('viajes'),tripOptions);
router.post('/api/trips/quote',auth,allow('viajes'),quotesLimit,quoteTrip);
router.post("/api/trips", auth, allow('viajes'), tripsPost);
router.get("/api/trips/:id", auth, allow("viajes"), tripGet);
router.post("/api/trips/:id/events", auth, allow("viajes"), eventPost);
router.post("/api/trips/:id/expenses", auth, allow("viajes"), upload.single("receipt"), expensePost);
router.post(
  "/api/trips/:id/files",
  auth,
  allow("viajes"),
  upload.single("file"),
  filePost,
);
export default router;
