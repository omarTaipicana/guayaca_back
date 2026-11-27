import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Attachment from '../models/Attachment.js';
import Operational from '../models/OperationalNotification.js';
import User from '../models/User.js';
import { uploadDir } from './shared.service.js';
import { hash } from './tripControl.service.js';

const labels = {
  started_at: 'salida del domicilio',
  arrived_at: 'llegada',
  departed_at: 'salida definitiva',
  received_at: 'recepción de la carga',
  arrival_odometer: 'kilometraje de llegada',
  departure_odometer: 'kilometraje de salida',
  arrival_file_id: 'documentos del punto',
  exit_state: 'confirmación de salida',
};

export function keepSavedFields(saved, incoming, conflicts) {
  return Object.fromEntries(Object.entries(incoming).filter(([field, proposed]) => {
    const current = saved[field];
    if (current == null) return true;
    const equal = field.endsWith('_at')
      ? +new Date(current) === +new Date(proposed)
      : Number(current) === Number(proposed);
    if (!equal) conflicts.push(field);
    return false;
  }));
}

export async function acceptDocuments(stop, documents, conflicts, transaction) {
  if (!documents.length) return false;
  if (!stop.arrival_file_id && !stop.document_waived) return true;
  const ids = stop.arrival_file_ids?.length ? stop.arrival_file_ids : [stop.arrival_file_id].filter(Boolean);
  if (!stop.document_waived && ids.length === documents.length) {
    const existing = await Attachment.findAll({ where: { id: ids, trip_id: stop.trip_id, deleted_at: null }, transaction });
    try {
      const fingerprint = async file => hash((await readFile(path.join(uploadDir, file.stored_name))).toString('base64'));
      const saved = await Promise.all(existing.map(fingerprint));
      const incoming = await Promise.all(documents.map(fingerprint));
      if (JSON.stringify(saved.sort()) === JSON.stringify(incoming.sort())) return false;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  conflicts.push('arrival_file_id');
  return false;
}

export const conflictLabels = fields => fields.map(field => labels[field]);

export async function notifyTripConflict(trip, stop, fields, source, operation, transaction) {
  if (!fields.length) return;
  const admins = await User.findAll({ where: { role: 'admin', active: true }, attributes: ['id'], transaction });
  const phase = 'conflicto:' + hash([source, operation]).slice(0, 10);
  for (const admin of admins) {
    await Operational.findOrCreate({
      where: { user_id: admin.id, stop_id: stop.id, phase },
      defaults: {
        trip_id: trip.id,
        title: 'Datos distintos en un viaje',
        message: `${trip.code} · ${stop.place.name} · ${source}. Se conservaron los datos guardados de: ${conflictLabels(fields).join(', ')}.`,
      },
      transaction,
    });
  }
}
