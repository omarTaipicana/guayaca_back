import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import { auditGet } from "../controllers/audit.controllers.js";
const router = Router();
router.get("/api/audit", auth, admin, auditGet);
export default router;
