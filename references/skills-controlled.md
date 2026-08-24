# Instrucciones controladas

Las instrucciones controladas son instrucciones de dominio cargadas mediante una ruta exacta entregada por el padre; no son skills de Pi.

## Ubicación

La convención canónica es:

```text
references/{category}/{superficie}.md
```

Cada categoría es un directorio bajo `references/` y contiene un archivo por superficie. Los archivos planos directamente bajo `references/`, como `references/sdd-phase-common.md`, no son instrucciones controladas.

El acuerdo propuso `references/controlled-skills/{category}.md`, pero esa ruta no se adopta para evitar dos hogares para `security`: `references/security/` ya existe, tiene consumidor y está documentado. Migrarlo exigiría mover cuatro archivos y editar `agents/lsar-security.md` y `README.md`.

## Categorías

- `security` existe y contiene `references/security/browser-frontend.md`, `references/security/node-backend.md`, `references/security/supply-chain-ci.md` y `references/security/wordpress.md`. `lsar-security` las consume bajo demanda y reporta lo cargado en `profiles_loaded`.
- `nestjs`, `javascript`, `html` y `pr` están reservadas y todavía son inexistentes. Su contenido de dominio se añadirá en un cambio posterior, no en esta etapa.

## Reglas de carga

- El padre decide si una instrucción aplica.
- El padre entrega al subagente la ruta exacta.
- El subagente lee esa ruta con `read`.
- No hay auto-discovery, comandos `/skill:*` ni herramienta `Skill` dentro del flujo.
- Ninguna fase puede cargar instrucciones no entregadas por el padre.
- Las instrucciones no alteran `next_recommended`.

## No es un sistema de skills

No se crean `SKILL.md` ni directorios vacíos. `enableSkillCommands: false` desactiva los comandos de skills, pero no el descubrimiento global de skills del padre. Según el acuerdo de esta etapa, los subagentes usan `session_resources: lean` por defecto y no reciben skills, templates ni contexto de inicio automáticamente; por tanto, las instrucciones controladas llegan solo por ruta. El mecanismo no depende del descubrimiento de Pi.

## Relación con el Result Contract

`skill_resolution: paths-injected` significa que el padre entregó una o más rutas controladas; `skill_resolution: none` significa que no entregó ninguna. Una fase nunca declara `paths-injected` por rutas que encontró por su cuenta.
