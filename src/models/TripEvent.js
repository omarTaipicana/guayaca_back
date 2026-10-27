import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("TripEvent", schema001.events, {
  tableName: "events",
  timestamps: false,
  freezeTableName: true,
});
