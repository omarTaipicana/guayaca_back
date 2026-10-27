import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Challenge", schema001.challenges, {
  tableName: "challenges",
  timestamps: false,
  freezeTableName: true,
});
