---
description: Look up a GitHub issue or PR in the current repo (gh CLI, read-only)
argument-hint: "[pr|is] <number|url>"
---

Consulta esta referencia de GitHub y presenta únicamente la información obtenida. Argumentos del usuario: $@

## Uso aceptado

Solo se aceptan exactamente estas tres formas:

1. `pr <N|URL>` — consultar un pull request.
2. `is <N|URL>` — consultar un issue.
3. `<N|URL>` — consultar por número o URL y determinar el tipo cuando corresponda.

Sin argumentos, o si el primer argumento no es `pr`, `is`, un entero positivo o una URL válida de `github.com`, muestra estas tres formas y no invoques `gh`. Si hay argumentos extra (por ejemplo, `pr 10 20`), usa el primer argumento válido y advierte que los demás se ignoran. Normaliza `#N` y los ceros a la izquierda antes de invocar `gh`.

Una URL válida debe coincidir exactamente con el patrón `https://github.com/<owner>/<repo>/(issues|pull)/<N>`. Una URL malformada, de otro host o con otro segmento (como `discussions` o `commit`) es un error de uso: muestra la sintaxis y no invoques `gh`.

## Resolver (solo lectura)

- Para una entrada numérica (`pr N`, `is N` o `N` suelto), usa siempre el repositorio detectado en el directorio de trabajo y nunca añadas `-R`.
- Para una URL, extrae `owner`, `repo`, el tipo del segmento (`issues` = issue, `pull` = PR) y `N`. Usa siempre ese tipo y `-R <owner>/<repo>`; no ejecutes la desambiguación. Si `pr` o `is` contradice el segmento de la URL, prevalece la URL y avisa de la discrepancia en una línea.
- Un subcomando explícito (`pr` o `is`) anula la desambiguación y despacha directamente al tipo indicado.
- Para un número suelto, realiza como única clasificación `gh api repos/<owner>/<repo>/issues/<N>` (GET), usando el owner/repo del repositorio actual. Si la respuesta contiene la clave `pull_request`, es un PR; en caso contrario, es un issue. Después consulta el tipo clasificado.

Para un issue, ejecuta:
`gh issue view <N> [ -R <owner>/<repo> ] --json number,title,state,author,labels,assignees,createdAt,updatedAt,body,comments`

Para un PR, ejecuta:
`gh pr view <N> [ -R <owner>/<repo> ] --json number,title,state,isDraft,author,baseRefName,headRefName,body,comments,reviews,statusCheckRollup,files,mergedAt`

En los comandos anteriores, `[ -R <owner>/<repo> ]` significa que `-R` se incluye únicamente cuando el origen es una URL. Para PR también ejecuta `gh pr checks <N> [ -R <owner>/<repo> ]` y, si `files` no ofrece un resumen legible, `gh pr diff <N> --name-only [ -R <owner>/<repo> ]`. No hagas polling ni esperes: reporta checks `pending` tal como estén.

## Presentar

Responde en español, sin perder información técnica del cuerpo. Para un issue incluye número, título, estado (`open`/`closed`), autor, labels, assignees, fechas de creación/actualización, cuerpo y comentarios. Para un PR incluye número, título, estado (`open`/`closed`/`merged` y `draft` si aplica), autor, rama base y head, cuerpo, comentarios, reviews, estado de checks y resumen de archivos cambiados. Cita literalmente título, estado y cuerpo; termina en la información consultada.

Si hay demasiados comentarios o un diff demasiado grande, conserva la metadata completa y los comentarios/checks recientes, declara explícitamente que la salida fue truncada y nunca lo omitas en silencio.

## Errores y prohibiciones

Ante cualquier fallo de `gh` (404/403, número inexistente, autenticación, red o remoto no GitHub), reporta el mensaje real de `gh`, indica el repositorio y número consultados cuando aplique, y detente. No inventes contenido, no lo infieras del contexto y no uses fallbacks como `curl`, scraping, búsquedas alternativas o API anónima.

Está prohibido ejecutar `gh issue comment|close|reopen|edit|create|delete`, `gh pr comment|close|reopen|merge|edit|create|review|ready`, o `gh api` con `--method`/`-X` distinto de `GET` o con `-f`/`-F`/`--input`. Solo están permitidos `view`, `checks`, `diff` y `gh api` con método GET. No realices ninguna escritura en GitHub ni en el repositorio local.
