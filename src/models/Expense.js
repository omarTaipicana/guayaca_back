import {DataTypes} from 'sequelize';
import sequelize from "../utils/connection.js";
import { schema001 } from "../migrations/schema001.js";
export default sequelize.define("Expense", {...schema001.expenses,odometer:DataTypes.DECIMAL(12,1)}, {
  tableName: "expenses",
  timestamps: false,
  freezeTableName: true,
});
