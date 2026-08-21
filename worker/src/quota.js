// Límite de uso diario, simple y aislado a propósito: hoy el identificador
// es la IP del que llama (no hay cuentas todavía), pero el día que exista
// login/Stripe, alcanza con cambiar qué se le pasa como `identifier` en
// index.js — la firma y el almacenamiento en KV no necesitan cambiar.
export async function checkAndConsumeQuota(env, identifier, limit) {
  const day = new Date().toISOString().slice(0, 10); // "2026-08-21"
  const key = `quota:${identifier}:${day}`;
  const current = parseInt((await env.QUOTA_KV.get(key)) || '0', 10);

  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }

  const next = current + 1;
  // expirationTtl limpia solo los contadores viejos; 2 días de margen
  // cubre bien los bordes de cambio de huso horario.
  await env.QUOTA_KV.put(key, String(next), { expirationTtl: 60 * 60 * 48 });
  return { allowed: true, remaining: limit - next };
}
