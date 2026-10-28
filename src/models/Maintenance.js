import {DataTypes} from 'sequelize';
import db from '../utils/connection.js';
import {maintenanceFields} from '../migrations/006-maintenance-history.js';
export default db.define('Maintenance',{...maintenanceFields,next_maintenance_km:DataTypes.DECIMAL(12,1),warning_km:DataTypes.INTEGER},{tableName:'maintenances',timestamps:false,freezeTableName:true});
