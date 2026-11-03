import db from '../utils/connection.js';import {operationFields} from '../migrations/018-offline-operations.js';
export default db.define('OfflineOperation',operationFields,{tableName:'offline_operations',timestamps:false,freezeTableName:true});
