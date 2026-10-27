import "dotenv/config";
import { Sequelize } from "sequelize";
if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL en .env");
const options = {
  dialect: "postgres",
  logging: false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
};
if (process.env.DB_SSL === "true")
  options.dialectOptions = { ssl: { require: true, rejectUnauthorized: true } };
export const sequelize = new Sequelize(process.env.DATABASE_URL, options);
export const db = sequelize;
export default sequelize;
