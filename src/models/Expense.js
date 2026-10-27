import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Expense", schema001.expenses, {
  tableName: "expenses",
  timestamps: false,
  freezeTableName: true,
});
