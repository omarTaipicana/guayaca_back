import {
  sequelize,
  User,
  Vehicle,
  Trip,
  TripEvent,
  Expense,
  Attachment,
  crypto,
  path,
  fs,
  sharp,
  wrap,
  fail,
  audit,
  tripAccess,
  uploadDir,
} from "../services/shared.service.js";
export const tripsGet = wrap(async (req, res) => {
  let where = req.user.role === "admin" ? {} : { driver_id: req.user.id };
  let trips = await Trip.findAll({
    where,
    include: [
      { model: User, as: "driverUser", attributes: ["name", "last_name"] },
      { model: Vehicle, as: "vehicle", attributes: ["plate"] },
      { model: Expense, as: "expenses", attributes: ["amount"] },
    ],
    order: [["id", "DESC"]],
    limit: 300,
  });
  res.json(
    trips.map((t) => {
      let x = t.get({ plain: true });
      let sum = x.expenses.reduce((n, e) => n + Number(e.amount), 0);
      delete x.driverUser;
      delete x.vehicle;
      delete x.expenses;
      return {
        ...x,
        driver: [t.driverUser?.name, t.driverUser?.last_name].filter(Boolean).join(" "),
        plate: t.vehicle?.plate,
        expenses: sum.toFixed(2),
      };
    }),
  );
});
export const tripsPost = wrap(async (req, res) => {
  let {
    driver_id,
    vehicle_id,
    client = "",
    origin = "",
    destination = "",
    amount = 0,
  } = req.body;
  if (
    !driver_id ||
    !vehicle_id ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) < 0
  )
    fail(400, "Datos de viaje inválidos");
  let u = await User.findOne({ where: { id: driver_id, active: true } }),
    v = await Vehicle.findOne({ where: { id: vehicle_id, active: true } });
  if (!u || !v) fail(400, "Conductor o vehículo inválido");
  let t = await sequelize.transaction(async (transaction) => {
    let x = await Trip.create(
      { driver_id, vehicle_id, client, origin, destination, amount },
      { transaction },
    );
    await x.update(
      { code: "V-" + String(x.id).padStart(5, "0") },
      { transaction },
    );
    return x;
  });
  await audit(req.user, "crear_viaje", { trip_id: t.id });
  res.json(t);
});
export const tripGet = wrap(async (req, res) => {
  let t = await tripAccess(req, req.params.id);
  let events = await TripEvent.findAll({
    where: { trip_id: t.id },
    order: [["id", "ASC"]],
  });
  let expenses = await Expense.findAll({
    where: { trip_id: t.id },
    order: [["id", "ASC"]],
  });
  let files = await Attachment.findAll({
    where: { trip_id: t.id },
    attributes: [
      "id",
      "trip_id",
      "event_id",
      "expense_id",
      "category",
      "original_name",
      "mime",
      "bytes",
      "created_at",
      "deleted_at",
    ],
    order: [["id", "ASC"]],
  });
  res.json({ trip: t, events, expenses, files });
});
export const eventPost = wrap(async (req, res) => {
  await tripAccess(req, req.params.id);
  let { type, odometer, latitude, longitude, accuracy, notes = "" } = req.body;
  const types = [
    "salida_domicilio",
    "llegada_carga",
    "salida_carga",
    "llegada_destino",
    "entrega",
  ];
  if (
    !types.includes(type) ||
    odometer === "" ||
    odometer == null ||
    !Number.isFinite(Number(odometer)) ||
    Number(odometer) < 0
  )
    fail(400, "Evento o kilometraje inválido");
  let has = latitude != null && longitude != null;
  if (
    has &&
    (!Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude)) ||
      Math.abs(Number(latitude)) > 90 ||
      Math.abs(Number(longitude)) > 180)
  )
    fail(400, "Ubicación inválida");
  let event = await sequelize.transaction(async (transaction) => {
    let t = await Trip.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!t) fail(404, "Viaje no encontrado");
    if (["finalizado", "cancelado"].includes(t.status))
      fail(400, "Viaje cerrado");
    if (t.status === "creado" && type !== "salida_domicilio")
      fail(400, "Primero registre la salida del domicilio");
    if (t.status === "en_curso" && type === "salida_domicilio")
      fail(400, "El viaje ya inició");
    let last = await TripEvent.findOne({
      where: { trip_id: t.id },
      order: [["id", "DESC"]],
      transaction,
    });
    if (last && Number(odometer) < Number(last.odometer))
      fail(400, "El kilometraje no puede ser menor al anterior");
    let e = await TripEvent.create(
      {
        trip_id: t.id,
        type,
        odometer,
        latitude: has ? latitude : null,
        longitude: has ? longitude : null,
        accuracy: has && Number.isFinite(Number(accuracy)) ? accuracy : null,
        location_status: has ? "disponible" : "no_disponible",
        notes: String(notes),
      },
      { transaction },
    );
    if (type === "salida_domicilio")
      await t.update(
        { status: "en_curso", started_at: new Date() },
        { transaction },
      );
    if (type === "entrega")
      await t.update(
        { status: "finalizado", closed_at: new Date() },
        { transaction },
      );
    return e;
  });
  await audit(req.user, "registrar_evento", {
    trip_id: req.params.id,
    event_id: event.id,
    type,
  });
  res.json(event);
});
export const expensePost = wrap(async (req, res) => {
  let t = await tripAccess(req, req.params.id);
  let { type, amount, notes = "" } = req.body;
  if (
    !["combustible", "peaje"].includes(type) ||
    amount === "" ||
    amount == null ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) < 0
  )
    fail(400, "Gasto inválido");
  let e = await Expense.create({ trip_id: t.id, type, amount, notes });
  await audit(req.user, "registrar_gasto", { trip_id: t.id, expense_id: e.id });
  res.json(e);
});
export const filePost = wrap(async (req, res) => {
  let t = await tripAccess(req, req.params.id),
    f = req.file;
  if (!f) fail(400, "Seleccione archivo");
  let category = req.body.category;
  if (!["guia", "entrega", "combustible", "peaje", "otro"].includes(category))
    fail(400, "Categoría inválida");
  let id = req.body.event_id || null,
    eid = req.body.expense_id || null;
  if (id && !(await TripEvent.findOne({ where: { id, trip_id: t.id } })))
    fail(400, "Evento inválido");
  if (eid && !(await Expense.findOne({ where: { id: eid, trip_id: t.id } })))
    fail(400, "Gasto inválido");
  let buffer = f.buffer,
    mime,
    ext;
  if (buffer.subarray(0, 5).toString() === "%PDF-") {
    mime = "application/pdf";
    ext = ".pdf";
  } else {
    try {
      let image = sharp(buffer, { limitInputPixels: 40000000 });
      let meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format))
        fail(400, "Formato de imagen no admitido");
      buffer = await image
        .rotate()
        .resize({
          width: 2200,
          height: 2200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      mime = "image/jpeg";
      ext = ".jpg";
    } catch (e) {
      if (e.status) throw e;
      fail(400, "Imagen inválida");
    }
  }
  let name = crypto.randomUUID() + ext;
  await fs.writeFile(path.join(uploadDir, name), buffer, { flag: "wx" });
  let file;
  try {
    file = await Attachment.create({
      trip_id: t.id,
      event_id: id,
      expense_id: eid,
      category,
      stored_name: name,
      original_name: path.basename(f.originalname),
      mime,
      bytes: buffer.length,
    });
  } catch (e) {
    await fs.unlink(path.join(uploadDir, name)).catch(() => {});
    throw e;
  }
  await audit(req.user, "subir_archivo", { trip_id: t.id, file_id: file.id });
  res.json({ id: file.id });
});
