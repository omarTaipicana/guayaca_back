import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Audit", schema001.audit, {
  tableName: "audit",
  timestamps: false,
  freezeTableName: true,
});
