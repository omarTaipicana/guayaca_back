import {DataTypes} from 'sequelize';
import db from '../utils/connection.js';
import {placeFields} from '../migrations/005-clients-places.js';
export default db.define('Place',{...placeFields,deleted_at:DataTypes.DATE},{tableName:'places',timestamps:false,defaultScope:{where:{deleted_at:null}},freezeTableName:true});
