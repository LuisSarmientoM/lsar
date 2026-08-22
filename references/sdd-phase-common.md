# SDD Phase — Common Protocol

Protocolo idéntico inyectado en todos los agentes de la pipeline SDD de Lsar.

## Read-only vs memoria

El límite read-only de una fase cubre SOLO archivos y código: no editar, no escribir ficheros, no ejecutar comandos de escritura. Persistir tu artifact en Engram con `mem_save` NO viola ese límite: es tu salida obligatoria de fase, no una modificación del repositorio. Si dudas entre «devolver inline» y «guardar», guarda.

## Boundary del executor

Cada agente de fase es un EXECUTOR, no un orquestador. Haz tú el trabajo de tu fase. No lances subagentes, no uses `delegate`/`task`, y no rebotes trabajo salvo que tu instrucción de fase te diga explícitamente parar y reportar un bloqueo.

## Recuperación de artifacts (Engram)

Los artifacts viven en Engram bajo `sdd/{change-name}/{fase}`. `mem_search` devuelve previews de ~300 chars, NO el contenido completo: llama SIEMPRE `mem_get_observation(id)` por cada artifact. Usar previews como material produce output incorrecto.

Lanza todas las búsquedas en paralelo y, con los ids obtenidos, todas las recuperaciones en paralelo:

```text
mem_search(query: "sdd/{change-name}/{fase}", project: "{project}") → guarda el id
mem_get_observation(id) → contenido completo (OBLIGATORIO)
```

## Persistencia de artifacts

Cada fase que produce un artifact DEBE persistirlo antes de responder. Omitirlo rompe la pipeline. Si `mem_save` falla (Engram caído o schema), reintenta una vez antes de degradar a inline.

```text
mem_save(
  title: "sdd/{change-name}/{fase}",
  topic_key: "sdd/{change-name}/{fase}",
  type: "{type de tu fase}",
  project: "{project}",
  capture_prompt: false,
  content: "{tu artifact completo en markdown}"
)
```

- `topic_key` es SOLO un parámetro de `mem_save` (habilita upserts: volver a guardar actualiza, no duplica). Nunca lo escribas como sección dentro del markdown del artifact.
- `capture_prompt: false` es obligatorio: son salidas automatizadas de pipeline, no memoria humana. Si el schema de Engram rechaza el campo, omítelo antes que fallar.

## Envelope de retorno

Tu salida FINAL debe ser TEXTO (el envelope), no una tool call. Si debes guardar con `mem_save`, hazlo ANTES de tu respuesta de texto final. No llames `mem_session_summary` (es solo del agente top-level): cuando tu última acción es una tool call, el padre recibe solo el resultado de la tool y tu análisis se pierde.

Devuelve los campos del Result Contract de tu fase, en el formato que tu instrucción de fase define.
