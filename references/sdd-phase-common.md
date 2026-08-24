# SDD Phase — Common Protocol

Protocolo idéntico inyectado en todos los agentes de la pipeline SDD de Lsar.

## Read-only vs memoria

El límite read-only de una fase cubre SOLO archivos y código: no editar, no escribir ficheros, no ejecutar comandos de escritura. Persistir tu artifact en Engram con `mem_save` NO viola ese límite: es tu salida obligatoria de fase, no una modificación del repositorio. Si dudas entre «devolver inline» y «guardar», guarda.

## Boundary del executor

Cada agente de fase es un EXECUTOR, no un orquestador. Haz tú el trabajo de tu fase. No lances subagentes, no uses `delegate`/`task`, y no rebotes trabajo salvo que tu instrucción de fase te diga explícitamente parar y reportar un bloqueo.

## Bloque de contexto de delegación

El padre inyecta en cada delegación un bloque `orchestrator context` con `project`, `session_id` y `change_name`. Son valores RECIBIDOS del padre, nunca derivados por la fase: no calcules `project` a partir de `change-name`, del `cwd` ni lo inventes. Forma canónica:

```text
orchestrator context:
  project: {valor exacto recibido del padre}
  session_id: sdd-{change-name}
  change_name: {change-name}
  base_key: sdd/{change-name}
  request: {solicitud original}
  context_paths: {rutas exactas o ninguna}
```

## Recuperación de artifacts (Engram)

Los artifacts viven en Engram bajo `sdd/{change-name}/{fase}`. `mem_search` devuelve previews de ~300 chars, NO el contenido completo: llama SIEMPRE `mem_get_observation(id)` por cada artifact. Usar previews como material produce output incorrecto.

Lanza todas las búsquedas en paralelo y, con los ids obtenidos, todas las recuperaciones en paralelo:

```text
mem_search(query: "sdd/{change-name}/{fase}", project: "{project}") → guarda el id
mem_get_observation(id) → contenido completo (OBLIGATORIO)
```

**Regla de cero-resultados para un artifact obligatorio:** cero resultados de `mem_search` sobre un artifact obligatorio es una VIOLACIÓN DE CONTRATO, no un fallo de infraestructura. Ante cero resultados:
1. Reintenta una única vez con `all_projects: true`.
2. Si sigue en cero, devuelve `status: blocked` citando el `topic_key` exacto y el `project` exacto usados en la búsqueda.
3. Prohibido atribuir el fallo a Engram o a un endpoint HTTP inalcanzable salvo que el tool haya devuelto un error explícito; en ese caso, cita ese error textualmente en el reporte.

## Persistencia de artifacts

Cada fase que produce un artifact DEBE persistirlo antes de responder. Omitirlo rompe la pipeline. Si `mem_save` falla (Engram caído o schema), reintenta una vez antes de degradar a inline.

```text
mem_save(
  title: "sdd/{change-name}/{fase}",
  topic_key: "sdd/{change-name}/{fase}",
  type: "{type de tu fase}",
  project: "{project}",
  session_id: "{session_id}",
  capture_prompt: false,
  content: "{tu artifact completo en markdown}"
)
```

- `topic_key` es SOLO un parámetro de `mem_save` (habilita upserts: volver a guardar actualiza, no duplica). Nunca lo escribas como sección dentro del markdown del artifact.
- `capture_prompt: false` es obligatorio: son salidas automatizadas de pipeline, no memoria humana. Si el schema de Engram rechaza el campo, omítelo antes que fallar.

## Propiedad de artifacts

- Escribes únicamente tu propio `topic_key`. Ninguna fase guarda ni sobrescribe un key ajeno.
- La única excepción es `lsar-coder`: puede actualizar `sdd/{change-name}/design` con `mem_update(id, content)` solo para marcar progreso (`[ ]` → `[x]`) y añadir evidencia breve, conservando el diseño, las decisiones y las tareas aprobadas.
- El `change-name` lo crea `lsar-analysis`; ninguna otra fase lo recalcula ni lo renombra.
- Anti-duplicidad recíproca: el padre no re-guarda tu artifact y tú no guardas artifacts de otras fases; guardar el mismo `topic_key` hace upsert, no crea otra observación.

## Aprobaciones humanas

- Si tu Result Contract declara `awaiting_user_approval: true`, tu turno termina ahí: no encadenas la fase siguiente, no la sugieres como hecha y no asumes que la aprobación ya ocurrió.
- La aprobación la recoge el padre en conversación con el usuario; una fase nunca la infiere del contexto.

## Envelope de retorno

Tu salida FINAL debe ser TEXTO (el envelope), no una tool call. Si debes guardar con `mem_save`, hazlo ANTES de tu respuesta de texto final. No llames `mem_session_summary` (es solo del agente top-level): cuando tu última acción es una tool call, el padre recibe solo el resultado de la tool y tu análisis se pierde.

Devuelve los campos del Result Contract de tu fase, en el formato que tu instrucción de fase define.
