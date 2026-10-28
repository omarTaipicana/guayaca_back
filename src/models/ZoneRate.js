import {DataTypes} from 'sequelize';
import db from '../utils/connection.js';
export default db.define('ZoneRate',{id:{type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},territory_id:DataTypes.UUID,category_id:DataTypes.INTEGER,amount:DataTypes.DECIMAL(12,2),active:DataTypes.BOOLEAN},{tableName:'zone_rates',timestamps:false,freezeTableName:true,indexes:[{unique:true,fields:['territory_id','category_id']}]});
