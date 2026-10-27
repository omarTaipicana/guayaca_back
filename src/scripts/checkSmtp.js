import 'dotenv/config';
import {createMailTransport} from '../services/email.service.js';
let transport;
try {
  transport=createMailTransport();
  await transport.verify();
  console.log('Conexión SMTP y autenticación correctas. No se envió correo.');
} catch (error) {
  console.error('No se pudo verificar SMTP:', error.code || error.name, '-', error.message);
  console.error('Revise servidor, puerto, seguridad, usuario y contraseña de aplicación.');
  process.exitCode=1;
} finally { if(transport) transport.close(); }
