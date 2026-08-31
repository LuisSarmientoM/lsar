# Referencia privada: WordPress security

## Objetivo

Guía de revisión de seguridad para código PHP de WordPress: plugins, themes, hooks, REST API, AJAX, options/meta, shortcodes, uploads y admin/frontend.

## Cuándo cargarla

Carga esta referencia cuando el diff incluya archivos `.php` de un proyecto WordPress, o archivos que registren hooks, endpoints REST/AJAX, shortcodes, plantillas o funciones de admin.

## Checks

### Autenticación, autorización y nonces

- Cada acción sensible debe usar `current_user_can()` con el capability mínimo adecuado; un nonce no sustituye la autenticación ni la autorización.
- Comprueba ownership o capacidad a nivel de objeto cuando la acción afecte a un post, usuario, attachment u otro recurso concreto.
- Usa `wp_nonce_field()` / `check_admin_referer()` / `check_ajax_referer()` o `wp_verify_nonce()` como medida anti-CSRF; los nonces se entregan al cliente y pueden verse comprometidos, así que nunca los uses como secreto, prueba de identidad o autorización.
- No asumas que `is_admin()`, `admin_init` o un nonce AJAX implican que el usuario está autorizado para el objeto o la acción.

### Entradas y salidas por contexto

- Identifica la fuente: `$_GET`, `$_POST`, `$_COOKIE`, `$_SERVER`, `$_FILES`, body JSON, parámetros REST/AJAX, atributos de shortcode o URL. Evita `$_REQUEST` porque mezcla fuentes.
- Valida primero: rango, formato, allowlist o esquema según el caso. No apliques una función de sanitización genérica como solución única.
- WordPress añade slashes a `$_GET`, `$_POST`, `$_COOKIE` y `$_SERVER`; usa `wp_unslash()` antes de validar/sanitizar esos valores, pero no por defecto para `$_FILES`, JSON u otras fuentes.
- Sanitiza al ingresar según el tipo de dato: `sanitize_text_field()`, `sanitize_email()`, `absint()`, `esc_url_raw()`, `wp_kses_post()`, `map_deep()`, etc.
- Escapa tarde y según el sink de salida: `esc_html()`, `esc_attr()`, `esc_url()`, `esc_js()`, `wp_kses()`. No combines sanitización y escaping indiscriminadamente.
- No uses datos de entrada directamente en consultas, sinks de archivo, redirecciones ni salidas sin validar/sanitizar/escapar según el contexto.

### Base de datos: `$wpdb`

- Usa `$wpdb->prepare()` para cualquier consulta con valores dinámicos; nunca concatenes ni interpoles datos directamente en SQL.
- Usa `%d`, `%f` y `%s` para valores y déjalos sin comillas. Evita placeholders de string numerados o con formato (`%1$s`, `%5s`) en código nuevo: por compatibilidad histórica `$wpdb->prepare()` no añade sus comillas; si ya existen, verifica que la consulta las aporte correctamente.
- Los nombres de tabla, columna e identificadores dinámicos deben validarse contra una allowlist fija. No uses backticks como defensa contra inyección de identificadores.
- El placeholder `%i` para identificadores se incorporó en WP 6.2; debe comprobarse soporte con `$wpdb->has_cap( 'identifier_placeholders' )`.

### REST API y AJAX

- En REST, define una `permission_callback` explícita y efectiva; devuelve `WP_Error` con códigos apropiados cuando la authz falle.
- Define `args`/`schema` con `validate_callback` y `sanitize_callback` por campo. No asumas que estar autenticado autoriza la acción sobre el objeto.
- En AJAX, distingue `wp_ajax_*` (autenticado) de `wp_ajax_nopriv_*` (público). Un nonce AJAX no es autorización; sigue validando `current_user_can()` y ownership.
- Aplica rate limiting solo a operaciones públicas costosas o abusables (búsquedas, envío de formularios, APIs públicas). No reportes la ausencia de rate limiting como vulnerabilidad automáticamente.

