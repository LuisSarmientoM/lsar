# Implementación del pipeline de agentes v2

## Estado

Documento acordado para ejecutar el rediseño por etapas. No autoriza la activación en el runtime global ni la eliminación de agentes antiguos.

## Decisiones cerradas

- Pipeline: `lsar-analysis → lsar-explore → lsar-spec → lsar-design → lsar-coder → lsar-verify`.
- `lsar-research` desaparece del flujo y no tendrá reemplazo opcional.
- Habrá aprobación humana después de `analysis` y antes de `coder`.
- `lsar-coder` actualizará el estado de tareas en `design` y guardará su propio artifact `coder`.
- Las futuras instrucciones controladas se cargarán por ruta exacta al subagente. No serán skills descubiertas por Pi.
- No se eliminarán agentes antiguos durante esta implementación. La limpieza será manual.
- Los modelos y `pi-web-access` quedan fuera de alcance.
- Se mantiene el prefijo `sdd/`. `extensions/sdd-phase-summary.ts` lo busca de forma literal.

## Objetivo

Reemplazar la pipeline actual por seis fases con responsabilidades separadas, artifacts trazables en Engram y dos puntos de aprobación humana. El padre coordina, pero no repite la exploración ni vuelve a guardar las salidas de las fases.

## Alcance

### Incluido

- Crear cuatro definiciones nuevas: `analysis`, `explore`, `spec` y `design`.
- Adaptar `coder` y `verify` al nuevo contrato.
- Actualizar la orquestación del padre.
- Corregir la duplicación de artifacts en Engram.
- Preparar el mecanismo de instrucciones controladas sin crear instrucciones de dominio.
- Actualizar sincronización y documentación.
- Validar la configuración en un runtime temporal antes de activarla.

### Fuera de alcance

- Eliminar `lsar-manager`, `lsar-analyst`, `lsar-lead` o `lsar-research` del runtime global.
- Cambiar modelos, perfiles o el router de modelos.
- Instalar, renombrar o integrar `pi-web-access`.
- Crear instrucciones para security, NestJS, JavaScript, HTML o PR.
- Añadir comandos de workflow.
- Usar OpenSpec, el binario `gentle-ai`, PRs encadenadas o TDD obligatorio.
- Modificar `gentle/`.

## Arquitectura final

```text
solicitud
   │
   ├─ tarea pequeña y clara ───────────────→ ejecución directa
   │
   └─ trabajo que requiere pipeline
          │
          ▼
      lsar-analysis
          │
          ▼
      aprobación humana 1
          │
          ▼
      lsar-explore
          │
          ▼
      lsar-spec
          │
          ▼
      lsar-design
          │
          ▼
      aprobación humana 2
          │
          ▼
      lsar-coder
          │
          ▼
      lsar-verify
```

`lsar-security` permanece opt-in y fuera de la cadena automática.

## Identidad del cambio y artifacts

`lsar-analysis` crea un `change-name` estable en kebab-case. Las demás fases lo reciben del padre y no lo recalculan.

```text
sdd/{change-name}/analysis
sdd/{change-name}/explore
sdd/{change-name}/spec
sdd/{change-name}/design
sdd/{change-name}/coder
sdd/{change-name}/verify
```

Si `analysis` propone dividir el esfuerzo, guarda primero el análisis raíz. Los keys de los subcambios se crean solo después de que el usuario apruebe la división. Esto evita artifacts huérfanos.

## Contrato por fase

### 1. `lsar-analysis`

Responsabilidad:

- Estructurar la solicitud original.
- Recuperar antecedentes concretos desde Engram.
- Incorporar restricciones de la sesión y rutas de contexto entregadas por el padre.
- Definir problema, objetivo, alcance tentativo, riesgos y preguntas bloqueantes.
- Proponer división cuando el cambio no pueda ejecutarse como una unidad razonable.
- Crear `change-name` y `sdd/{change-name}/analysis`.

