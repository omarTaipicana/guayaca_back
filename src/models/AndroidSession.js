import {DataTypes} from 'sequelize';
import sequelize from '../utils/connection.js';
export default sequelize.define('AndroidSession',{
 digest:{type:DataTypes.STRING(64),primaryKey:true},
 user_id:{type:DataTypes.BIGINT,allowNull:false},
 created_at:{type:DataTypes.DATE,allowNull:false}
},{tableName:'android_sessions',timestamps:false});
