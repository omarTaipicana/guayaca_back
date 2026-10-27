import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import { health } from "../controllers/health.controllers.js";
const router = Router();
router.get("/api/health", health);
export default router;
