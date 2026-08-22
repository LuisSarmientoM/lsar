# Lsar

Configuración local de Pi para trabajar con una conversación pragmática y una pipeline SDD opcional para trabajo sustancial; las tareas pequeñas se resuelven directamente.

<img width="1280" height="640" alt="lucho-cover" src="https://github.com/user-attachments/assets/68da819a-6dc2-468c-943c-cd16337411af" />


## Comportamiento

- Las tareas pequeñas y claras se resuelven directamente.
- Ante trabajo que requiera buscar o leer código, el agente padre lanza `lsar-manager` para explorar; con su propuesta decide si continúa con SDD o ejecuta directamente.
- Una confirmación natural (`ok`, `dale`, `sigue`, `continúa`) acepta solo la propuesta inequívoca inmediatamente anterior.
- Antes de editar, el padre presenta alcance, archivos, validación y riesgos, y espera confirmación explícita.
- Las acciones sensibles, destructivas, irreversibles o externas conservan una confirmación propia.
- El cierre guarda en Engram decisiones, resultado verificado y pendientes; no cada salida intermedia.

## Arquitectura

El agente padre mantiene el contexto y coordina. Para explorar delega en `lsar-manager`; con su propuesta decide entre pipeline SDD completa o ejecución directa.

Pipeline SDD (fases, en orden):

- `lsar-manager` → `sdd/{change-name}/manager` (propuesta): investiga read-only (codegraph primero) y define problema, alcance, resultados esperados y decisiones de producto, es un Product Manager.
  - `lsar-analyst` → `sdd/{change-name}/analyst` (spec): convierte la propuesta en una spec verificable y un diseño técnico coherente, es un System Analyst.
- `lsar-lead` → `sdd/{change-name}/lead` (tareas): convierte la spec en una lista ordenada de tareas pequeñas y verificables, es un technical Lead.
- `lsar-research` → `sdd/{change-name}/research` (veredicto): puerta pre-implementación que contrasta los artifacts con la solicitud original; `no-go` detiene el flujo, es un Tech lead con otro rol.
- `lsar-coder` → `sdd/{change-name}/coder` (implementación): único escritor; lee los artifacts e implementa marcando las tareas como hechas, es un Software Engineer.
- `lsar-verify` → `sdd/{change-name}/verify` (reporte): validación independiente contra la spec y las tareas, es un Quality Engineer.

Cada fase lee los artifacts de las fases anteriores desde Engram (`sdd/{change-name}/{fase}`) y guarda el suyo. `references/sdd-phase-common.md` aporta el protocolo común, inyectado por `sync-to-pi.sh` en los agentes SDD.

- `lsar-security` (opt-in): revisor de seguridad read-only, activado solo por solicitud explícita del padre. No es una fase automática, no delega y no aplica parches.

Los subagentes no delegan. Las tareas pequeñas y claras se resuelven directamente, sin pipeline. La revisión de seguridad entra solo cuando el padre la solicita.

`extensions/model-router.ts` conserva el enrutamiento y fallback de modelos. `sync-to-pi.sh` copia `APPEND_SYSTEM.md`, `settings.json`, `agents/*.md`, `extensions/*.ts` y `references/` al runtime configurado e inyecta `references/sdd-phase-common.md` en los agentes SDD; no elimina archivos obsoletos del destino.

## Formato de los agentes SDD

Todos los agentes de la pipeline comparten el mismo contrato:

- Frontmatter con `name`, `description`, `model`, `effort` y `tools` (allowlist). El read-only se impone quitando `edit`/`write` de `tools`; no existe un campo `readonly` en pi-subagents.
- Secciones: rol, `Forma de trabajar`, `Límites`, `Instructions` (referencias a artifacts previos y pasos), `Engram save (mandatory)` (plantilla exacta del artifact) y `Result Contract`.
- `Result Contract` uniforme: `status` (`done | blocked | partial`), `executive_summary` (una frase), `artifacts` (topic_keys), `next_recommended`, `risks` y `skill_resolution`. `lsar-research` y `lsar-verify` añaden `verdict`.
- El protocolo común (`references/sdd-phase-common.md`) fija la recuperación de artifacts (`mem_get_observation` obligatorio tras `mem_search`), la persistencia (`mem_save` con reintento y `capture_prompt: false`), que `topic_key` es solo un parámetro de `mem_save` (nunca una sección del markdown), que el límite read-only no impide persistir el artifact, y que la respuesta final sea texto, no una tool call.

## Referencias privadas

Los documentos bajo `references/security/` son referencias internas cargadas bajo demanda por `lsar-security`; no son skills ni se invocan con comandos:

- `references/security/wordpress.md`: WordPress PHP/plugins/themes.
- `references/security/node-backend.md`: Node/TypeScript servidor.
- `references/security/browser-frontend.md`: navegador / frontend.
- `references/security/supply-chain-ci.md`: manifests, lockfiles, workflows, Docker, IaC.

`references/sdd-phase-common.md` no es una referencia de seguridad: es el protocolo común de la pipeline SDD, inyectado por `sync-to-pi.sh` en los agentes SDD.

## Activación

Después de sincronizar o copiar los archivos al runtime de Pi, ejecuta `/reload` o reinicia Pi. La eliminación de agentes obsoletos ya presentes en un runtime global requiere una migración destructiva separada y explícitamente autorizada.
