import { jwt, secret } from '../services/shared.service.js';
import { sendConfirmation, verifyConfirmation, consumeConfirmation } from '../services/confirmation.service.js';
import db from '../utils/connection.js';
import Trip from '../models/Trip.js';
import Stop from '../models/TripStop.js';
import Sample from '../models/GpsSample.js';
import Line from '../models/CollectionLine.js';
import Attachment from '../models/Attachment.js';
import Revision from '../models/TripControlRevision.js';
import { fail, validateId, wrap } from '../services/catalog.service.js';
import { removeDocument, storeDocuments } from '../services/document.service.js';
import { dispatchAlerts, km, recordMileage } from '../services/maintenanceAlert.service.js';
import { accrueTrip } from '../services/standby.service.js';
import { applyControl, controlState, ensurePlannedStops, hash, saveRevision, validateTimeline } from '../services/tripControl.service.js';
import { clearStopNotices, documented, finishTrip, history, manualPending } from '../services/tripStop.service.js';

import { acceptDocuments, conflictLabels, keepSavedFields, notifyTripConflict } from '../services/tripConflict.service.js';

const dateFields = ['arrived_at', 'departed_at', 'received_at'];

function points(trip) {
  const { origin_place, destination_places } = trip.metadata ?? {};
  return origin_place && destination_places?.length ? [origin_place, ...destination_places] : [];
}

async function driverStartedAt(trip, transaction) {
  if (trip.metadata?.manual_recorded_at || trip.metadata?.driver_started_at) {
    return trip.metadata.driver_started_at ?? null;
  }
  if (trip.status === 'creado') return null;
  return Sample.min('device_at', { where: { trip_id: trip.id }, transaction });
}

export const manualTripGet = wrap(async (req, res) => {
  validateId(req.params.id);
  const trip = await Trip.findByPk(req.params.id);
  if (!trip) fail('Viaje no encontrado', 404);
  const stops = await Stop.findAll({ where: { trip_id: trip.id }, order: [['position', 'ASC']] });
  res.json({
    status: trip.status,
    revision: trip.control_revision,
    started_at: trip.metadata?.manual_departure_at ?? trip.started_at ?? null,
    last_observed_at: await Sample.max('device_at', { where: { trip_id: trip.id } }),
    driver_started_at: await driverStartedAt(trip),
    stops: points(trip).map((place, position) => {
      const point = stops.find(stop => stop.position === position)?.toJSON() ?? { position, place };
      return { ...point, manual_pending: manualPending(point) };
    }),
  });
});

function dateValue(value, now) {
  const date = new Date(value);
  if (typeof value !== 'string' || !Number.isFinite(+date) || date.toISOString() !== value || date > now) {
    fail('Fecha inválida o posterior a la hora actual');
  }
  return value;
}

