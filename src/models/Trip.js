import {DataTypes} from 'sequelize';
import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Trip", {...schema001.trips,tonnage:DataTypes.DECIMAL(10,3),deleted_at:DataTypes.DATE,metadata:{type:DataTypes.JSONB,allowNull:false,defaultValue:{}}}, {
  tableName: "trips",
  timestamps: false,defaultScope:{where:{deleted_at:null}},
  freezeTableName: true,
});
