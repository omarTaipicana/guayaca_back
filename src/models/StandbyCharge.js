import {chargeReviewFields} from '../migrations/017-trip-control.js';
import db from '../utils/connection.js';import {standbyFields} from '../migrations/012-standby-collections.js';export default db.define('StandbyCharge',{...standbyFields,...chargeReviewFields},{tableName:'standby_charges',timestamps:false});
