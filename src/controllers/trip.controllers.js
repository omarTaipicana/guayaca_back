import {storeDocument,removeDocument} from '../services/document.service.js';
import {Op} from 'sequelize';import Audit from '../models/Audit.js';
import Quote from '../models/TripQuote.js';import Delivery from '../models/TripDelivery.js';import Place from '../models/Place.js';import Category from '../models/TonnageCategory.js';import Rate from '../models/ZoneRate.js';
import {recordMileage,dispatchAlerts,km} from '../services/maintenanceAlert.service.js';
import Maintenance from '../models/Maintenance.js';
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
export const tripsPost=wrap(async(req,res)=>{const id=req.body?.quote_id;if(!/^[0-9a-f-]{36}$/i.test(id||''))fail(400,'Primero calcula la ruta y el valor del viaje');const trip=await sequelize.transaction(async transaction=>{const q=await Quote.findOne({where:{id,user_id:req.user.id},transaction,lock:transaction.LOCK.UPDATE});if(!q||q.used_at||new Date(q.expires_at)<=new Date())fail(400,'El cálculo venció o ya se utilizó. Vuelve a calcular.');const {driver_id,vehicle_id,tonnage,metadata}=q.payload;if(req.user.role!=='admin'&&String(driver_id)!==String(req.user.id))fail(403,'Conductor no autorizado');const driver=await User.findOne({where:{id:driver_id,active:true,setup_pending:false,role:'conductor'},transaction});if(!driver||!driver.permissions.includes('viajes'))fail(400,'Conductor no habilitado');const v=await Vehicle.findByPk(vehicle_id,{transaction,lock:transaction.LOCK.UPDATE});if(!v?.active||(v.capacity_tons!=null&&tonnage>Number(v.capacity_tons))||await Maintenance.count({where:{vehicle_id,closed_at:null},transaction})||await Trip.count({where:{vehicle_id,status:{[Op.in]:['creado','en_curso']}},transaction}))fail(409,'El vehículo ya no está disponible');for(const [index,point] of [metadata.origin_place,...metadata.destination_places].entries()){const current=await Place.findOne({where:{id:point.id,active:true},transaction});if(!current||Number(current.latitude)!==Number(point.latitude)||Number(current.longitude)!==Number(point.longitude)||current.type!==point.type)fail(409,'Un lugar cambió o dejó de estar habilitado. Recalcula el viaje.');}const rate=await Rate.findOne({where:{id:metadata.applied_rate.id,active:true},transaction});const category=await Category.findOne({where:{id:metadata.category.id,active:true},transaction});if(!rate||Number(rate.amount)!==Number(metadata.amount)||!category||tonnage<Number(category.min_tons)||(category.max_tons!=null&&tonnage>=Number(category.max_tons)))fail(409,'La tarifa o categoría cambió. Vuelve a calcular.');delete metadata.client;metadata.version=4;let x=await Trip.create({driver_id,vehicle_id,tonnage,client:'',origin:metadata.origin_place.name,destination:metadata.destination_places.map(p=>p.name).join(' → '),amount:metadata.amount,metadata},{transaction});await x.update({code:'V-'+String(x.id).padStart(5,'0')},{transaction});await q.update({used_at:new Date()},{transaction});await Audit.create({user_id:req.user.id,action:'crear_viaje',details:{trip_id:x.id,amount:x.amount,calculation:metadata.calculation}},{transaction});return x;});res.status(201).json(trip);});
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
  const deliveries=await Delivery.findAll({where:{trip_id:t.id},order:[['position','ASC']]});
  res.json({ trip: t, events, expenses, files,deliveries });
});
export const eventPost = wrap(async (req, res) => {
  const eventTrip=await tripAccess(req, req.params.id);if(eventTrip.metadata?.route)fail(409,'Las llegadas y salidas de este viaje se registran por GPS. Completa sus pendientes de kilometraje y guía.');
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
    const stops=t.metadata?.calculation==='farthest_road_destination'?t.metadata.destination_places:[];
    let destination_index=null;if(stops.length&&['llegada_destino','entrega'].includes(type)){destination_index=Number(req.body.destination_index);if(req.body.destination_index==null||req.body.destination_index===''||!Number.isInteger(destination_index)||destination_index<0||destination_index>=stops.length)fail(400,'Selecciona un destino de entrega');if(type==='entrega'&&await Delivery.count({where:{trip_id:t.id,position:destination_index},transaction}))fail(400,'Ese destino ya fue entregado');}
    let e = await TripEvent.create(
      {
        trip_id: t.id,
        type,
        odometer,
        latitude: has ? latitude : null,
        longitude: has ? longitude : null,
        accuracy: has && Number.isFinite(Number(accuracy)) ? accuracy : null,
        destination_index,
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
    if(type==='entrega'&&stops.length)await Delivery.create({trip_id:t.id,position:destination_index,event_id:e.id},{transaction});
    if (type === "entrega"&&(!stops.length||await Delivery.count({where:{trip_id:t.id},transaction})===stops.length))
      await t.update(
        { status: "finalizado", closed_at: new Date() },
        { transaction },
      );
    await recordMileage(t.vehicle_id,odometer,null,transaction);
    return e;
  });
  await audit(req.user, "registrar_evento", {
    trip_id: req.params.id,
    event_id: event.id,
    type,
  });
  await dispatchAlerts(eventTrip.vehicle_id);
  res.json(event);
});
export const expensePost=wrap(async(req,res)=>{const t=await tripAccess(req,req.params.id);const {type,amount,notes=''}=req.body;if(!['combustible','peaje'].includes(type)||amount===''||amount==null||!Number.isFinite(+amount)||+amount<0)fail(400,'Gasto inválido');const odometer=type==='combustible'?km(req.body.odometer):null;let document;try{document=await storeDocument(req.file,true);const result=await sequelize.transaction(async transaction=>{const expense=await Expense.create({trip_id:t.id,type,amount,notes,odometer},{transaction});const file=await Attachment.create({...document,trip_id:t.id,expense_id:expense.id,category:type},{transaction});if(odometer!==null)await recordMileage(t.vehicle_id,odometer,null,transaction);await Audit.create({user_id:req.user.id,action:'registrar_gasto',details:{trip_id:t.id,expense_id:expense.id,file_id:file.id}},{transaction});return {...expense.toJSON(),file_id:file.id};});if(odometer!==null)await dispatchAlerts(t.vehicle_id);res.json(result);}catch(e){if(document)await removeDocument(document);throw e;}});
export const filePost = wrap(async (req, res) => {
  let t = await tripAccess(req, req.params.id),
    f = req.file;
  if (!f) fail(400, "Seleccione archivo");
  const category=req.body.category||'guia';
  if(category!=='guia'||req.body.expense_id||req.body.event_id)fail(400,'Esta sección solo permite adjuntar guías. Sube los recibos desde el gasto y los documentos de cada punto desde sus pendientes.');
  const id=null,eid=null;
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
