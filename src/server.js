import "dotenv/config";
import sequelize from "./utils/connection.js";
async function main() {
  await sequelize.authenticate();
  let tables = await sequelize.getQueryInterface().showAllTables();
  if (
    !tables.some(
      (x) => (typeof x === "string" ? x : x.tableName) === "guayaca_migrations",
    )
  )
    throw Error(
      "Faltan migraciones. Ejecute npm run db:migrate antes de iniciar.",
    );
  const { DataTypes } = await import("sequelize");
  const Migration = sequelize.define(
    "Migration",
    { name: { type: DataTypes.STRING, primaryKey: true } },
    { tableName: "guayaca_migrations", timestamps: false },
  );
  if (!(await Migration.findByPk("003-user-profile")))
    throw Error("Faltan migraciones. Ejecute npm run db:migrate.");
  const { default: app } = await import("./app.js");
  const PORT = Number(process.env.PORT || 8088);
  app.listen(PORT, process.env.HOST || "127.0.0.1", () =>
    console.log(`GUAYACA API v0.2.4 puerto ${PORT}`),
  );
}
main().catch((e) => {
  console.error("No se pudo iniciar:", e.message);
  process.exitCode = 1;
});