No hace:

- No explora el código.
- No usa CodeGraph.
- No decide el diseño técnico.
- No implementa.

Salida mínima:

```text
status: done | blocked | partial
change_name: {change-name}
base_key: sdd/{change-name}
awaiting_user_approval: true
artifacts: [sdd/{change-name}/analysis]
next_recommended: lsar-explore
```

El padre debe detenerse y presentar el análisis al usuario. No puede lanzar `lsar-explore` sin una aprobación explícita posterior.

### 2. `lsar-explore`

Responsabilidad:

- Recuperar `analysis` completo desde Engram.
- Usar CodeGraph primero.
- Identificar archivos, símbolos, callers, callees, flujo y radio de impacto.
- Localizar implementaciones o patrones reutilizables.
- Leer únicamente los símbolos o rangos necesarios.
- Registrar hechos, incertidumbres y riesgos técnicos sin diseñar la solución.

No hace:

- No toma decisiones de producto.
- No redacta la spec.
- No crea tareas.
- No implementa.

Artifact: `sdd/{change-name}/explore`, tipo `discovery`.

### 3. `lsar-spec`

Responsabilidad:

- Recuperar `analysis` y `explore` completos.
- Fijar alcance y fuera de alcance.
- Convertir resultados esperados en criterios identificados y verificables.
- Describir el comportamiento esperado y los casos límite relevantes.
- Definir el enfoque de alto nivel solo cuando afecte el contrato funcional.

No hace:

- No repite la exploración.
- No define cambios archivo por archivo.
- No crea tareas de implementación.

Artifact: `sdd/{change-name}/spec`, tipo `decision`.

Los criterios usan identificadores estables `C1`, `C2`, etc. Esos identificadores llegan intactos hasta `verify`.

### 4. `lsar-design`

Responsabilidad:

- Recuperar `analysis`, `explore` y `spec` completos.
- Definir archivos afectados, interfaces, flujo técnico y puntos de integración.
- Crear tareas pequeñas y ordenadas con identificadores `T1`, `T2`, etc.
- Relacionar cada tarea con uno o más criterios de la spec.
- Definir una validación mínima por tarea.

Lectura permitida:

- Puede leer un archivo o símbolo exacto señalado por `explore` para cerrar una ambigüedad puntual.
- No puede rehacer búsquedas amplias. Si la exploración es insuficiente, devuelve `blocked` y explica qué falta.

Artifact: `sdd/{change-name}/design`, tipo `architecture`.

Cada tarea tendrá este formato:

```markdown
- [ ] T1: {título}
  - Criterios: C1, C2
  - Cambio: {resultado técnico}
  - Archivos: {rutas}
  - Dependencias: {ids o ninguna}
  - Validación: {check enfocado}
```

Después de esta fase, el padre presenta alcance, archivos, plan, validación y riesgos. `lsar-coder` requiere una segunda aprobación explícita.

### 5. `lsar-coder`

Responsabilidad:

- Recuperar `analysis`, `spec` y `design` completos.
- Comprobar el estado real antes de editar.
- Implementar las tareas aprobadas en orden.
- Ejecutar el check enfocado de cada tarea.
- Actualizar en `design` únicamente el estado y la evidencia de las tareas.
- Guardar un informe propio en `coder`.

Persistencia:

1. Recupera el id y contenido actual de `sdd/{change-name}/design`.
2. Conserva diseño, decisiones y tareas existentes.
3. Cambia `[ ]` a `[x]` solo cuando exista evidencia.
4. Añade evidencia breve bajo la tarea completada.
5. Actualiza el artifact mediante `mem_update`.
6. Guarda `sdd/{change-name}/coder` con archivos cambiados, validaciones y desviaciones.

Si `coder` se ejecuta otra vez, recupera y combina el informe previo. No puede borrar progreso anterior ni marcar una tarea como hecha por declaración propia sin un check.

Artifact propio: `sdd/{change-name}/coder`, tipo `implementation`.

