import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import {
  usersGet,
  usersPost,
  userPatch,
  userActivityGet,
  resendInvitationPost,
} from "../controllers/user.controllers.js";
const router = Router();
router.get("/api/users", auth, admin, usersGet);
router.post("/api/users", auth, admin, usersPost);
router.patch("/api/users/:id", auth, admin, userPatch);
router.get("/api/users/:id/activity", auth, admin, userActivityGet);
router.post("/api/users/:id/invitation", auth, admin, resendInvitationPost);
export default router;
