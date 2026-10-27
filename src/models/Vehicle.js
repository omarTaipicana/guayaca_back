import {DataTypes} from 'sequelize';
import sequelize from '../utils/connection.js';
import {schema001} from '../migrations/schema001.js';
export default sequelize.define('Vehicle',{
 ...schema001.vehicles,
 brand:{type:DataTypes.STRING(120),allowNull:true},model:{type:DataTypes.STRING(120),allowNull:true},model_year:{type:DataTypes.INTEGER,allowNull:true},chassis_number:{type:DataTypes.STRING(120),allowNull:true},engine_number:{type:DataTypes.STRING(120),allowNull:true},capacity_tons:{type:DataTypes.DECIMAL(10,2),allowNull:true},color:{type:DataTypes.STRING(80),allowNull:true},photo_filename:{type:DataTypes.STRING(120),allowNull:true},photo_bytes:{type:DataTypes.BIGINT,allowNull:true},
},{tableName:'vehicles',timestamps:false,freezeTableName:true});
