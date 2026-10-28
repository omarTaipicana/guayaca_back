import {Router} from 'express';
import {auth,admin} from '../middlewares/verifyJWT.js';
import {listPlaces,getPlace,savePlace,resolvePlace} from '../controllers/place.controllers.js';
const router=Router();router.use('/api/places',auth,admin);
router.get('/api/places',listPlaces);router.get('/api/places/resolve',resolvePlace);router.get('/api/places/:id',getPlace);router.post('/api/places',savePlace);router.patch('/api/places/:id',savePlace);
export default router;
