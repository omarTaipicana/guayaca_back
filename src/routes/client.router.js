import {Router} from 'express';
import {auth,admin} from '../middlewares/verifyJWT.js';
import {listClients,getClient,saveClient} from '../controllers/client.controllers.js';
const router=Router();router.use('/api/clients',auth,admin);
router.get('/api/clients',listClients);router.get('/api/clients/:id',getClient);router.post('/api/clients',saveClient);router.patch('/api/clients/:id',saveClient);
export default router;