### 6. `lsar-verify`

Responsabilidad:

- Recuperar `analysis`, `spec`, `design` y `coder` completos.
- Verificar el código real sin confiar en el informe del escritor.
- Contrastar cada criterio `C*` y cada tarea `T*`.
- Ejecutar el check enfocado más pequeño que pueda detectar una regresión.
- Distinguir defecto introducido, problema preexistente y evidencia insuficiente.

Veredictos:

- `pass`: todos los criterios y tareas pasan con evidencia suficiente.
- `fail`: hay un incumplimiento observable o una tarea aprobada incompleta.
- `inconclusive`: el entorno impide comprobar uno o más puntos.

Antes de persistir, compara los conjuntos de identificadores. La tabla de verificación debe contener exactamente todos los `C*` de `spec` y todos los `T*` de `design`, una vez cada uno. Contar filas no basta porque puede ocultar ids duplicados u omitidos.

Artifact: `sdd/{change-name}/verify`, tipo `result`.

## Propiedad de Engram

| Topic key | Creador | Actualizador permitido |
| --- | --- | --- |
| `analysis` | `lsar-analysis` | `lsar-analysis` |
| `explore` | `lsar-explore` | `lsar-explore` |
| `spec` | `lsar-spec` | `lsar-spec` |
| `design` | `lsar-design` | `lsar-design`, luego `lsar-coder` solo para progreso y evidencia |
| `coder` | `lsar-coder` | `lsar-coder` |
| `verify` | `lsar-verify` | `lsar-verify` |

Reglas comunes:

- Toda fase persiste su artifact antes de responder.
- Toda lectura usa `mem_search` para localizar y `mem_get_observation` para recuperar el contenido completo.
- Todo `mem_save` usa `project`, `topic_key` y `capture_prompt: false` explícitos.
- Guardar el mismo `topic_key` debe hacer upsert, no crear otra observación.
- El padre no llama `mem_save` para ninguno de los seis topic keys.
- El padre puede guardar una decisión nueva que no esté cubierta por los artifacts.
- El resumen de sesión puede citar los topic keys y el veredicto final, pero no copiar el contenido de cada fase.

La captura automática de prompts de `gentle-engram` no es un artifact de fase. No se intentará corregir desde esta pipeline.

## Instrucciones controladas

No se crearán `SKILL.md` ni directorios vacíos.

Se documentará esta convención en `references/skills-controlled.md`:

```text
references/controlled-skills/{category}.md
```

Categorías reservadas, todavía inexistentes:

- `security`
- `nestjs`
- `javascript`
- `html`
- `pr`

Reglas:

- El padre decide si una instrucción aplica.
- El padre entrega al subagente la ruta exacta.
- El subagente lee esa ruta con `read`.
- No hay auto-discovery, comandos `/skill:*` ni herramienta Skill dentro del flujo.
- Ninguna fase puede cargar instrucciones no entregadas por el padre.
- Las instrucciones no alteran `next_recommended`.

`settings.json` cambiará `enableSkillCommands` a `false`. Este campo desactiva comandos de skills, no el descubrimiento global de skills del padre. Los subagentes usan `session_resources: lean` por defecto, por lo que no reciben skills, templates o contexto de inicio automáticamente. Las instrucciones controladas llegan solo por ruta.

## Archivos previstos

### Nuevos

- `agents/lsar-analysis.md`
- `agents/lsar-explore.md`
- `agents/lsar-spec.md`
- `agents/lsar-design.md`
- `references/skills-controlled.md`

### Actualizados

- `agents/lsar-coder.md`
- `agents/lsar-verify.md`
- `APPEND_SYSTEM.md`
- `references/sdd-phase-common.md`
- `sync-to-pi.sh`
- `settings.json`
- `README.md`

### Sin cambios

