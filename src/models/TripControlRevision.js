import db from '../utils/connection.js';
import {controlRevisionFields} from '../migrations/017-trip-control.js';
export default db.define('TripControlRevision',controlRevisionFields,{tableName:'trip_control_revisions',timestamps:false,freezeTableName:true});
