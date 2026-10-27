import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import {
  loginPost,
  codePost,
  meGet,
  logoutPost,
} from "../controllers/auth.controllers.js";
const router = Router();
router.post("/api/auth/login", loginPost);
router.post("/api/auth/code", codePost);
router.get("/api/me", auth, meGet);
router.post("/api/auth/logout", auth, logoutPost);
export default router;
