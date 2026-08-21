# Worker de conversión Word→PDF de alta fidelidad

Este Worker recibe un `.docx`, lo convierte a PDF usando el motor real de
LibreOffice vía [CloudConvert](https://cloudconvert.com), y devuelve el PDF.
Existe para que `tools/word-a-pdf.html` pueda ofrecer una conversión
pixel-perfecta (incluye cosas que el conversor 100% en el navegador no puede
replicar, como una imagen anclada que sobresale del margen de la página),
sin exponer nunca la clave de API de CloudConvert en el código del sitio
(que es público, al ser GitHub Pages).

## Configuración inicial (una sola vez)

1. Crear una cuenta en [cloudconvert.com](https://cloudconvert.com) y generar
   una API key. **Usar primero la clave "sandbox"** (gratis, ilimitada, pero
   el PDF sale con marca de agua) — la clave de producción se agrega recién
   al final, cuando todo esté probado.
2. Crear/entrar a una cuenta de [Cloudflare](https://dash.cloudflare.com) y
   habilitar Workers (el plan gratis alcanza para empezar).
3. Dentro de esta carpeta (`worker/`):
   ```bash
   npm install
   npx wrangler login
   ```
   (abre un flujo de login en el navegador)
4. Crear el namespace de KV para el límite de uso diario:
   ```bash
   npx wrangler kv namespace create QUOTA_KV
   ```
   Copiar el `id` que devuelve ese comando dentro de `wrangler.toml`, en
   `[[kv_namespaces]] id = "..."`.
5. Guardar la clave de CloudConvert como secreto (nunca se commitea):
   ```bash
   npx wrangler secret put CLOUDCONVERT_API_KEY
   ```
   (pegar la clave **sandbox** primero)
6. Desplegar:
   ```bash
   npx wrangler deploy
   ```
   Va a imprimir una URL tipo `https://word-a-pdf-worker.<tu-subdominio>.workers.dev`.
   Copiar esa URL y pegarla como `WORKER_URL` en `tools/word-a-pdf.html`.

## Probar en local

```bash
cp .dev.vars.example .dev.vars
# editar .dev.vars y pegar la clave sandbox real
npm run dev
```

Luego, con un `.docx` real:

```bash
curl -i -X POST http://localhost:8787/convert \
  -H "Origin: https://pipp0.github.io" \
  -H "Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
  -H "X-Filename: test.docx" \
  --data-binary @/ruta/al/archivo.docx \
  -o out.pdf
```

Debería devolver `200` con un PDF válido (con marca de agua, por la clave
sandbox). Probar también con un `Origin` distinto (debe dar `403`) y llamar
más de `FREE_DAILY_LIMIT` veces seguidas desde la misma IP (debe dar `429`
al superarlo).

## Pasar a producción

Una vez confirmado que todo funciona bien con la clave sandbox:

```bash
npx wrangler secret put CLOUDCONVERT_API_KEY
# pegar ahora la clave de PRODUCCIÓN
npx wrangler deploy
```
