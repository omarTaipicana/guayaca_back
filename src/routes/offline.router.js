import {Router} from 'express';import {auth,allow} from '../middlewares/verifyJWT.js';import {uploadDocuments} from '../middlewares/upload.js';import {synchronize} from '../controllers/offline.controllers.js';
const router=Router();router.post('/api/offline/operations',auth,uploadDocuments.array('file',10),synchronize);export default router;
