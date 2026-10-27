import sequelize from "../utils/connection.js";
import User from "./User.js";
import Challenge from "./Challenge.js";
import Audit from "./Audit.js";
import Vehicle from "./Vehicle.js";
import Trip from "./Trip.js";
import TripEvent from "./TripEvent.js";
import Expense from "./Expense.js";
import Attachment from "./Attachment.js";
Trip.belongsTo(User, { as: "driverUser", foreignKey: "driver_id" });
Trip.belongsTo(Vehicle, { as: "vehicle", foreignKey: "vehicle_id" });
Trip.hasMany(TripEvent, { as: "events", foreignKey: "trip_id" });
Trip.hasMany(Expense, { as: "expenses", foreignKey: "trip_id" });
Trip.hasMany(Attachment, { as: "files", foreignKey: "trip_id" });
Audit.belongsTo(User, { as: "actor", foreignKey: "user_id" });
export {
  sequelize,
  User,
  Challenge,
  Audit,
  Vehicle,
  Trip,
  TripEvent,
  Expense,
  Attachment,
};