### Options, meta y transients

- Prefiere Settings API con `register_setting()` y `sanitize_callback` para opciones administrables; valida capabilities antes de guardar.
- Para meta sensible, comprueba capability, ownership del objeto y necesidad real de almacenar el dato; evalúa cifrado u otra API adecuada según el threat model.
- Revisa `update_option`, `add_option`, `update_post_meta`, `update_user_meta`, etc., cuando el valor provenga de entrada de usuario.
- `autoload` es un factor de rendimiento, no access control; evita autoloading de opciones grandes o secretos no necesarios en la mayoría de peticiones.
- No recomiendes JSON por defecto para estructuras: WordPress serializa legítimamente arrays y objetos. Reporta deserialización insegura solo cuando los datos sean controlados por un atacante.

### Uploads y archivos

- Valida tipo MIME real, extensión y tamaño. No confíes únicamente en `$_FILES['file']['type']`.
- Usa `wp_check_filetype_and_ext()` y `wp_handle_upload()`/`wp_handle_sideload()` con los filtros adecuados.
- Revisa capabilities antes de permitir cualquier carga.
- Evita path traversal en rutas derivadas de entrada; no escribas archivos subidos en directorios ejecutables.
- Rastrea inclusión, ejecución y descargas de archivos: `include`/`require`, `eval`, `file_get_contents`, descargas directas y generación de URLs de attachments. Asegúrate de que las descargas estén autorizadas.

### Shortcodes

- Los atributos y el contenido de un shortcode son entrada no confiable; valida, sanitiza y escapa según el sink final.
- No formules `do_shortcode()` como una operación que requiera capability por sí misma. Rastrea qué shortcodes son alcanzables y qué efectos o sinks (consultas, salida, archivos, redirecciones) pueden disparar.

### SSRF, redirects, ejecución y deserialización

- Para URLs no confiables, prefiere `wp_safe_remote_get()` / `wp_safe_remote_post()` y valida esquema y host con allowlist cuando sea posible.
- Revisa `wp_redirect()` frente a `wp_safe_redirect()`; valida redirecciones abiertas antes de enviar el header.
- Rastrea sinks de filesystem (`file_get_contents`, `fopen`, `unlink`, `include`/`require`), proceso (`exec`, `system`, `passthru`) y evaluación dinámica (`eval`, `create_function`).
- `unserialize()` de datos controlados por el atacante es un riesgo alto. Reporta deserialización insegura solo cuando la entrada provenga de una fuente atacante.

### Admin vs frontend

- `is_admin()` describe contexto de ejecución, no identidad ni confianza. Sigue requiriendo `current_user_can()` y nonce.
- Revisa hooks públicos y exposición de datos: el frontend puede filtrar información sensible a través de AJAX/REST o shortcodes alcanzables sin autenticación.

### Secretos y logging

- No incluyas tokens de sesión, API keys, credenciales, PII ni otros secretos innecesarios en logs o mensajes de error, ni los devuelvas a destinatarios no autorizados. Los nonces se entregan al cliente y se asumen compromisibles: no son secretos, ni prueba de autenticación ni autorización, aunque no deben enviarse fuera de su contexto ni registrarse sin necesidad.
- No almacenes secretos en texto claro en options/meta/transients/cookies sin evaluar el threat model y usar la API adecuada (hash, cifrado, secretos de entorno, etc.).

## Límites

- No revises stacks que no sean WordPress/PHP salvo que el padre lo solicite.
- No reportes como vulnerables patrones escapados/sanitizados correctamente por el framework.
- Exige un flujo fuente→sink concreto, mitigaciones presentes y explotabilidad real antes de reportar un problema.
- No reportes la ausencia de hardening general como una vulnerabilidad automática.
- No hagas claims de CVE ni de versión afectada sin verificar la versión en el código o lockfile.
- No ejecutes comandos destructivos, instalación de plugins ni modificaciones en la base de datos.
