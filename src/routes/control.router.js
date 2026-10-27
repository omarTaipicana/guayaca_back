import {Router} from 'express';import {auth,admin} from '../middlewares/verifyJWT.js';import {controlGet} from '../controllers/control.controllers.js';
const router=Router();router.get('/api/control-map',auth,admin,controlGet);export default router;
