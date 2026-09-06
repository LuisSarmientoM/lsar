# Lsar

Configuración local de Pi para trabajar con una conversación pragmática y una pipeline SDD opcional para trabajo sustancial; las tareas pequeñas se resuelven directamente.

<img width="1280" height="640" alt="lucho-cover" src="https://github.com/user-attachments/assets/68da819a-6dc2-468c-943c-cd16337411af" />

## Comportamiento

- Las tareas pequeñas y claras se resuelven directamente.
- Ante trabajo que requiera buscar o leer código, el agente padre lanza `lsar-analysis`; la exploración de código es exclusiva de `lsar-explore` y el padre no explora.
- Tras `analysis` y tras `design` (cuando `design` no devuelve `status: blocked`), antes de `coder`, el padre presenta el resultado y espera aprobación humana explícita; la aprobación de `design` es condicional al status, no incondicional.
- Cuando `spec` devuelve `awaiting_user_approval: true` con `open_decisions`, el padre presenta las decisiones `D*` del artifact tal cual (sin sustituirlas por un contrato propio) y traslada las aprobadas a `design`. Es una ruta de retorno condicional, no un tercer gate fijo.
- El padre inyecta en cada delegación un bloque de contexto con `project` (resuelto una vez por sesión con `mem_current_project`, nunca derivado del `change-name` o del `cwd`) y `session_id: sdd-{change-name}`.
- Una confirmación natural (`ok`, `dale`, `sigue`, `continúa`) acepta solo la propuesta inequívoca inmediatamente anterior.
- Antes de editar, el padre presenta alcance, archivos, validación y riesgos, y espera confirmación explícita.
- Las acciones sensibles, destructivas, irreversibles o externas conservan una confirmación propia.
- El cierre obligatorio es `mem_session_summary` (topic keys y veredicto, sin copiar contenido de fase); el padre puede añadir un único `mem_save` propio solo si aporta algo no cubierto por ningún artifact.

## Arquitectura

El agente padre mantiene el contexto y coordina. No reexplora: delega la exploración en `lsar-explore`. La pipeline SDD única es:

- `lsar-analysis` → `sdd/{change-name}/analysis`: propuesta, alcance y decisiones; define `change_name` y `base_key`.
- `lsar-explore` → `sdd/{change-name}/explore`: investigación read-only del código y estado real.
- `lsar-spec` → `sdd/{change-name}/spec`: spec verificable a partir de la propuesta y la exploración.
- `lsar-design` → `sdd/{change-name}/design`: diseño técnico y tareas; requiere aprobación humana antes de implementar.
- `lsar-coder` → `sdd/{change-name}/coder`: único escritor; implementa y puede usar `mem_update` sobre `design` solo para progreso y evidencia.
- `lsar-verify` → `sdd/{change-name}/verify`: valida de forma independiente contra spec y tareas, con cobertura por ids.

Cada fase guarda solo su propio topic key; el padre no llama `mem_save` para esos seis keys. `references/sdd-phase-common.md` se inyecta mediante `sync-to-pi.sh` en las seis fases, no en `lsar-security`. `lsar-security` es opt-in, read-only y queda fuera de la cadena. El script copia `APPEND_SYSTEM.md`, `settings.json`, `agents/*.md`, `extensions/*.ts`, `extensions/lib/*.ts`, `prompts/*.md` y `references/`, y no elimina archivos obsoletos del destino.

- `prompts/gh.md` proporciona el comando `/gh`: acepta `pr|is <N|URL>` o `<N|URL>`, consulta en modo read-only mediante `gh` el repositorio actual para números y usa `-R owner/repo` cuando la URL lo especifica.

## Formato de los agentes SDD

Todos los agentes de la pipeline comparten el mismo contrato:

- Frontmatter con `name`, `description`, `model`, `effort` y `tools` (allowlist). El read-only se impone quitando `edit`/`write` de `tools`; no existe un campo `readonly` en pi-subagents.
- Secciones: rol, `Forma de trabajar`, `Límites`, `Instructions`, `Engram save (mandatory)` y `Result Contract`.
- `lsar-analysis` devuelve `change_name`, `base_key` y `awaiting_user_approval`; `lsar-spec` devuelve `awaiting_user_approval` y `open_decisions` cuando hay decisiones bloqueantes; `lsar-design` devuelve `awaiting_user_approval` condicional al `status` (`false` cuando `blocked`); `lsar-coder` puede devolver `interaction_required` y es el único que usa `mem_update`; `lsar-verify` es el único que añade `verdict`.
- El protocolo común fija la recuperación de artifacts (`mem_get_observation`), la persistencia (`mem_save`), la propiedad de artifacts y las aprobaciones humanas.

## Instrucciones controladas

La referencia canónica es [`references/skills-controlled.md`](references/skills-controlled.md). La ruta adoptada es `references/{category}/{superficie}.md`; `settings.json` mantiene `enableSkillCommands: false`. El padre entrega la ruta exacta y ninguna fase carga instrucciones no entregadas por él: no hay auto-discovery ni comandos `/skill:*`. `skill_resolution` puede ser `paths-injected | none`.

