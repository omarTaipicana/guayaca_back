import db from '../utils/connection.js';
import {fields} from '../migrations/010-maintenance-plans.js';
export default db.define('MaintenancePlan',fields,{tableName:'maintenance_plans',timestamps:false});