export const manualTripPost = wrap(async (req, res) => {
  validateId(req.params.id);
  const body = req.body ?? {};
  const { request_id } = body;
  const revision = Number(body.revision);
  const position = Number(body.position);
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(request_id ?? '') ||
      !/^\d+$/.test(body.revision ?? '') || !Number.isSafeInteger(revision) ||
      !/^\d+$/.test(body.position ?? '') || !Number.isSafeInteger(position)) fail('Datos del punto inválidos');

  const now = new Date();
  const incoming = {};
  const startedAt = body.started_at ? dateValue(body.started_at, now) : null;
  if (startedAt && position !== 0) fail('La salida del domicilio se registra desde el embarque');
  for (const field of dateFields) {
    if (body[field]) incoming[field] = dateValue(body[field], now);
  }
  for (const field of ['arrival_odometer', 'departure_odometer']) {
    if (body[field] !== undefined && body[field] !== '') {
      if (!['string', 'number'].includes(typeof body[field])) fail('Kilometraje inválido');
      incoming[field] = km(body[field]);
    }
  }
  const finalize = body.finalize === 'true';
  const files = req.files ?? [];
  if (finalize && (position !== 0 || Object.keys(incoming).length || startedAt || files.length)) fail('Solicitud de cierre inválida');
  if (!finalize && !Object.keys(incoming).length && !startedAt && !files.length) fail('Ingresa al menos un dato del punto');
  const requestHash = hash({
    position, patch: incoming, startedAt, ...(finalize ? { finalize } : {}),
    files: files.map(file => [file.originalname, hash(file.buffer.toString('base64'))]),
  });
  const documents = files.length ? await storeDocuments(req) : [];
  let result;
  try {
    result = await db.transaction(async transaction => {
      await db.query('SELECT pg_advisory_xact_lock(782135)', { transaction });
      const trip = await Trip.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!trip) fail('Viaje no encontrado', 404);
      const previous = await Revision.findOne({ where: { request_id }, transaction });
      if (previous) {
        if (String(previous.trip_id) !== String(trip.id) || String(previous.user_id) !== String(req.user.id) ||
            previous.action !== 'manual' || previous.request_hash !== requestHash) fail('Identificador de operación ya utilizado', 409);
        return { status: trip.status, revision: trip.control_revision, conflicts: previous.after?.manual_result?.conflicts ?? [], changed: previous.after?.manual_result?.changed ?? true };
      }
      if (!['creado', 'en_curso'].includes(trip.status)) fail('El viaje ya está cerrado', 409);
      if (!points(trip)[position]) fail('Punto no disponible para el registro manual');
      if (await Line.count({ where: { trip_id: trip.id, active: true }, transaction })) fail('El viaje está incluido en un corte activo', 409);

      const before = await controlState(trip, transaction);
      const stops = await ensurePlannedStops(trip, transaction);
      const stop = stops.find(row => row.position === position);
      const conflicts = [];
      const patch = keepSavedFields(stop, incoming, conflicts);
      const currentStart = trip.metadata?.manual_departure_at ?? trip.started_at;
      const departure = startedAt && keepSavedFields({ started_at: currentStart }, { started_at: startedAt }, conflicts).started_at;
      const documentsSaved = await acceptDocuments(stop, documents, conflicts, transaction);
      if (finalize && stops.some(point => manualPending(point).length)) fail('Completa los puntos pendientes antes de finalizar', 409);
      const changed = Boolean(finalize || Object.keys(patch).length || departure || documentsSaved);
      let alertVehicle = null;
      if (changed) {
        if (position === 0 && patch.received_at) fail('La recepción se registra en los puntos de entrega');
        if (position > 0 && patch.arrived_at && (!stops[0].departed_at || new Date(patch.arrived_at) < new Date(stops[0].departed_at))) {
          fail('La llegada al destino debe ser posterior a la salida del embarque');
        }
        const merged = stops.map(row => row === stop ? { ...row.toJSON(), ...patch } : row.toJSON());
        validateTimeline(merged, now);
        const visited = merged.filter(row => row.arrived_at)
          .sort((a, b) => new Date(a.arrived_at) - new Date(b.arrived_at) || a.position - b.position);
        if (visited.slice(0, -1).some(row => !row.departed_at)) fail('Registra la salida de cada punto anterior');
        const started = departure || trip.started_at || visited[0]?.arrived_at;
        if (departure && visited.length && new Date(departure) > new Date(visited[0].arrived_at)) {
          fail('La salida del domicilio no puede ser posterior a la llegada al embarque');
        }

        if (merged.some(row => row.departure_odometer != null && !row.departed_at)) {
          fail('Registra la hora de salida antes del kilometraje de salida');
        }
        const readings = visited.flatMap(row => [row.arrival_odometer, row.departure_odometer]).filter(value => value != null).map(Number);
        if (readings.some((value, index) => index && value < readings[index - 1])) {
          fail('El kilometraje no puede disminuir entre puntos, llegadas y salidas');
        }
        const values = { ...patch };
        if (documentsSaved) {
          const attachments = await Attachment.bulkCreate(documents.map(document => ({
            ...document, trip_id: trip.id, category: position === 0 ? 'guia' : 'entrega',
          })), { transaction });
          values.arrival_file_id = attachments[0].id;
          values.arrival_file_ids = attachments.map(attachment => String(attachment.id));
        }
        if (patch.departed_at) {
          const incident = ['partial', 'rejected', 'failed'].includes(stop.outcome);
          Object.assign(values, {
            outside_at: stop.outside_at ?? patch.departed_at,
            exit_state: incident ? 'incident' : 'delivered',
            exit_history: history(stop, 'manual_exit', patch.departed_at, { user_id: req.user.id }),
            ...(position > 0 && !incident && (!stop.outcome || stop.outcome === 'pending') ? { outcome: 'delivered', outcome_at: patch.received_at ?? stop.received_at ?? patch.departed_at } : {}),
          });
        }
        await stop.update(values, { transaction });
        if (documented(stop)) await clearStopNotices(trip, stop, transaction);
        await trip.update({
          metadata: {
            ...trip.metadata,
            manual_recorded_at: now.toISOString(),
            ...(departure ? { manual_departure_at: departure } : {}),
          },
          ...(started && !trip.started_at ? { started_at: started } : {}),
          ...(started && trip.status === 'creado' ? { status: 'en_curso' } : {}),
        }, { transaction });
        const reading = patch.departure_odometer ?? patch.arrival_odometer;
        alertVehicle = !trip.is_test && reading != null ? trip.vehicle_id : null;
        if (alertVehicle) await recordMileage(alertVehicle, reading, null, transaction);
        await finishTrip(trip, stops, transaction, { manual: true });
        if (trip.status === 'finalizado') {
          for (const point of stops) await clearStopNotices(trip, point, transaction);
        }
        await accrueTrip(trip, transaction, now);
      }
      const warnings = conflictLabels(conflicts);
      await notifyTripConflict(trip, stop, conflicts, 'Registro manual', request_id, transaction);
      await saveRevision(trip, req.user, {
        action: 'manual', reason: finalize ? 'Cierre administrativo del registro manual' : 'Registro administrativo del punto ' + stop.place.name, request_id, manualResult: { conflicts: warnings, changed },
      }, before, transaction, requestHash);
      return { status: trip.status, revision: trip.control_revision, documentsSaved, alertVehicle, conflicts: warnings, changed };
    });
  } finally {
    if (!result?.documentsSaved) await Promise.all(documents.map(removeDocument));
  }
  if (result.alertVehicle) await dispatchAlerts(result.alertVehicle).catch(error => console.error('Alerta de mantenimiento:', error.message));
  res.json({ status: result.status, revision: result.revision, conflicts: result.conflicts, changed: result.changed });
});