## Referencias privadas

`references/security/` es la categoría `security` de las instrucciones controladas; sus documentos se cargan bajo demanda por `lsar-security`:

- `references/security/wordpress.md`: WordPress PHP/plugins/themes.
- `references/security/node-backend.md`: Node/TypeScript servidor.
- `references/security/browser-frontend.md`: navegador / frontend.
- `references/security/supply-chain-ci.md`: manifests, lockfiles, workflows, Docker, IaC.

`references/sdd-phase-common.md` no es una instrucción controlada: es el protocolo común de la pipeline SDD, inyectado por `sync-to-pi.sh`.

## Perfiles de modelos para subagentes

La extensión registra `/subagent-profile-create`, `/subagent-profile-edit`, `/subagent-profile-delete` y `/subagent-profile-apply`; requieren UI interactiva. El catálogo dedicado vive en `$PI_CODING_AGENT_DIR/subagent-profiles.json` (por defecto `~/.pi/agent`) y usa perfiles con asignaciones `{ "model": "provider/model-id", "effort": "high" }`.

Crear y editar trabajan sobre un borrador staged: permiten renombrar y añadir, editar o quitar agentes, y solo guardan tras validar y confirmar. Eliminar confirma y modifica únicamente el catálogo. Aplicar selecciona explícitamente un perfil, valida todos sus agentes instalados en `$PI_CODING_AGENT_DIR/agents/*.md` y muestra cada cambio. Solo reemplaza las líneas raíz `model:` y `effort:` del frontmatter; realiza escrituras temporales con rename y rollback ante fallos. Si no hay cambios no recarga; tras aplicar cambios ejecuta `/reload`. Si la recarga falla, reintenta `/reload` manualmente sin reaplicar. Los archivos `agents/` fuente del repositorio y las tareas ya iniciadas no se modifican.

## Activación

Requisitos previos para las herramientas `codegraph_*`: instala el CLI global (`npm install -g @colbymchenry/codegraph`) e inicializa el índice en cada proyecto a consultar (`codegraph init -i`). Sin ellos las herramientas fallan aunque este repo esté sincronizado. El índice vive en `.codegraph/`, que es estado local ignorado por Git: `sync-to-pi.sh` no lo crea ni lo sincroniza, por lo que debe inicializarse por separado en cada proyecto. Los cambios en `agents/*.md` (p. ej. la prioridad CodeGraph-first de `lsar-explore`) solo llegan al runtime tras ejecutar `sync-to-pi.sh` y `/reload`.

Para el foco preciso de notificaciones en Ghostty, instala manualmente `terminal-notifier` (`brew install terminal-notifier`). Si falta, las notificaciones degradan automáticamente a una notificación sin foco preciso. El sonido normal es `Blow` (no `Blowy`, que no existe en macOS estándar) y el sonido de error es `Sosumi`.

Después de sincronizar o copiar los archivos al runtime de Pi, ejecuta `/reload` o reinicia Pi. `sync-to-pi.sh` no elimina archivos obsoletos del destino.

### Contexto SDD por sesión

`APPEND_SYSTEM.md` conserva su nombre reservado, se instala y Pi lo autocarga con solo las instrucciones base. El bloque de orquestación vive aparte en `references/lsar-orchestration.md` y es opt-in: al iniciar una sesión interactiva nueva se pregunta exactamente `¿quieres SDD pipeline?`. `sí` añade el bloque SDD completo al system prompt; `no` no añade nada y deja únicamente la base. La elección dura toda la sesión y se restaura en `resume`, `reload` y `fork`; cambiarla requiere una sesión nueva.

Un proyecto puede desactivar la activación automática creando exactamente `<cwd>/.pi/lsar.json` con:

```json
{ "pipeline": "never" }
```

`never` prevalece sobre la elección persistida y sobre `--sdd-pipeline`, también en sesiones sin UI; los archivos ausentes, `{}` o sin `pipeline` no cambian el comportamiento. JSON, raíz o valor inválidos se ignoran con un aviso no bloqueante. Solo se consulta esa ruta exacta: no se busca en directorios ascendentes ni existe configuración global. La exclusión se evalúa en cada `session_start` y no bloquea `subagent_run`, `tool_call` ni la invocación manual de agentes `lsar-*`. `sync-to-pi.sh` sigue instalando `APPEND_SYSTEM.md` bajo el nombre reservado y distribuye la referencia separada sin cambios de script.

Los cuatro agentes legacy ya no existen en el repo, pero sus copias pueden seguir presentes en `$PI_AGENT_DIR/agents/` y requieren una acción destructiva separada, posterior a la Etapa 7, con autorización explícita:

- `$PI_AGENT_DIR/agents/lsar-manager.md`
- `$PI_AGENT_DIR/agents/lsar-analyst.md`
- `$PI_AGENT_DIR/agents/lsar-lead.md`
- `$PI_AGENT_DIR/agents/lsar-research.md`
