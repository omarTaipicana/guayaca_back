import {
  os,
  fs,
  path,
  Attachment,
  uploadDir,
  wrap,
  fail,
  audit,
} from "../services/shared.service.js";
export const storageGet = wrap(async (req, res) => {
  let stat = await fs.statfs(uploadDir),
    files = await Attachment.findAll({
      where: { deleted_at: null },
      attributes: [
        "id",
        "trip_id",
        "category",
        "original_name",
        "bytes",
        "created_at",
      ],
      order: [["created_at", "ASC"]],
      limit: 500,
    });
  let bytes =
      (await Attachment.sum("bytes", { where: { deleted_at: null } })) || 0,
    count = await Attachment.count({ where: { deleted_at: null } });
  res.json({
    system: {
      ramTotal: os.totalmem(),
      ramFree: os.freemem(),
      load: os.loadavg(),
      uptime: os.uptime(),
    },
    total: Number(stat.blocks) * Number(stat.bsize),
    free: Number(stat.bavail) * Number(stat.bsize),
    used: (Number(stat.blocks) - Number(stat.bfree)) * Number(stat.bsize),
    attachments: { bytes, count },
    files,
  });
});
export const storageDelete = wrap(async (req, res) => {
  let ids = req.body.ids;
  if (
    req.body.confirm !== "ELIMINAR" ||
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => !/^\d+$/.test(String(id)))
  )
    fail(400, "Seleccione hasta 100 archivos y escriba ELIMINAR");
  let deleted = [],
    errors = [];
  for (const id of [...new Set(ids)]) {
    let f = await Attachment.findOne({ where: { id, deleted_at: null } });
    if (!f) {
      errors.push({ id, error: "No disponible" });
      continue;
    }
    try {
      await fs.unlink(path.join(uploadDir, f.stored_name));
      await f.update({ deleted_at: new Date() });
      deleted.push(id);
    } catch (e) {
      errors.push({ id, error: "No se pudo eliminar" });
    }
  }
  await audit(req.user, "eliminar_archivos", {
    ids: deleted,
    errors: errors.length,
  });
  res.json({ deleted, errors });
});
