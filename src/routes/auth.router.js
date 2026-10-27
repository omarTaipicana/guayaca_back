import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import {
  loginPost,
  codePost,
  meGet,
  logoutPost,
  forgotPasswordPost,
  resetPasswordPost,
  activateAccountPost,
} from "../controllers/auth.controllers.js";
const router = Router();
router.post("/api/auth/login", loginPost);
router.post("/api/auth/code", codePost);
router.post("/api/auth/forgot-password", forgotPasswordPost);
router.post("/api/auth/reset-password", resetPasswordPost);
router.post("/api/auth/activate-account", activateAccountPost);
router.get("/api/me", auth, meGet);
router.post("/api/auth/logout", auth, logoutPost);
export default router;
