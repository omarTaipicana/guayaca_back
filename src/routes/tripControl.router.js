import {Router} from 'express';import rateLimit from 'express-rate-limit';import {auth,admin,allow} from '../middlewares/verifyJWT.js';import {getControl,correctionCode,applyCorrection,recordOutcome} from '../controllers/tripControl.controllers.js';
const router=Router(),limit=rateLimit({windowMs:900000,limit:10,keyGenerator:req=>String(req.user.id),standardHeaders:true,legacyHeaders:false,message:{error:'Espera antes de solicitar más códigos.'}});
router.get('/api/trips/:id/control',auth,allow('viajes'),getControl);
router.post('/api/trips/:id/control/code',auth,admin,limit,correctionCode);
router.post('/api/trips/:id/control/apply',auth,admin,applyCorrection);
router.post('/api/trips/:id/outcomes',auth,allow('viajes'),recordOutcome);
export default router;
