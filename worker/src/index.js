import { runConvertJob } from './cloudconvert.js';
import { checkAndConsumeQuota } from './quota.js';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Filename',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonError(env, status, error, message) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
  });
}

async function handleConvert(request, env) {
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  const maxBytes = parseInt(env.MAX_UPLOAD_BYTES || '26214400', 10);
  if (!contentLength) {
    return jsonError(env, 400, 'bad_request', 'Falta el archivo a convertir');
  }
  if (contentLength > maxBytes) {
    return jsonError(env, 400, 'bad_request', `El archivo supera el límite de ${Math.round(maxBytes / 1024 / 1024)}MB`);
  }

  // El límite de uso se revisa ANTES de llamar a CloudConvert, para no
  // gastar créditos pagos en pedidos que de todas formas se van a rechazar.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = parseInt(env.FREE_DAILY_LIMIT || '20', 10);
  const quota = await checkAndConsumeQuota(env, ip, limit);
  if (!quota.allowed) {
    return jsonError(env, 429, 'quota_exceeded', 'Se alcanzó el límite diario gratuito de conversiones de alta fidelidad');
  }

  const filenameHeader = request.headers.get('X-Filename');
  const filename = filenameHeader ? decodeURIComponent(filenameHeader) : 'documento.docx';

  const fileBytes = await request.arrayBuffer();
  if (!fileBytes.byteLength) {
    return jsonError(env, 400, 'bad_request', 'El archivo llegó vacío');
  }

  try {
    const pdfBytes = await runConvertJob(env.CLOUDCONVERT_API_KEY, fileBytes, filename);
    const baseName = filename.replace(/\.docx$/i, '') || 'documento';
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
        ...corsHeaders(env)
      }
    });
  } catch (err) {
    // Nunca se le pasa el error crudo (con detalles internos) al cliente.
    console.error('Conversión fallida:', err);
    return jsonError(env, 502, 'conversion_failed', 'No se pudo completar la conversión de alta fidelidad');
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // El chequeo de Origin frena el abuso casual desde el navegador, pero
    // no es una barrera de seguridad real: un cliente sin navegador (curl,
    // un script) puede mandar cualquier Origin. Por eso el límite de uso
    // por IP en quota.js existe como segunda capa, independiente de esto.
    const origin = request.headers.get('Origin');
    if (origin !== env.ALLOWED_ORIGIN) {
      return jsonError(env, 403, 'forbidden_origin', 'Origen no permitido');
    }

    if (url.pathname === '/convert' && request.method === 'POST') {
      return handleConvert(request, env);
    }

    return jsonError(env, 404, 'not_found', 'Ruta no encontrada');
  }
};
