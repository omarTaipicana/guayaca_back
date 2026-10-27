import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import {
  usersGet,
  usersPost,
  userPatch,
} from "../controllers/user.controllers.js";
const router = Router();
router.get("/api/users", auth, admin, usersGet);
router.post("/api/users", auth, admin, usersPost);
router.patch("/api/users/:id", auth, admin, userPatch);
export default router;
