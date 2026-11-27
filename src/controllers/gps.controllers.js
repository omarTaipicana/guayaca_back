import { acceptDocuments, keepSavedFields, notifyTripConflict } from '../services/tripConflict.service.js';
import { hash } from '../services/tripControl.service.js';
import {operationTransaction} from '../services/operationTransaction.service.js';
import {inboxRows} from '../services/notificationInbox.service.js';
import {accrueTrip} from '../services/standby.service.js';
import {documented,stopClock,history,finishTrip,clearStopNotices,remindStop} from '../services/tripStop.service.js';
import {Op} from 'sequelize';import db from '../utils/connection.js';import Trip from '../models/Trip.js';import Stop from '../models/TripStop.js';import Sample from '../models/GpsSample.js';import Operational from '../models/OperationalNotification.js';import Notification from '../models/Notification.js';import Attachment from '../models/Attachment.js';import Audit from '../models/Audit.js';import {wrap,fail,validateId} from '../services/catalog.service.js';import {tripAccess} from '../services/shared.service.js';import {recordMileage,dispatchAlerts,km} from '../services/maintenanceAlert.service.js';import {storeDocuments,removeDocument} from '../services/document.service.js';
import {gpsCandidate,MAX_ROUTE_ACCURACY} from '../services/gpsRouting.js';
export {distance} from '../services/gpsRouting.js';
async function ensureStops(t,transaction){if(!t.metadata?.origin_place||!t.metadata?.destination_places?.length)fail('Este viaje no tiene lugares georreferenciados. Usa un viaje nuevo.');for(const [position,place] of [t.metadata.origin_place,...t.metadata.destination_places].entries())await Stop.findOrCreate({where:{trip_id:t.id,position},defaults:{place},transaction});return Stop.findAll({where:{trip_id:t.id},order:[['position','ASC']],transaction});}
export const gpsPost=wrap(async(req,res)=>{
 validateId(req.params.id);const b=req.body||{},lat=Number(b.latitude),lng=Number(b.longitude),accuracy=Number(b.accuracy),at=new Date(b.timestamp),route_point=b.route_point!==false;
 if(b.latitude==null||b.longitude==null||b.accuracy==null||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(at.getTime())||(!req.simulation&&!req.sync&&(Date.now()-at>120000||at-Date.now()>30000)))fail('Coordenada, precisión o fecha GPS inválida o antigua');
 const result=await operationTransaction(req,async transaction=>{
  const t=await Trip.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE});
  if(req.simulation&&!t?.is_test)fail('Simulación no autorizada',403);
  if(!t||String(t.driver_id)!==String(req.user.id))fail('Solo el conductor asignado puede enviar su GPS',403);
  if(t.status==='finalizado'&&req.sync){if(t.closed_at&&at<=new Date(t.closed_at)){await Sample.findOrCreate({where:{trip_id:t.id,device_at:at},defaults:{latitude:lat,longitude:lng,accuracy,route_point},transaction});return {accepted:true,historical_only:true,status:t.status,route_complete:true};}return {accepted:false,ignored_after_close:true,status:t.status,route_complete:true};}if(['finalizado','cancelado'].includes(t.status))fail('Viaje cerrado');
  const stops=await ensureStops(t,transaction);
  if(accuracy>MAX_ROUTE_ACCURACY)fail(`Precisión GPS insuficiente (${Math.round(accuracy)} m). Se necesita ${MAX_ROUTE_ACCURACY} m o mejor; espera señal al aire libre.`);
  const last=await Sample.findOne({where:{trip_id:t.id},order:[['device_at','DESC']],transaction});
  if(last&&at<=new Date(last.device_at)){if(req.sync){await Sample.findOrCreate({where:{trip_id:t.id,device_at:at},defaults:{latitude:lat,longitude:lng,accuracy,route_point},transaction});return {accepted:true,historical_only:true,reason:'Coordenada conservada; no se retroceden transiciones ya detectadas',status:t.status};}return {accepted:false,reason:'Lectura ya recibida o fuera de orden'};}
  if (t.metadata?.manual_recorded_at && !t.metadata.driver_started_at) {
   const latestManualEvent = Math.max(t.started_at ? +new Date(t.started_at) : 0,
    ...stops.flatMap(stop => [stop.arrived_at, stop.departed_at, stop.received_at].filter(Boolean).map(value => +new Date(value))));
   if (+at < latestManualEvent) {
    await Sample.create({trip_id:t.id,latitude:lat,longitude:lng,accuracy,device_at:at,route_point},{transaction});
    return {accepted:true,historical_only:true,status:t.status,reason:'Lectura anterior al último movimiento administrativo'};
   }
  }
  await Sample.create({trip_id:t.id,latitude:lat,longitude:lng,accuracy,device_at:at,route_point},{transaction});
  const startValues = t.status === 'creado' ? { status: 'en_curso', started_at: at } : {};
  if (!t.metadata?.driver_started_at) {
   startValues.metadata = { ...t.metadata, driver_started_at: at.toISOString() };
  }
  if (Object.keys(startValues).length) await t.update(startValues,{transaction});
  let transition=null;
  const candidate=gpsCandidate(stops,b);
  const reset={candidate_type:null,candidate_at:null,candidate_count:0};
  for(const s of stops)if(s.candidate_type&&(s!==candidate?.stop||last&&at-new Date(last.device_at)>90000))await s.update(reset,{transaction});
  if(candidate){
   const {stop,kind,d}=candidate;
   if(stop.candidate_type!==kind||!stop.candidate_at)await stop.update({candidate_type:kind,candidate_at:at,candidate_count:1},{transaction});
   else{
    await stop.update({candidate_count:stop.candidate_count+1},{transaction});
    if(at-new Date(stop.candidate_at)>=20000&&stop.candidate_count>=2){
     const detected=stop.candidate_at,values={candidate_type:null,candidate_at:null,candidate_count:0};
     if(kind==='arrival')values.arrived_at=detected;
     if(kind==='return')Object.assign(values,{outside_at:null,exit_state:null,exit_reason:null,exit_history:history(stop,'return',detected)});
     if(kind==='departure'){
      const final=stop.position===0||(documented(stop)&&stop.exception_resolved!==false);
      Object.assign(values,{outside_at:detected,exit_state:final?(['partial','rejected','failed'].includes(stop.outcome)?'incident':'delivered'):'pending',exit_history:history(stop,'exit',detected,{documented:documented(stop)}),...(final?{departed_at:detected}:{})});
     }
     await stop.update(values,{transaction});
     if(kind==='return')await clearStopNotices(t,stop,transaction);
     if(kind==='departure')await remindStop(t,stop,transaction,{force:true,at});
     await Audit.create({user_id:req.user.id,action:'gps.'+kind,details:{trip_id:t.id,stop_id:stop.id,at:detected,accuracy,distance_m:Math.round(d)}},{transaction});
     transition={phase:kind,stop_id:stop.id,name:stop.place.name};
    }
   }
  }
  if(t.is_test)await t.update({test_clock:at},{transaction});
  await accrueTrip(t,transaction,t.is_test?at:new Date());await finishTrip(t,stops,transaction);
  return {accepted:true,transition,status:t.status,route_complete:stops.every(s=>s.departed_at)};
 });res.json(result);
});
export const gpsState=wrap(async(req,res)=>{
 const t=await tripAccess(req,req.params.id);const stops=await Stop.findAll({where:{trip_id:t.id},order:[['position','ASC']]});
 const [samples]=await db.query(`SELECT latitude,longitude,accuracy,device_at,total_samples FROM (SELECT latitude,longitude,accuracy,device_at,ROW_NUMBER() OVER (ORDER BY device_at,id) AS rn,COUNT(*) OVER () AS total_samples FROM gps_samples WHERE trip_id=:id AND route_point=true) s WHERE rn=1 OR rn=total_samples OR MOD(rn-1,CAST(CEIL(total_samples/2000.0) AS bigint))=0 ORDER BY device_at`,{replacements:{id:t.id}});
 const documents=await Attachment.findAll({where:{trip_id:t.id,deleted_at:null},attributes:['id','original_name','mime']});
 const last_observed_at=await Sample.max('device_at',{where:{trip_id:t.id}});
 res.json({last_observed_at,stops:stops.map(s=>({...s.toJSON(),document_files:(s.arrival_file_ids?.length?s.arrival_file_ids:[s.arrival_file_id].filter(Boolean)).map(id=>documents.find(f=>String(f.id)===String(id))).filter(Boolean)})),samples,sample_count:Number(samples[0]?.total_samples||0),status:t.status});
});
export const completeStop = wrap(async (req, res) => {
  validateId(req.params.id);
  validateId(req.params.stop);
  const trip = await tripAccess(req, req.params.id);
  if (req.body.phase && req.body.phase !== 'arrival') fail('Registra el documento desde la llegada.');
  const odometer = km(req.body.odometer);
  const documents = await storeDocuments(req);
  const cleanup = () => Promise.all(documents.map(removeDocument));
  if (req.sync) req.sync.cleanup = cleanup;
  let persisted = false;
  try {
    const result = await operationTransaction(req, async transaction => {
      const locked = await Trip.findByPk(trip.id, { transaction, lock: transaction.LOCK.UPDATE });
      const stop = await Stop.findOne({ where: { id: req.params.stop, trip_id: trip.id }, transaction });
      if (!stop?.arrived_at) fail('Todavía no hay detección GPS de llegada', req.sync ? 409 : 400);
      const conflicts = [];
      const values = keepSavedFields(stop, { arrival_odometer: odometer }, conflicts);
      const documentsSaved = await acceptDocuments(stop, documents, conflicts, transaction);
      const closed = ['finalizado', 'cancelado'].includes(locked.status);
      if (closed && (locked.status === 'cancelado' || Object.keys(values).length || documentsSaved)) fail('Viaje cerrado');
      if (conflicts.length) {
        const operation = req.sync?.id ?? hash([odometer, (req.files ?? [req.file]).map(file => hash(file.buffer.toString('base64')))]);
        await notifyTripConflict(locked, stop, conflicts, 'Registro del conductor', operation, transaction);
      }
      const hasMileage = values.arrival_odometer != null;
      if (!hasMileage && !documentsSaved) return { ...stop.toJSON(), documents_saved: false };
      if (req.sync && new Date(req.sync.captured_at) < new Date(stop.arrived_at) - 120000) {
        fail('El registro del documento es anterior a la llegada GPS; revisa el punto y la hora con el administrador', 409);
      }
      const stops = await Stop.findAll({ where: { trip_id: trip.id }, order: [['position', 'ASC']], transaction });
      const chronological = stops.filter(row => row.arrived_at)
        .sort((a, b) => new Date(a.arrived_at) - new Date(b.arrived_at) || a.position - b.position);
      if (hasMileage) {
        const readings = chronological.flatMap(row => [
          String(row.id) === String(stop.id) ? odometer : row.arrival_odometer, row.departure_odometer,
        ]).filter(value => value != null).map(Number);
        if (readings.some((value, index) => index > 0 && value < readings[index - 1])) {
          fail('El kilometraje no es coherente con los otros puntos registrados del viaje');
        }
      }
      if (documentsSaved) {
        const files = await Attachment.bulkCreate(documents.map(document => ({
          ...document, trip_id: trip.id, category: stop.position === 0 ? 'guia' : 'entrega',
        })), { transaction });
        values.arrival_file_id = files[0].id;
        values.arrival_file_ids = files.map(file => String(file.id));
      }
      const at = stopClock(locked, req);
      const incident = ['partial', 'rejected', 'failed'].includes(stop.outcome);
      if (stop.position > 0 && !incident) {
        if (stop.outcome === 'pending') values.outcome = 'delivered';
        const leaving = stop.outside_at && stop.exit_state !== 'waiting';
        const departure = stop.departed_at ?? (leaving ? stop.outside_at : stop.outside_at && at);
        if (!stop.received_at) {
          const observed = req.sync ? Math.max(+new Date(stop.arrived_at), Math.min(+at, departure ? +new Date(departure) : Infinity)) : +(leaving ? new Date(stop.outside_at) : at);
          values.received_at = new Date(Math.min(observed, departure ? +new Date(departure) : Infinity));
        }
        if (!stop.departed_at && departure) {
          values.departed_at = departure;
          values.exit_state = 'delivered';
          values.exit_history = history(stop, 'documented_after_exit', at, { user_id: req.user.id });
        }
      }
      await stop.update(values, { transaction });
      await accrueTrip(locked, transaction, at);
      if (hasMileage && !trip.is_test) await recordMileage(trip.vehicle_id, odometer, null, transaction);
      if (!['pending', 'review'].includes(stop.exit_state)) await clearStopNotices(locked, stop, transaction);
      await Audit.create({ user_id: req.user.id, action: 'gps.documentado', details: {
        trip_id: trip.id, stop_id: stop.id, phase: 'arrival', odometer: stop.arrival_odometer,
        file_id: stop.arrival_file_id, file_ids: stop.arrival_file_ids,
      } }, { transaction });
      await finishTrip(locked, stops.map(row => String(row.id) === String(stop.id) ? stop : row), transaction);
      return { ...stop.toJSON(), documents_saved: documentsSaved, mileage_saved: hasMileage };
    });
    persisted = !req.sync?.replayed && result.documents_saved;
    if (!trip.is_test && !req.sync?.replayed && result.mileage_saved) {
      await dispatchAlerts(trip.vehicle_id).catch(error => console.error('Alerta de mantenimiento:', error.message));
    }
    res.json(result);
  } finally {
    if (!persisted) await cleanup();
  }
});
export const resolveExit=wrap(async(req,res)=>{
 validateId(req.params.id);validateId(req.params.stop);await tripAccess(req,req.params.id);
 const choice=req.body.choice,reason=String(req.body.reason||'').trim();
 if(!['delivered','waiting','review','incident'].includes(choice))fail('Selecciona si entregaste, sigues esperando o existe otra novedad');
 if(reason.length>1000||(['waiting','review'].includes(choice)&&reason.length<3))fail('Indica el motivo, máximo 1000 caracteres');
 const result=await operationTransaction(req,async transaction=>{
  const t=await Trip.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE});if(t.status==='cancelado')fail('Viaje cerrado');
  const s=await Stop.findOne({where:{id:req.params.stop,trip_id:t.id},transaction,lock:transaction.LOCK.UPDATE});
  if(!s||s.position===0)fail('Punto de entrega no encontrado');
  if(s.departed_at){
   if(s.exit_state!==choice)await notifyTripConflict(t,s,['exit_state'],'Registro del conductor',req.sync?.id??choice,transaction);
   return s;
  }if(t.status==='finalizado')fail('Viaje cerrado');if(!s.outside_at)fail('Todavía no hay detección GPS de salida',req.sync?409:400);
  if(choice==='incident'&&!['partial','rejected','failed'].includes(s.outcome))fail('Primero registra la incidencia de entrega');if(choice==='delivered'&&['partial','rejected','failed'].includes(s.outcome))fail('Esta entrega tiene una incidencia; selecciona salida con incidencia registrada');if(s.exit_state===choice)fail('Esta respuesta ya fue registrada');
  const at=stopClock(t,req),completedAt=s.exit_state==='waiting'?at:s.outside_at;await s.update({exit_state:choice,...(choice==='waiting'?{waiting_confirmed_at:at}:{}),exit_reason:reason||null,exit_history:history(s,'decision',at,{choice,reason,user_id:req.user.id}),...(choice==='delivered'?{received_at:s.received_at||completedAt,departed_at:completedAt}:choice==='incident'?{departed_at:completedAt}:{})},{transaction});
  await clearStopNotices(t,s,transaction);await remindStop(t,s,transaction,{force:true,at});await accrueTrip(t,transaction,at);
  await Audit.create({user_id:req.user.id,action:'gps.salida_confirmada',details:{trip_id:t.id,stop_id:s.id,choice,reason,physical_exit_at:s.outside_at}},{transaction});
  await finishTrip(t,await Stop.findAll({where:{trip_id:t.id},order:[['position','ASC']],transaction}),transaction);return s;
 });res.json(result);
});
export const inboxGet=wrap(async(req,res)=>res.json(await inboxRows(req.user,req.query?.folder||'inbox')));
export const inboxRead=wrap(async(req,res)=>{validateId(req.params.id);const n=await Operational.findOne({where:{id:req.params.id,user_id:req.user.id,deleted_at:null}});if(!n)fail('Notificación no encontrada',404);await n.update({read_at:new Date()});res.json({ok:true});});
// Lightweight selection for automatic tracking; no route geometry, expenses or GPS samples.
export const gpsSession=wrap(async(req,res)=>{
 const trips=await Trip.findAll({where:{driver_id:req.user.id,is_test:false,status:{[Op.in]:['creado','en_curso']}},attributes:['id','code','status','metadata'],order:[['id','DESC']]});
 const stops=trips.length?await Stop.findAll({where:{trip_id:{[Op.in]:trips.map(t=>t.id)}},attributes:['trip_id','departed_at']}):[];
 res.json(trips.filter(t=>t.metadata?.origin_place&&t.metadata?.destination_places?.length).filter(t=>{const ss=stops.filter(s=>String(s.trip_id)===String(t.id));return !ss.length||!ss.every(s=>s.departed_at)}).map(t=>({id:t.id,code:t.code,status:t.status})));
});
