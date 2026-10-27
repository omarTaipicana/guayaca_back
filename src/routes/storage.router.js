import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import {
  storageGet,
  storageDelete,
} from "../controllers/storage.controllers.js";
const router = Router();
router.get("/api/storage", auth, admin, storageGet);
router.post("/api/storage/delete", auth, admin, storageDelete);
export default router;
