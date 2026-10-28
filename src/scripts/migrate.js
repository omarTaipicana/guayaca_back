import * as gpsStops from '../migrations/009-gps-stops.js';
import * as tripQuotes from '../migrations/008-trip-quotes.js';
import * as maintenanceAlerts from '../migrations/007-maintenance-alerts.js';
import * as maintenanceHistory from '../migrations/006-maintenance-history.js';
import * as clientsPlaces from '../migrations/005-clients-places.js';
import * as zoneRates from '../migrations/004-zone-rates.js';
import "dotenv/config";
import { Umzug, SequelizeStorage } from "umzug";
import sequelize from "../utils/connection.js";
import * as initial from "../migrations/001-initial.js";
import * as vehicleDetails from "../migrations/002-vehicle-details.js";
import * as userProfile from "../migrations/003-user-profile.js";
const migrator = new Umzug({
  migrations: [initial, vehicleDetails, userProfile, zoneRates, clientsPlaces, maintenanceHistory, maintenanceAlerts, tripQuotes, gpsStops],
  context: sequelize,
  storage: new SequelizeStorage({ sequelize, tableName: "guayaca_migrations" }),
  logger: console,
});
try {
  await sequelize.authenticate();
  const tables = (await sequelize.getQueryInterface().showAllTables()).map(
    (x) => (typeof x === "string" ? x : x.tableName),
  );
  if (!tables.includes("guayaca_migrations")) {
    const legacy = [
      "users",
      "challenges",
      "audit",
      "vehicles",
      "trips",
      "events",
      "expenses",
      "files",
    ].filter((x) => tables.includes(x));
    if (legacy.length)
      throw new Error(
        "La base contiene tablas previas sin control de migraciones: " +
          legacy.join(", ") +
          ". No se aplicaron cambios. Use una base vacía o prepare una migración de datos.",
      );
  }
  const applied = await migrator.up();
  console.log(
    applied.length
      ? "Migraciones aplicadas correctamente."
      : "No hay migraciones pendientes.",
  );
} catch (err) {
  console.error("No se pudieron aplicar migraciones:", err.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
