import {DataTypes} from 'sequelize';
import db from '../utils/connection.js';
import {clientFields} from '../migrations/005-clients-places.js';
export default db.define('Client',{...clientFields,deleted_at:DataTypes.DATE},{tableName:'clients',timestamps:false,defaultScope:{where:{deleted_at:null}},freezeTableName:true});
