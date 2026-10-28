import {DataTypes} from 'sequelize';
import db from '../utils/connection.js';
export default db.define('TonnageCategory',{id:{type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},name:DataTypes.STRING(100),min_tons:DataTypes.DECIMAL(10,3),max_tons:DataTypes.DECIMAL(10,3),active:DataTypes.BOOLEAN},{tableName:'tonnage_categories',timestamps:false,freezeTableName:true});
