import {
  Attachment,
  path,
  uploadDir,
  wrap,
  fail,
  audit,
  tripAccess,
} from "../services/shared.service.js";
export const downloadFile = wrap(async (req, res) => {
  let f = await Attachment.findOne({
    where: { id: req.params.id, deleted_at: null },
  });
  if (!f) fail(404, "Archivo no disponible");
  await tripAccess(req, f.trip_id);
  await audit(req.user, "descargar_archivo", { file_id: f.id });
  res.type(f.mime);
  res.setHeader("Content-Disposition", "attachment");
  res.sendFile(path.join(uploadDir, f.stored_name));
});