const correctionFields = [...dateFields, 'arrival_odometer', 'departure_odometer'];
const grantAudience = 'guayaca-manual-point-correction';
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

async function correctionPoint(id, position, transaction) {
  validateId(id);
  if (!/^\d+$/.test(position ?? '')) fail('Selecciona un punto válido');
  const trip = await Trip.findByPk(id, transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {});
  if (!trip) fail('Viaje no encontrado', 404);
  if (trip.status === 'cancelado') fail('Viaje cancelado', 409);
  const index = Number(position);
  if (!points(trip)[index]) fail('Punto no disponible para la corrección', 404);
  if (await Line.count({ where: { trip_id: trip.id, active: true }, transaction })) {
    fail('El viaje pertenece a un corte activo. Retira el corte antes de corregir.', 409);
  }
  const stop = await Stop.findOne({ where: { trip_id: trip.id, position: index }, transaction });
  if (!stop) fail('El punto todavía no tiene datos guardados', 409);
  const snapshot = hash([
    trip.status, trip.control_revision, index === 0 ? trip.metadata?.manual_departure_at ?? trip.started_at : null,
    ...correctionFields.map(field => stop[field]),
    stop.arrival_file_id, stop.arrival_file_ids, stop.document_waived,
  ]);
  return { trip, stop, index, snapshot, type: 'manual_point:' + trip.id + ':' + index + ':' + snapshot };
}

export const manualCorrectionCode = wrap(async (req, res) => {
  const { trip, stop, type } = await correctionPoint(req.params.id, req.params.position);
  const challenge = await sendConfirmation(req.user, type, `Autoriza la corrección del punto ${stop.place.name} del viaje ${trip.code}.`);
  res.json({ challenge });
});

