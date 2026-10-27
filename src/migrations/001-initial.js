import { Op } from "sequelize";
import { schema001 } from "./schema001.js";
export const name = "001-initial";
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  // Never silently adopt tables created by the legacy SQL version.
  const existing = (await qi.showAllTables()).map((x) =>
    typeof x === "string" ? x : x.tableName,
  );
  const conflicts = Object.keys(schema001).filter((n) => existing.includes(n));
  if (conflicts.length)
    throw new Error(
      "Existen tablas GUAYACA sin registro de migración: " +
        conflicts.join(", ") +
        ". No se modificó la base. Use una base vacía o prepare una migración de datos.",
    );
  await sequelize.transaction(async (transaction) => {
    for (const [table, attributes] of Object.entries(schema001))
      await qi.createTable(table, attributes, { transaction });
    for (const [table, field, values] of [
      ["users", "role", ["admin", "conductor", "usuario"]],
      ["trips", "status", ["creado", "en_curso", "finalizado", "cancelado"]],
      ["expenses", "type", ["combustible", "peaje"]],
    ])
      await qi.addConstraint(table, {
        fields: [field],
        type: "check",
        where: { [field]: values },
        name: `ck_${table}_${field}`,
        transaction,
      });
    for (const [table, field] of [
      ["trips", "amount"],
      ["events", "odometer"],
      ["expenses", "amount"],
    ])
      await qi.addConstraint(table, {
        fields: [field],
        type: "check",
        where: { [field]: { [Op.gte]: 0 } },
        name: `ck_${table}_${field}`,
        transaction,
      });
    await qi.addIndex("events", ["trip_id", "id"], {
      name: "idx_events_trip",
      transaction,
    });
    await qi.addIndex("audit", ["created_at"], {
      name: "idx_audit_time",
      transaction,
    });
    await qi.addIndex("files", ["created_at"], {
      name: "idx_files_date",
      transaction,
    });
  });
}
// Deliberately irreversible: do not drop production data.
export async function down() {
  throw new Error(
    "La migración inicial no se revierte automáticamente; restaure un respaldo.",
  );
}