- `extensions/sdd-phase-summary.ts`: ya acepta cualquier agente y conserva compatibilidad al mantener `sdd/`.
- `extensions/model-router.ts`.
- `agents/lsar-security.md`.
- `gentle/`.
- `claude-design.md`.
- Los cuatro agentes antiguos.

## Ejecución por etapas

Cada etapa termina con una revisión antes de comenzar la siguiente. La sincronización al runtime global se reserva para el final.

### Etapa 1. Crear las cuatro fases read-only

Archivos:

- `agents/lsar-analysis.md`
- `agents/lsar-explore.md`
- `agents/lsar-spec.md`
- `agents/lsar-design.md`

Trabajo:

- Definir frontmatter y allowlists mínimos.
- Definir entradas, artifacts y Result Contract.
- Aplicar separación estricta entre análisis, exploración, spec y diseño.
- No cambiar todavía el orquestador.

Validación:

- Frontmatter válido.
- Ninguna fase tiene `edit`, `write`, `bash` o herramientas `subagent_*`.
- Cada fase guarda exactamente un artifact.
- Los `next_recommended` forman la cadena esperada.

Punto de control: revisar nombres, plantillas y responsabilidades.

### Etapa 2. Adaptar escritor y verificador

Archivos:

- `agents/lsar-coder.md`
- `agents/lsar-verify.md`

Trabajo:

- Reemplazar referencias a `manager`, `analyst`, `lead` y `research`.
- Añadir `mem_update` a `coder`.
- Implementar merge de progreso en `design` y `coder`.
- Añadir comprobación de cobertura por ids a `verify`.
- Mantener los tres veredictos actuales.

Validación:

- `coder` es el único agente con `edit` y `write`.
- `verify` no tiene herramientas de escritura.
- No queda dependencia de `research`.

Punto de control: revisar propiedad de artifacts y semántica de reanudación.

### Etapa 3. Cambiar contrato común y orquestación

Archivos:

- `references/sdd-phase-common.md`
- `APPEND_SYSTEM.md`

Trabajo:

- Sustituir la pipeline antigua por la nueva.
- Hacer que `analysis` cree `change-name`.
- Añadir las dos aprobaciones humanas.
- Prohibir al padre re-guardar artifacts de fase.
- Permitir únicamente referencias breves a los keys en el resumen de sesión.
- Mantener `lsar-security` opt-in.

Validación:

- No hay referencias activas a las cuatro fases antiguas.
- El padre no explora código dentro del flujo SDD.
- El padre no puede lanzar `explore` ni `coder` sin sus aprobaciones.

Punto de control: revisar el flujo completo antes de hacerlo sincronizable.

### Etapa 4. Preparar instrucciones controladas

Archivos:

- `references/skills-controlled.md`
- `settings.json`

Trabajo:

- Documentar ubicación, categorías y reglas de carga por ruta.
- Cambiar `enableSkillCommands` de `true` a `false`.
- No crear archivos de categoría.

Validación:

- JSON válido.
- No aparecen nuevos `SKILL.md`.
- No se añade ninguna dependencia.

Punto de control: confirmar que el mecanismo no depende del descubrimiento de Pi.

### Etapa 5. Actualizar sincronización y documentación

Archivos:

- `sync-to-pi.sh`
- `README.md`

Trabajo:

- Cambiar `SDD_AGENTS` a `lsar-analysis lsar-explore lsar-spec lsar-design lsar-coder lsar-verify`.
- Documentar pipeline, artifacts, aprobaciones y limpieza manual.
- No añadir eliminación automática al script.

Validación:

- `sh -n sync-to-pi.sh`.
- La lista `SDD_AGENTS` contiene solo las seis fases nuevas.
- El README no presenta los agentes antiguos como flujo activo.

Punto de control: revisar el diff completo. Todavía no sincronizar al runtime global.

### Etapa 6. Validación aislada

Trabajo:

1. Crear un directorio temporal.
2. Ejecutar `sync-to-pi.sh` con `PI_AGENT_DIR` apuntando al temporal.
3. Comprobar los archivos resultantes y la inyección del protocolo común.
4. Ejecutar diagnósticos sobre los archivos TypeScript solo si fueron modificados. En este plan no deberían cambiar.

Comprobaciones:

- Existen las seis definiciones nuevas en el runtime temporal.
- Las seis incluyen una sola copia del protocolo común.
- `lsar-security` no recibe el protocolo SDD.
- `settings.json` es JSON válido.
- No se modificó el runtime global.

Punto de control: presentar evidencia y pedir autorización independiente para activar.

### Etapa 7. Activación y prueba real

Requiere confirmación explícita porque modifica `~/.pi/agent` o el valor efectivo de `PI_AGENT_DIR`.

Trabajo:

1. Ejecutar `sync-to-pi.sh` contra el runtime aprobado.
2. Ejecutar `/reload` o reiniciar Pi.
3. Confirmar con `subagent_list_agents` que las seis definiciones nuevas están cargadas.
4. Ejecutar una tarea pequeña de prueba en una sesión donde el usuario autorice subagentes.

Prueba mínima:

- `analysis` crea el key y se detiene.
- El padre espera aprobación antes de `explore`.
- Las fases guardan seis artifacts sin copia del padre.
- El padre espera una segunda aprobación antes de `coder`.
- `coder` actualiza `design` sin borrar contenido.
- `verify` cubre todos los ids de spec y design.

Esta sesión prohíbe lanzar subagentes, por lo que la prueba real queda para otra sesión.

## Limpieza manual posterior

Fuera de esta implementación:

- Eliminar del repositorio, cuando se decida: `lsar-manager.md`, `lsar-analyst.md`, `lsar-lead.md`, `lsar-research.md`.
- Eliminar sus copias de `$PI_AGENT_DIR/agents/`.
- Ejecutar `/reload` o reiniciar Pi.
- Confirmar que ya no aparecen en `subagent_list_agents`.

Mientras no se haga esta limpieza, las definiciones antiguas pueden seguir visibles, pero el orquestador nuevo no debe invocarlas.

## Riesgos

1. `design` tiene propiedad secuencial compartida entre `lsar-design` y `lsar-coder`. El contrato debe limitar al coder a progreso y evidencia para evitar que reescriba decisiones aprobadas.
2. Los agentes antiguos coexistirán hasta la limpieza manual. Una invocación explícita por nombre todavía podría usarlos.
3. `enableSkillCommands: false` no desactiva el descubrimiento global de skills del padre. La garantía fuerte aplica a los subagentes en modo `lean` y a la política del orquestador.
4. Si CodeGraph no está inicializado en el proyecto objetivo, `explore` debe reportarlo y usar las herramientas read-only permitidas, no fingir evidencia.
5. La activación global no debe ejecutarse junto con las etapas de edición. Se valida primero en un directorio temporal.

## Criterios de aceptación de la implementación

- [ ] A1. La fuente contiene las seis definiciones nuevas con responsabilidades separadas.
- [ ] A2. `analysis` crea el key y exige aprobación antes de `explore`.
- [ ] A3. `design` produce tareas vinculadas a criterios de `spec`.
- [ ] A4. El padre exige aprobación antes de `coder`.
- [ ] A5. `coder` actualiza progreso en `design` y conserva un artifact propio.
- [ ] A6. `verify` comprueba todos los ids de criterios y tareas exactamente una vez.
- [ ] A7. El padre no guarda copias de artifacts de fase.
- [ ] A8. No existen comandos de workflow, OpenSpec ni lanzamiento automático de skills.
- [ ] A9. `enableSkillCommands` queda en `false` y no se crean skills de dominio.
- [ ] A10. El script sincroniza las seis fases nuevas sin borrar agentes antiguos.
- [ ] A11. La sincronización aislada termina correctamente.
- [ ] A12. La activación global y la prueba con subagentes requieren autorización separada.
