import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import { downloadFile } from "../controllers/file.controllers.js";
const router = Router();
router.get("/api/files/:id", auth, allow("viajes"), downloadFile);
export default router;
