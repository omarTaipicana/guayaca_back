import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Attachment", schema001.files, {
  tableName: "files",
  timestamps: false,
  freezeTableName: true,
});