export const manualCorrectionUnlock = wrap(async (req, res) => {
  const { trip, stop, index, type, snapshot } = await correctionPoint(req.params.id, req.params.position);
  const challenge = await verifyConfirmation(req.user, type, req.body ?? {});
  const grant = jwt.sign({ kind: grantAudience, sv: req.user.session_version, challenge, trip: String(trip.id), position: index, snapshot }, secret, {
    audience: grantAudience, subject: String(req.user.id), expiresIn: '10m',
  });
  res.json({ grant, point: stop.toJSON(), started_at: trip.metadata?.manual_departure_at ?? trip.started_at ?? null });
});

export const manualCorrectionSave = wrap(async (req, res) => {
  const body = req.body ?? {};
  let grant;
  try {
    grant = jwt.verify(body.grant, secret, { algorithms: ['HS256'], audience: grantAudience, subject: String(req.user.id) });
  } catch {
    fail('La autorización venció. Solicita otro código.', 403);
  }
  if (grant.kind !== grantAudience || grant.sv !== req.user.session_version) fail('Solicita una autorización nueva.', 403);
  if (grant.trip !== req.params.id || String(grant.position) !== req.params.position) fail('Código autorizado para otro punto', 403);
  const requestId = body.request_id;
  if (!uuid.test(requestId ?? '')) fail('Identificador de corrección inválido');
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 5 || reason.length > 1000) fail('Indica un motivo entre 5 y 1000 caracteres');

  const now = new Date();
  const patch = {};
  for (const field of correctionFields) {
    if (body[field] === undefined) continue;
    patch[field] = field.endsWith('_at') ? dateValue(body[field], now) : km(body[field]);
  }
  const startedAt = body.started_at === undefined ? null : dateValue(body.started_at, now);
  if (grant.position === 0 ? patch.received_at : startedAt) fail('El campo no corresponde a este punto');
  const files = req.files ?? [];
  if (!Object.keys(patch).length && !startedAt && !files.length) fail('Modifica al menos un dato del punto');
  const requestHash = hash([grant.challenge, grant.position, reason, patch, startedAt,
    files.map(file => [file.originalname, hash(file.buffer.toString('base64'))])]);
  const documents = files.length ? await storeDocuments(req) : [];
  let persisted = false;
  try {
    const result = await db.transaction(async transaction => {
      await db.query('SELECT pg_advisory_xact_lock(782135)', { transaction });
      const previous = await Revision.findOne({ where: { request_id: requestId }, transaction });
      if (previous) {
        if (String(previous.trip_id) !== grant.trip || String(previous.user_id) !== String(req.user.id) ||
            previous.action !== 'correct' || previous.request_hash !== requestHash) fail('Identificador de corrección utilizado', 409);
        return { response: { ok: true, revision: previous.revision } };
      }
      const { trip, stop, snapshot } = await correctionPoint(req.params.id, req.params.position, transaction);
      if (snapshot !== grant.snapshot) fail('El punto cambió desde la autorización. Revisa los datos y solicita otro código.', 409);
      const started = trip.metadata?.manual_departure_at ?? trip.started_at;
      if (Object.keys(patch).some(field => stop[field] == null) || (startedAt && !started) ||
          (documents.length && !stop.arrival_file_id)) fail('Usa el registro manual para completar los campos vacíos.', 409);
      await consumeConfirmation(grant.challenge, transaction);
      if (documents.length) {
        const attachments = await Attachment.bulkCreate(documents.map(document => ({
          ...document, trip_id: trip.id, category: grant.position === 0 ? 'guia' : 'entrega',
        })), { transaction });
        patch.arrival_file_id = attachments[0].id;
        patch.arrival_file_ids = attachments.map(file => String(file.id));
      }
      const response = await applyControl(trip, req.user, {
        action: 'correct', request_id: requestId, reason, position: grant.position,
        patch, startedAt, manualCorrection: true,
      }, transaction, requestHash);
      const alertVehicle = !trip.is_test && (patch.arrival_odometer ?? patch.departure_odometer) != null ? trip.vehicle_id : null;
      return { response, saved: true, alertVehicle };
    });
    persisted = result.saved;
    if (result.alertVehicle) await dispatchAlerts(result.alertVehicle).catch(error => console.error('Alerta de mantenimiento:', error.message));
    res.json(result.response);
  } finally {
    if (!persisted) await Promise.all(documents.map(removeDocument));
  }
});
