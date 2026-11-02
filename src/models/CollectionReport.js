import {DataTypes} from 'sequelize';
import db from '../utils/connection.js';import {collectionFields} from '../migrations/012-standby-collections.js';export default db.define('CollectionReport',{...collectionFields,revision:DataTypes.INTEGER},{tableName:'collection_reports',timestamps:false});
