import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Vehicle", schema001.vehicles, {
  tableName: "vehicles",
  timestamps: false,
  freezeTableName: true,
});
