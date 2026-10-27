import { Router } from "express";
import { auth, allow, admin } from "../middlewares/verifyJWT.js";
import { upload } from "../middlewares/upload.js";
import {
  vehiclesGet,
  vehiclesPost,
} from "../controllers/vehicle.controllers.js";
const router = Router();
router.get("/api/vehicles", auth, allow("viajes"), vehiclesGet);
router.post("/api/vehicles", auth, admin, vehiclesPost);
export default router;
