import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("User", schema001.users, {
  tableName: "users",
  timestamps: false,
  freezeTableName: true,
});
