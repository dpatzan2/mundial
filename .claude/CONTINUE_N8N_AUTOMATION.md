# Continuar: automatización de resultados (n8n + API-Football) + notificaciones

Pega este archivo completo (o su contenido) como primer mensaje en la nueva sesión de Claude Code, ya posicionado en `C:\Users\irvin\OneDrive\Documentos\REPO QUINIELAS`.

## Próximos pasos inmediatos (en este orden)

1. Correr `mcp__n8n-mcp__n8n_health_check` (mode="status"). Si conecta bien, seguir al punto 2. Si vuelve a fallar con el mismo error de SSRF, ver punto 1 de "Bloqueado / pendiente" (ya se aplicó el fix, puede que falte otro reinicio).
2. Confirmar con el usuario si ya se suscribió a la API **oficial** "API-Football" de api-sports (https://rapidapi.com/api-sports/api/api-football) — OJO, la key que mostró el 2026-08-27 era de una API distinta ("Free API Live Football Data"), ver punto 2 de "Bloqueado / pendiente".
3. Si n8n-mcp está disponible y la key es de la API correcta, construir el workflow completo en n8n (punto 3 — diseño ya cerrado).
4. Preguntar de nuevo si quiere pushear los 4 commits a `origin/main` (punto 4 — la última vez dijo que no).

No hace falta re-preguntar por los IDs de liga de las competencias ni por el secreto del webhook — ya están resueltos (ver abajo).

## Contexto

App de quinielas (Next.js + Prisma + Postgres/Supabase) en `C:\Users\irvin\OneDrive\Documentos\REPO QUINIELAS`. Objetivo: dejar de actualizar resultados a mano. Se automatiza con n8n + API-Football (RapidAPI), y se agregó un sistema de notificaciones in-app. URL de producción: **https://previa-puce.vercel.app**

## Ya hecho (backend completo, 4 commits en `main`, local, todavía NO pusheados a origin)

```
0cbf8a3 feat(admin): map competitions to an API-Football league id
6d1580a feat(notifications): add in-app notification system
818722b feat(api): add webhook integration with n8n / API-Football
e6caa8a feat(db): add API-Football integration fields and notification models
```

Antes de nada, correr `git log --oneline -6` y `git status` para confirmar que siguen ahí y no hay cambios sin commitear.

### Modelos/campos nuevos (prisma/schema.prisma)
- `Competition.apiFootballLeagueId` (Int? único)
- `CompetitionMatch.externalFixtureId` (Int? único)
- `Notification` / `NotificationRecipient`

### Endpoints creados (`src/lib/football-integration.ts` + rutas)
- `POST /api/integrations/football/resolve-fixtures`
  Body: `{ fixtures: [{ fixtureId, leagueId, homeTeamName, awayTeamName, kickoffAtUtc }] }`
  Responde: `{ resolved: [{ fixtureId, matchId }], linked }`
  Cruza cada fixture con `CompetitionMatch` por liga (`Competition.apiFootballLeagueId`) + nombre de equipo normalizado + cercanía de kickoff, y graba `externalFixtureId`.

- `POST /api/integrations/football/result`
  Body exacto pedido por el usuario: `{ fixture_id, home_score, away_score, status }`
  Busca el match por `externalFixtureId`, valida `status` en `[FT, AET, PEN]`, actualiza marcador, llama `recalculateScoresInScope` (misma lógica que la acción manual `saveCompetitionMatchResultAction`), y genera notificaciones in-app para las salas de esa competencia.

- Auth de ambos: header `X-Webhook-Secret: <secret>` o `Authorization: Bearer <secret>`, comparación timing-safe contra `process.env.FOOTBALL_INTEGRATION_SECRET`.
- **El valor real del secreto ya está en `.env` local** (`FOOTBALL_INTEGRATION_SECRET`) — leerlo de ahí cuando se configure la credencial en n8n, no hace falta pedírselo al usuario ni volver a generarlo. También falta agregarlo a las env vars de producción en Vercel (recordárselo al usuario).

### Notificaciones in-app
- `GET /api/v1/notifications`, `POST /api/v1/notifications/[id]/read`, `POST /api/v1/notifications/read-all`.
- Componente `NotificationBell` ya integrado en `src/app/layout.tsx` (header móvil + sidebar).

### Admin UI
- Campo "ID de liga en API-Football" en crear/editar competencia (`src/app/admin/new/page.tsx`, `src/app/admin/[competitionId]/page.tsx`, acciones en `src/app/actions.ts`).

### Competencias existentes en la base (verificado, agosto 2026)
| id | nombre | status | apiFootballLeagueId |
|---|---|---|---|
| cmrglh6lt000048p537bwvd8c | Champions League 2026-2027 | DRAFT | **2** ✅ (seteado 2026-08-27) |
| cmrxl2jfe0000qfp5kxnhjpr7 | Copa Centroamericana Concacaf 2026 | ACTIVE | **16** ✅ (confirmado por el usuario y seteado 2026-08-27) |

✅ Confirmado con el usuario: "Copa Centroamericana Concacaf 2026" SÍ es la CONCACAF Champions Cup de clubes. Ambos IDs ya están escritos en la base de producción (vía script puntual con Prisma + adapter pg, mismo patrón que `src/lib/db.ts`, no quedó nada en el repo). No hace falta volver a preguntar ni volver a setear esto.

## ⚠️ BLOQUEANTE NUEVO (2026-08-27, sesión de continuación): el plan Free de API-Football NO sirve para este caso de uso

Se resolvieron los dos pendientes de la sesión anterior:
- n8n-mcp conecta bien (fix SSRF confirmado con `n8n_health_check`).
- La key de RapidAPI daba 404 en `https://rapidapi.com/api-sports/api/api-football` (listado no encontrado). Se usó en su lugar la vía **directa** de api-sports: `https://v3.football.api-sports.io` con header `x-apisports-key` (misma forma de datos, no cambia el backend). El usuario se registró ahí y pasó una key real, validada contra `/status`: plan Free, activo, `limit_day: 100` (100 requests/día, no al mes — dato que el usuario había visto en otro lado no aplicaba a esta vía).

**Pero al probar `/fixtures` de verdad con las dos ligas reales apareció un bloqueo del plan Free que invalida el diseño tal como está:**

```
GET /fixtures?league=2&season=2026   -> {"errors":{"plan":"Free plans do not have access to this season, try from 2022 to 2024."}}
GET /fixtures?league=16&season=2026  -> mismo error
```

Es decir: **Champions League (id 2) y CONCACAF Champions Cup (id 16) — las dos competencias que la app necesita — están bloqueadas en temporada actual (2026) en el plan Free.** El plan Free solo deja consultar esas ligas en temporadas 2022-2024 (histórico), sin importar si se pide por `season` o por `date`+`league` (probé ambas combinaciones, mismo error). Curiosamente, `GET /fixtures?date=2026-08-27` **sin** `league` sí devuelve datos reales de 2026 (143 resultados, ligas como NWSL, ligas regionales de Brasil, etc.) — el free tier sí da datos en vivo, pero solo para ligas "no premium". Champions League y competencias de clubes grandes están específicamente gateadas a histórico en el plan gratuito.

**Conclusión: con un plan Free (de RapidAPI o directo, es la misma restricción de api-sports) es imposible traer resultados actuales de estas dos competencias.** Hace falta un plan pago. Según búsqueda rápida (2026-08-27), API-Football/api-sports arranca en ~$19/mes (plan "Pro") e incluye todas las competencias y temporadas actuales — confirmar precio y límites exactos en https://www.api-football.com/pricing antes de pagar.

**Estado del workflow en n8n:** ya está completo y armado (17 nodos, ID `Dr6Fdw3buZQsCTeC`, nombre "Quinielas - Resultados API-Football"), validado sin errores (`n8n_validate_workflow`), con reintentos automáticos en los 4 nodos HTTP. **Queda INACTIVO a propósito** — no tiene sentido activarlo hasta resolver el plan pago, porque con Free el paso de resolve-fixtures siempre va a traer 0 partidos para estas ligas. Las credenciales ya están creadas en n8n:
- `API-Football (api-sports direct)` (id `5oHJ1EFs3AReCmHq`) — header `x-apisports-key`, con la key real del usuario ya cargada.
- `Quinielas Football Webhook Secret` (id `dR7Aoz3yNiPYsCb9`) — header `X-Webhook-Secret`, con el secreto real de `.env` ya cargado.

**Próximo paso pendiente de decisión del usuario:** ¿upgradear a un plan pago de api-sports (~$19/mes), buscar una alternativa gratuita que sí cubra estas ligas, o dejar el resultado manual por ahora y no activar la automatización? No asumir una respuesta — preguntar de nuevo si no quedó resuelto en esta misma sesión.

### ✅ RESUELTO en la misma sesión (2026-08-27, más tarde): se descartó API-Football del todo — nuevo diseño con AI Agent + Tavily + Gemini

Se evaluó TheSportsDB (gratis, cubre las dos competencias, confirmado con llamadas reales) como alternativa, pero el usuario prefirió no depender de datos crowd-sourced. Se evaluó scraping directo (ESPN tiene un endpoint JSON no oficial `site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard` que sí cubre ambas ligas — slugs `uefa.champions` y `concacaf.champions` — pero **empezó a bloquear con Akamai bot-protection** a la segunda llamada seguida; no es confiable para un cron desatendido y no vale la pena pelear contra esa protección).

**Diseño final (idea del usuario): AI Agent de n8n con búsqueda web, no scraping ni API de datos deportivos.** En vez de pedirle el resultado a una API de fútbol, un nodo AI Agent (LangChain, en n8n) con un modelo Gemini y una tool de búsqueda web (Tavily) busca el resultado en la web y lo devuelve como JSON estructurado.

**Cambio de arquitectura importante:** ya no hace falta "resolver fixtures" contra ningún proveedor externo. La agenda de partidos (equipos, fecha de kickoff) sale de **nuestra propia base de datos** (la que el admin ya carga a mano para que la gente pueda hacer sus picks antes de que empiece el partido) — no hacía falta un paso de matching externo, eso era solo necesario cuando dependíamos de un fixture ID ajeno.

**Cambios de backend ya hechos y con `npx tsc --noEmit` limpio:**
- `src/lib/football-integration.ts`: se agregó `applyMatchResult(prisma, matchId, homeScore, awayScore)` (lógica compartida, extraída de la ruta `/result` original: actualiza marcador, recalcula puntos, notifica, revalida paths) y `getPendingAutomatedMatches(db)` (devuelve partidos de competencias con `apiFootballLeagueId` seteado —campo reusado como bandera de "automatización habilitada", ya no se usa para llamar a esa API— cuyo kickoff ya pasó o es dentro de las próximas 24h y que todavía no tienen resultado).
- **Nueva ruta** `GET /api/integrations/football/pending-matches`: reemplaza a `resolve-fixtures` para este flujo. Devuelve `{ matches: [{ matchId, competitionName, homeTeamName, awayTeamName, kickoffAtUtc }] }`. Misma auth (`X-Webhook-Secret` / `Authorization: Bearer`).
- **Nueva ruta** `POST /api/integrations/football/result-by-match`: variante de `/result` que identifica el partido por `match_id` (nuestro id interno) en vez de `fixture_id` (externalFixtureId de un proveedor). Body: `{ match_id, home_score, away_score, status }`.
- La ruta original `POST /api/integrations/football/result` (por `fixture_id`/externalFixtureId) se dejó intacta por si en el futuro se retoma una API de datos deportivos — ahora usa `applyMatchResult` por dentro, sin duplicar lógica.
- Labels del admin (`src/app/admin/new/page.tsx`, `src/app/admin/[competitionId]/page.tsx`): el campo que decía "ID de liga en API-Football" ahora dice "Habilitar automatización de resultados" (ya no menciona API-Football, que no se usa más).
- **Todavía no se corrió `npm run build` ni se probó en el navegador** — solo typecheck. Falta probar el flujo admin (crear/editar competencia) y las dos rutas nuevas antes de dar esto por 100% terminado del lado backend.

**Workflow nuevo en n8n:** `Quinielas - Resultados via AI Agent (Tavily + Gemini)`, ID `uhmRqoN39K1sgZRi`, 14 nodos, **validado sin errores** (`n8n_validate_workflow`), **inactivo**. Flujo: Cron diario 01:00 → GET `pending-matches` (nuestra base) → loop por partido (Split In Batches) → espera hasta kickoff+150min → **AI Agent** (Gemini 2.5 Flash + tool Tavily) busca el resultado y responde JSON estricto (`{status, home_score, away_score}` o `{status:"PENDING"}`) → si terminó (FT/AET/PEN) → POST `result-by-match`; si no → espera 20min y reintenta (loop). Prompt del agente instruido para preferir "PENDING" antes que arriesgar un marcador incorrecto.

El workflow viejo de api-sports (`Quinielas - Resultados API-Football`, ID `Dr6Fdw3buZQsCTeC`) se dejó tal cual, inactivo, sin tocar — por si algún día se paga un plan de api-sports. No se borró nada.

**Credenciales creadas en n8n (esta sesión), todas con PLACEHOLDER, faltan los valores reales:**
- `Tavily Search API` (httpHeaderAuth, id `KieKgdauQKaryq8q`) — header `Authorization`, valor debe ser `Bearer <tavily-key>`. Registrarse gratis en tavily.com (1000 créditos/mes gratis, recurrente, sin tarjeta).
- `Google Gemini (Quinielas)` (googlePalmApi, id `SBQVViuQmvxbW1hc`) — campo `apiKey`. Conseguir key gratis en aistudio.google.com (free tier de Google AI Studio, sin tarjeta).
- (Las credenciales de api-sports y el webhook secret de sesiones anteriores siguen igual, ya con valores reales.)

**Próximos pasos pendientes (en orden):**
1. Conseguir key real de Tavily y de Gemini (el usuario se registra en ambos sitios). Pedir que las pegue en la UI de n8n directamente si se puede (credenciales de arriba), o en el chat si prefiere — se van a usar una sola vez para probar y cargar en n8n, sin volver a mostrarlas.
2. Probar cada pieza por separado antes de un test end-to-end: (a) `curl` directo a Tavily `/search` con la key real, (b) `curl` directo a Gemini `generateContent` con la key real, (c) probar `GET /api/integrations/football/pending-matches` contra prod (necesita al menos un partido con `apiFootballLeagueId` seteado y kickoff próximo/pasado sin resultado — ya hay dos competencias con eso seteado, ver más arriba).
3. `n8n_test_workflow` NO sirve para este workflow (el trigger es Schedule, no webhook/form/chat) — probar manualmente desde la UI de n8n ("Test workflow" / ejecutar nodo por nodo), no hay forma de dispararlo por MCP.
4. No activar hasta ver al menos una ejecución de prueba completa (AI Agent devolviendo JSON válido) revisada a mano.
5. Falta agregar `FOOTBALL_INTEGRATION_SECRET` a las env vars de producción en Vercel (recordatorio de sesiones anteriores, sigue pendiente).
6. Seguir sin pushear los 4+ commits a origin/main hasta que el usuario confirme (preguntado de nuevo esta sesión: dijo que todavía no).

## Bloqueado / pendiente (histórico, de la sesión anterior — resuelto arriba salvo lo del plan pago)

1. **n8n-mcp**: la sesión del 2026-08-27 conectó bien (`ToolSearch("n8n")` cargó las 21 herramientas), pero `n8n_health_check` falló con `"SSRF protection: Localhost access is blocked in strict mode"`. Causa: la versión actual de n8n-mcp (2.73.0) trae protección SSRF activada por defecto en modo `strict`, que bloquea cualquier URL localhost — nuevo respecto a sesiones anteriores (probablemente el paquete se actualizó). Fix: agregar `WEBHOOK_SECURITY_MODE=moderate` (permite localhost, sigue bloqueando IPs privadas RFC1918 y metadata de cloud — correcto para una instancia n8n local de confianza) al bloque `env` del servidor `n8n-mcp` en `C:\Users\irvin\.claude.json` (scope proyecto `C:/Users/irvin`). La edición directa fue bloqueada por el clasificador de auto mode (archivo sensible con credenciales), así que se aplicó con un script de Node que el usuario corrió él mismo vía `! node ...` (reemplazo de texto puntual, sin reparsear todo el JSON). **El fix ya está aplicado en el archivo** — falta reiniciar Claude Code para que el subproceso de n8n-mcp arranque con la variable nueva y confirmar con `n8n_health_check` que conecta.

2. **RapidAPI key**: el 2026-08-27 el usuario mandó una captura de RapidAPI con una key ya generada (`X-RapidAPI-Key`, app `default-application_12273850`), pero la captura mostraba la página de la API **"Free API Live Football Data"** (host `free-api-live-football-data.p.rapidapi.com`, endpoint `/football-players-search`), **NO** la API oficial **"API-Football" de api-sports** (host `api-football-v1.p.rapidapi.com`) sobre la que está diseñado todo el workflow (IDs de liga 2/16, campos `fixture.id`/`teams.home.name`/`status.short`/`goals.home`, etc. son específicos de api-sports). Son productos distintos con forma de datos distinta — la key de esa captura no sirve tal cual para nuestro diseño. La captura se revisó y se borró del disco (contenía la key en texto plano) después de extraer el dato.
   - Pendiente: confirmar con el usuario que se suscribió específicamente en https://rapidapi.com/api-sports/api/api-football (tiene plan gratuito limitado). Como las keys de RapidAPI son por "app" (cuenta), es probable que la MISMA key sirva una vez suscrito ahí también — solo hay que usar el host correcto (`api-football-v1.p.rapidapi.com`) en la credencial de n8n, no el de "Free API Live Football Data".
   - Construir igual toda la estructura del workflow en n8n (nodos, lógica, endpoints) dejando la credencial de RapidAPI creada pero con un placeholder / sin valor real.
   - Que el usuario pegue la key real directamente en la credencial dentro de la UI de n8n (mejor no pedirle que la pegue en el chat, por seguridad — ya pasó una vez y tocó borrar la captura).
   - No activar el workflow hasta confirmar que la credencial tiene un valor real, apunta al host de api-sports, y que al menos una llamada de prueba a `/fixtures` responde bien.

3. **Construir el workflow en n8n vía n8n-mcp** (diseño ya cerrado, solo falta ejecutar):
   a. Trigger: Cron diario 01:00 AM.
   b. HTTP Request GET a `https://api-football-v1.p.rapidapi.com/v3/fixtures?date={hoy}&league=2&season={año}` y otra igual con `league=16` (credencial RapidAPI: headers `x-rapidapi-host`/`x-rapidapi-key`).
   c. Combinar/aplanar ambas respuestas.
   d. POST a `https://previa-puce.vercel.app/api/integrations/football/resolve-fixtures` con `fixtures` mapeando: `fixture.id`→`fixtureId`, `league.id`→`leagueId`, `teams.home.name`→`homeTeamName`, `teams.away.name`→`awayTeamName`, `fixture.date`→`kickoffAtUtc`. Quedarse solo con los `resolved`.
   e. Loop (Split In Batches) por cada fixture resuelto:
      - Calcular kickoff + 150 min.
      - Wait node hasta esa fecha/hora exacta.
      - GET `https://api-football-v1.p.rapidapi.com/v3/fixtures?id={fixtureId}`.
      - IF `status.short` en `[FT, AET, PEN]` → seguir; si no (`LIVE`, `HT`, `ET`, etc.) → Wait 20 min y volver a consultar (loop).
      - POST a `https://previa-puce.vercel.app/api/integrations/football/result` con `{ fixture_id, home_score: goals.home, away_score: goals.away, status: status.short }`, header `X-Webhook-Secret` con el valor de `FOOTBALL_INTEGRATION_SECRET`.
   f. Credenciales a crear en n8n: (1) RapidAPI — pendiente de key real del usuario; (2) Header Auth para nuestro webhook, con el secreto ya generado (leer de `.env`).
   g. Activar el workflow solo cuando la credencial de RapidAPI tenga un valor real confirmado por el usuario.

4. **Push a origin/main**: preguntado el 2026-08-27, el usuario dijo **todavía no** — dejar los 4 commits solo locales, no volver a pushear sin preguntar de nuevo (puede que la respuesta cambie en otra sesión, así que preguntar otra vez, no asumir "no" para siempre).

## Archivos clave si hace falta releer código
- `src/lib/football-integration.ts`
- `src/app/api/integrations/football/resolve-fixtures/route.ts`
- `src/app/api/integrations/football/result/route.ts`
- `src/app/api/v1/notifications/*`
- `src/components/NotificationBell.tsx`
- `prisma/schema.prisma`
