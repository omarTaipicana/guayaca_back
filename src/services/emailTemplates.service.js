// Plantillas de correo con estilos en línea compatibles con clientes de correo.
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function logoUrl(){
 try {
  const configured=process.env.EMAIL_LOGO_URL?.trim();
  const frontend=process.env.APP_URL?.trim();
  if(!configured&&!frontend)return null;
  const url=configured?new URL(configured):new URL('/logo.png',frontend);
  // Correos externos no pueden cargar localhost; se usa el logo solo con HTTPS.
  if(url.protocol!=='https:'||['localhost','127.0.0.1','::1'].includes(url.hostname)||url.username||url.password)return null;
  return url.href;
 } catch { return null; }
}
const variants={
 verify:{subject:'GUAYACA · Verifica tu correo',title:'Verifica tu correo',intro:'Usa este código para confirmar tu dirección de correo en GUAYACA Transport.',purpose:'VERIFICACIÓN DE CORREO'},
 login:{subject:'GUAYACA · Código de doble factor',title:'Confirma tu inicio de sesión',intro:'Usa este código para completar tu ingreso a GUAYACA Transport.',purpose:'DOBLE FACTOR'},
 password_reset:{subject:'GUAYACA · Recupera tu contraseña',title:'Recupera tu contraseña',intro:'Recibimos una solicitud para restablecer tu contraseña. Ingresa este código en la pantalla de recuperación.',purpose:'RECUPERACIÓN DE CONTRASEÑA'},
};
export function securityEmail(purpose,code){
 const v=variants[purpose];if(!v||!/^\d{6}$/.test(String(code)))throw new Error('Tipo o código de correo inválido');
 const safe=escapeHtml(code),logo=logoUrl();
 const text=`${v.title}\n\n${v.intro}\n\nTu código es ${code}. Vence en 10 minutos y solo puede usarse una vez.\n\nSi no realizaste esta solicitud, ignora este correo. No compartas el código.\n\nGUAYACA Transport`;
 const brand=logo?`<img src="${escapeHtml(logo)}" width="64" height="64" alt="GUAYACA Transport" style="display:block;width:64px;height:64px;border:0;border-radius:50%;margin:0 auto 12px;">`:'';
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,sans-serif;color:#17334d;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;"><tr><td align="center" style="background:#07346b;padding:28px 20px;color:#ffffff;">${brand}<div style="font-size:21px;font-weight:bold;letter-spacing:1px;">GUAYACA</div><div style="font-size:12px;letter-spacing:2px;color:#c4d9ed;margin-top:4px;">TRANSPORT</div></td></tr><tr><td style="height:5px;background:#ff6a1a;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:32px 28px;"><div style="font-size:11px;letter-spacing:1.3px;font-weight:bold;color:#dd5d1b;">${v.purpose}</div><h1 style="font-size:23px;line-height:1.3;color:#07346b;margin:12px 0;">${v.title}</h1><p style="font-size:15px;line-height:1.6;color:#536b80;margin:0 0 20px;">${v.intro}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:19px;background:#f2f7fc;border:1px solid #dce9f4;border-radius:10px;"><span style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#07346b;">${safe}</span></td></tr></table><p style="font-size:13px;line-height:1.6;color:#627c91;margin:18px 0 0;">El código vence en <strong>10 minutos</strong> y solo puede utilizarse una vez.</p><p style="font-size:13px;line-height:1.6;color:#627c91;margin:15px 0 0;">Si no realizaste esta solicitud, ignora este mensaje. No compartas este código.</p></td></tr><tr><td align="center" style="padding:20px;background:#f7fafc;color:#8295a5;font-size:12px;line-height:1.5;">GUAYACA Transport<br>Mensaje automático de seguridad</td></tr></table></td></tr></table></body></html>`;
 return {subject:v.subject,text,html};
}

export function invitationEmail(url) {
 let link;
 try { link=new URL(url); } catch { throw new Error('Enlace de activación inválido'); }
 if(!['https:','http:'].includes(link.protocol))throw new Error('Enlace de activación inválido');
 const safeUrl=escapeHtml(link.href),logo=logoUrl();
 const brand=logo?`<img src="${escapeHtml(logo)}" width="64" height="64" alt="GUAYACA Transport" style="display:block;width:64px;height:64px;border:0;border-radius:50%;margin:0 auto 12px;">`:'';
 const text=`Bienvenido a GUAYACA Transport\n\nEl administrador creó una cuenta para ti. Abre este enlace para crear tu contraseña y verificar tu correo:\n\n${link.href}\n\nEl enlace vence en 48 horas y solo puede usarse una vez. Si no esperabas esta invitación, ignora este mensaje.`;
 const html=`<!doctype html><html lang="es"><body style="margin:0;background:#eef3f8;font-family:Arial,sans-serif;color:#17334d;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;"><tr><td align="center" style="background:#07346b;color:#fff;padding:28px;">${brand}<strong style="font-size:21px;letter-spacing:1px;">GUAYACA</strong><div style="font-size:12px;letter-spacing:2px;margin-top:4px;color:#c4d9ed;">TRANSPORT</div></td></tr><tr><td style="height:5px;background:#ff6a1a;"></td></tr><tr><td style="padding:32px 28px;"><div style="font-size:11px;letter-spacing:1px;color:#dd5d1b;font-weight:bold;">ACTIVA TU CUENTA</div><h1 style="font-size:23px;color:#07346b;">Bienvenido a GUAYACA</h1><p style="font-size:15px;line-height:1.6;color:#536b80;">El administrador creó una cuenta para ti. Crea tu contraseña para empezar.</p><p style="margin:25px 0;"><a href="${safeUrl}" style="display:inline-block;background:#07346b;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">Crear mi contraseña</a></p><p style="font-size:13px;color:#627c91;line-height:1.6;">El enlace vence en <strong>48 horas</strong> y solo puede utilizarse una vez. Si no esperabas esta invitación, ignora este correo.</p><p style="font-size:12px;color:#8295a5;overflow-wrap:anywhere;">Si el botón no funciona, copia este enlace: ${safeUrl}</p></td></tr><tr><td align="center" style="padding:20px;background:#f7fafc;color:#8295a5;font-size:12px;">GUAYACA Transport · Mensaje automático</td></tr></table></td></tr></table></body></html>`;
 return {subject:'GUAYACA · Activa tu cuenta',text,html};
}
