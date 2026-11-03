import db from '../utils/connection.js';
import {stateFields} from '../migrations/016-notification-archive.js';
export default db.define('NotificationState',stateFields,{tableName:'notification_states',timestamps:false,freezeTableName:true});
