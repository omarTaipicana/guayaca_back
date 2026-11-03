import {wrap} from '../services/catalog.service.js';
import {archiveSelection} from '../services/notificationInbox.service.js';
export const archiveNotices=wrap(async(req,res)=>res.json(await archiveSelection(req.user,req.body)));
