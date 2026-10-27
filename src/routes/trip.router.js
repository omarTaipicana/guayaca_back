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
router.post("/api/trips", auth, admin, tripsPost);
router.get("/api/trips/:id", auth, allow("viajes"), tripGet);
router.post("/api/trips/:id/events", auth, allow("viajes"), eventPost);
router.post("/api/trips/:id/expenses", auth, allow("viajes"), expensePost);
router.post(
  "/api/trips/:id/files",
  auth,
  allow("viajes"),
  upload.single("file"),
  filePost,
);
export default router;
