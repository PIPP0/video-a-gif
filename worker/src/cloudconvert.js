// Convierte un .docx a PDF usando el motor real de LibreOffice vía la API
// de CloudConvert, en vez de reimplementar el layout de Word a mano en el
// navegador (que tiene límites reales: no puede reproducir, por ejemplo,
// una imagen anclada que Word deja sobresalir del margen de la página).
//
// Nota para quien lo despliegue: verificar contra la documentación vigente
// de CloudConvert (developer.cloudconvert.com) el nombre exacto de los
// parámetros del task "convert" — la API puede haber cambiado desde que
// se escribió esto.
export async function runConvertJob(apiKey, fileBytes, filename) {
  const createRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tasks: {
        'import-file': { operation: 'import/upload' },
        'convert-file': {
          operation: 'convert',
          input: 'import-file',
          input_format: 'docx',
          output_format: 'pdf',
          engine: 'libreoffice'
        },
        'export-file': { operation: 'export/url', input: 'convert-file' }
      }
    })
  });

  if (!createRes.ok) {
    throw new Error(`No se pudo crear el job en CloudConvert (${createRes.status})`);
  }
  const { data: job } = await createRes.json();

  const importTask = job.tasks.find((t) => t.name === 'import-file');
  const uploadForm = importTask?.result?.form;
  if (!uploadForm) {
    throw new Error('CloudConvert no devolvió el formulario de subida');
  }

  const form = new FormData();
  Object.entries(uploadForm.parameters).forEach(([key, value]) => form.append(key, value));
  form.append('file', new Blob([fileBytes]), filename);

  const uploadRes = await fetch(uploadForm.url, { method: 'POST', body: form });
  if (!uploadRes.ok) {
    throw new Error(`No se pudo subir el archivo a CloudConvert (${uploadRes.status})`);
  }

  // /wait bloquea del lado de CloudConvert hasta que el job termine o
  // falle, en vez de hacer polling manual desde el Worker.
  const waitRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.id}/wait`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!waitRes.ok) {
    throw new Error(`Error esperando el job de CloudConvert (${waitRes.status})`);
  }
  const { data: finishedJob } = await waitRes.json();

  if (finishedJob.status !== 'finished') {
    const errorTask = finishedJob.tasks?.find((t) => t.status === 'error');
    throw new Error(`Job de CloudConvert con estado "${finishedJob.status}": ${errorTask?.message || 'sin detalle'}`);
  }

  const exportTask = finishedJob.tasks.find((t) => t.name === 'export-file');
  const fileUrl = exportTask?.result?.files?.[0]?.url;
  if (!fileUrl) {
    throw new Error('CloudConvert no devolvió una URL de resultado');
  }

  const pdfRes = await fetch(fileUrl);
  if (!pdfRes.ok) {
    throw new Error('No se pudo descargar el PDF resultante de CloudConvert');
  }
  return pdfRes.arrayBuffer();
}
