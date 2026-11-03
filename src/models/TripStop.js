import {multipleDocumentFields} from '../migrations/019-multiple-stop-documents.js';
import {controlStopFields} from '../migrations/017-trip-control.js';
import {singleStopFields} from '../migrations/015-single-stop-document.js';
import {DataTypes} from 'sequelize';
import db from '../utils/connection.js';import {stopFields} from '../migrations/009-gps-stops.js';export default db.define('TripStop',{...stopFields,...singleStopFields,...controlStopFields,...multipleDocumentFields,received_at:DataTypes.DATE},{tableName:'trip_stops',timestamps:false,freezeTableName:true});