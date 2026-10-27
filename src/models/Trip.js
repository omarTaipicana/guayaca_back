import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Trip", schema001.trips, {
  tableName: "trips",
  timestamps: false,
  freezeTableName: true,
});
