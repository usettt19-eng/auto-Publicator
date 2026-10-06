# Auto-Publicator

Plataforma que crea, programa y publica reels de Instagram con IA (Claude) a partir del sitio
web y la identidad de marca del usuario. Nada se publica sin aprobación humana.

## Estado por fases

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Scaffold, auth, conexión de Instagram, auditoría de marca y Brand Kit editable | ✅ |
| 2 | Calendario de ideas, guiones con Claude y render de video (Remotion) | ✅ |
| 3 | Dashboard de aprobación y emails con enlace firmado | ✅ |
| 4 | Scheduler y auto-posting en Instagram | ✅ |
| 5 | Comentarios y DMs por palabra clave, respuestas con IA | ✅ |
| 6 | Servidor MCP, analíticas y Stripe | Pendiente |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth y RLS) ·
Anthropic SDK · Instagram API con Instagram Login · Remotion · Pexels · ElevenLabs · Resend ·
Vitest.

## Estructura

```
supabase/migrations/        Esquema SQL completo (todas las fases) con RLS
src/proxy.ts                Refresco de sesión de Supabase y protección de rutas
src/lib/
  env.ts                    Variables de entorno
  crypto.ts                 AES-256-GCM para los tokens de Instagram
  supabase/                 Clientes de servidor (sesión del usuario) y admin (service role)
  workspace.ts              Usuario actual y su workspace
  instagram/api.ts          OAuth, tokens de larga duración, perfil y publicaciones
  instagram/accounts.ts     Guardado cifrado y renovación automática de tokens
  scraper/                  Scraping del sitio con protección SSRF, colores, fuentes y logo
  brand-kit/schema.ts       Esquema Zod del Brand Kit y normalización
  brand-kit/generate.ts     Llamada a Claude con structured outputs
  brand-kit/audit.ts        Orquestación: scraping → Instagram → Claude → BD
src/app/
  login, auth/              Enlace mágico de Supabase
  dashboard/                Onboarding: conectar Instagram, auditar y ver el resumen
  brand/                    Editor del Brand Kit
  api/instagram/            Inicio y callback de OAuth
  api/audits/               Iniciar una auditoría (POST) y consultar su estado (GET)
  ideas/                    Plan de ideas con Claude y paso a producción
  reels/                    Revisión: aprobar, programar, pedir cambios, rechazar
  r/[token]/                Revisión desde el email, sin iniciar sesión
src/lib/reels/              Esquemas, estados, calendario, cola de trabajos, producción y revisión
src/lib/media/              Clips de Pexels y voz de ElevenLabs
src/lib/approval-token.ts   Enlaces firmados (HMAC) de aprobación por email
src/lib/email.ts            Email "reel listo para revisar" (Resend)
src/remotion/               Plantilla de video 9:16 con la identidad de la marca
src/lib/reels/publish-flow.ts Publicación idempotente (contenedor → FINISHED → cuota → publish)
src/lib/reels/best-hours.ts Mejores horas según el engagement histórico
src/worker/handlers.ts      Trabajos del worker: guion → render → email · publicación
  settings/                 Zona horaria, hora de publicación y mejores horas
  inbox/                    Bandeja: aprobar respuestas, comentarios y DMs
  automations/              Reglas de palabra clave y modo de respuesta con IA
  api/webhooks/instagram/   Webhooks de Meta (verificación + firma)
src/lib/engagement/         Palabras clave, parseo de webhooks, respuestas con Claude y procesamiento
scripts/worker.ts           Bucle del worker (npm run worker)
scripts/render-sample.ts    Render de ejemplo sin claves (npm run render:sample)
tests/                      Tests unitarios
```

## Puesta en marcha

1. `npm install`
2. `cp .env.example .env.local` y rellena las variables (ver abajo).
3. Aplica las migraciones de `supabase/migrations/` en orden: `supabase db push`, o pega cada
   archivo en el SQL Editor.
4. `npm run dev` y abre http://localhost:3000
5. En otra terminal, `npm run worker` (procesa guiones y renders).

Comandos: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run worker`, `npm run render:sample` (video de ejemplo en `out/`) y `npm run remotion:studio`
(editor visual de la plantilla).

### Supabase

- Authentication → URL Configuration: añade `http://localhost:3000/auth/callback` (y la URL de
  producción) a las Redirect URLs.
- El login usa enlaces mágicos por email (proveedor Email activado).
- `SUPABASE_SERVICE_ROLE_KEY` solo se usa en el servidor: para guardar los tokens de Instagram y
  escribir los resultados de las auditorías.

### App de Meta (Instagram API con Instagram Login)

1. En [developers.facebook.com](https://developers.facebook.com) crea una app de tipo
   **Business** y añade el producto **Instagram → API setup with Instagram login**.
2. Copia el *Instagram app ID* y el *Instagram app secret* en `INSTAGRAM_APP_ID` e
   `INSTAGRAM_APP_SECRET`.
3. En *Business login settings*, añade la redirect URI
   `{NEXT_PUBLIC_APP_URL}/api/instagram/callback`. Debe usar HTTPS, así que en local usa un túnel
   (ngrok o cloudflared) y pon esa URL en `NEXT_PUBLIC_APP_URL`.
4. Permisos que solicita la app:
   - `instagram_business_basic`: perfil y publicaciones (auditoría)
   - `instagram_business_content_publish`: publicar reels (fase 4)
   - `instagram_business_manage_comments`: responder comentarios (fase 5)
   - `instagram_business_manage_messages`: DMs (fase 5)
5. **App Review:** mientras la app está en modo desarrollo solo funciona con cuentas añadidas
   como testers (*App roles → Roles → Instagram testers*, y el tester debe aceptar la invitación
   desde Instagram). Para usuarios reales hay que pasar App Review con un screencast de cada
   permiso y verificar el negocio. Puede tardar semanas, así que conviene iniciarlo pronto.
6. Solo funcionan cuentas **profesionales** (Business o Creator).

Los tokens de larga duración caducan a los 60 días. `getAccessToken()` los renueva
automáticamente cuando les quedan menos de 7 días.

### Claude

`ANTHROPIC_API_KEY` es obligatoria. La auditoría usa `claude-opus-5-5` por defecto
(`ANTHROPIC_MODEL` lo cambia), con adaptive thinking, esfuerzo `medium` y structured outputs
validados con Zod. Además activa el fallback del servidor (`fallbacks: "default"`): si el modelo
rechaza la petición por política, la API la reintenta con un modelo de respaldo.

## Cómo funciona la auditoría

1. `POST /api/audits` valida la URL, crea un registro `brand_audits` y responde `202`. El trabajo
   sigue en segundo plano con `after()`.
2. El scraper descarga la home y hasta 4 páginas clave (about, servicios, productos, tienda…).
   Comprueba que cada host y cada redirección resuelvan a IPs públicas, limita el tamaño (2 MB) y
   el tiempo (10 s). Después extrae textos, colores (CSS en línea y hojas de estilo), fuentes,
   logo y redes sociales.
3. Si hay una cuenta de Instagram conectada, lee el perfil y las últimas 30 publicaciones.
4. Claude genera el Brand Kit (voz, público, productos, identidad visual, pilares, CTAs y
   hashtags), se normaliza y se guarda en `brand_kits` y `content_pillars`.
5. El dashboard consulta el estado cada 3 s y, al terminar, muestra el resumen. En `/brand` se
   edita todo el Brand Kit.

> En producción conviene mover la auditoría a una cola (BullMQ o Supabase Queues) si supera el
> `maxDuration` de tu plataforma. La tabla `jobs` ya existe para ello.

## Producción de reels (fases 2 y 3)

```
/ideas ──Claude──▶ reel_ideas ──"Producir"──▶ reels (queued) + job generate_script
                                                      │  worker
                       Claude escribe el guion por escenas ◀┘
                       ▼
             job render_reel: voz (ElevenLabs) + clips (Pexels) + Remotion → MP4 en Storage
                       ▼
             reels (ready) + email con enlace firmado /r/{token}
                       ▼
     Aprobar (+ fecha) → approved   ·   Pedir cambios → nueva revisión   ·   Rechazar → rejected
```

- **Límites por plan** (`src/lib/plans.ts`): free 10, self-serve 100 y done-for-you 130 reels al
  mes. Se comprueban al pasar ideas a producción.
- **Cola:** tabla `jobs` + función `claim_job` (`FOR UPDATE SKIP LOCKED`), así que puedes lanzar
  varios workers. Cada trabajo se reintenta hasta 3 veces (30 s, 2 min); después el reel pasa a
  `failed` con el error visible y un botón "Reintentar".
- **Video:** 1080×1920 a 30 fps. Usa los colores primarios, la primera fuente (Google Fonts) y
  el logo del Brand Kit, con subtítulos palabra a palabra. Sin `PEXELS_API_KEY` usa fondos con
  degradado de marca; sin `ELEVENLABS_API_KEY` no hay voz y la duración sale del guion.
- **Aprobación:** nada pasa a `approved` sin una acción humana. Si no eliges fecha, se programa en
  el siguiente día libre a la `posting_hour` del workspace (18:00 por defecto, en su zona horaria).
  Los enlaces del email caducan a los 14 días y dejan de valer si el reel se regenera. La página
  del enlace exige pulsar un botón, así que los escáneres de email no pueden aprobar por error.
- **Almacenamiento:** el bucket `reels` es público porque Instagram necesita descargar el video
  desde una URL pública. Las rutas llevan UUIDs y solo el servidor puede escribir.
- **Worker:** necesita Chromium. Remotion lo descarga solo; si ya tienes uno, indícalo en
  `REMOTION_BROWSER_EXECUTABLE`. No puede ejecutarse en funciones serverless; usa un servidor o
  contenedor (Railway, Fly.io, un VPS…) o Remotion Lambda más adelante.
- **Licencia de Remotion:** es gratis para particulares y empresas de hasta 3 personas. Por encima,
  necesitas una licencia de empresa (remotion.pro).

## Publicación automática (fase 4)

```
reel approved + scheduled_at alcanzada
   │  scheduler del worker (cada 30 s): enqueue_due_publications()
   ▼  approved → publishing + job publish_reel (atómico, sin duplicados)
contenedor REELS (video_url público + caption) ── se guarda ig_container_id
   ▼  esperar status_code = FINISHED (hasta 4 min; si no, reintento reutilizando el contenedor)
comprobar cuota de 24 h ── agotada → se aplaza 1 h sin gastar intento
   ▼
media_publish → ig_media_id + permalink → published (+ uso reels_published)
```

**Garantías contra duplicados**

- Solo el scheduler pasa un reel de `approved` a `publishing`, y lo hace en una única sentencia
  con `FOR UPDATE SKIP LOCKED`.
- Si el worker muere después de publicar pero antes de guardar, el siguiente intento ve el
  contenedor en `PUBLISHED`. Entonces busca el reel entre las publicaciones recientes (por caption
  y fecha) y lo marca como publicado sin volver a publicar.
- Un contenedor solo se reutiliza en reintentos del mismo trabajo. En una nueva aprobación se crea
  otro, porque el caption pudo cambiar.

**Errores**

- Si Instagram rechaza el video (`ERROR`), el token caducó o no hay cuenta conectada, el reel pasa
  a `failed` sin más reintentos.
- "Reintentar" devuelve el reel a *Pendiente de aprobación* para elegir otra fecha.
- Los fallos de red se reintentan hasta 3 veces.

**Prioridad**

- Los trabajos `publish_reel` se atienden antes que los renders.
- Con `WORKER_KINDS=publish_reel` puedes tener un worker dedicado solo a publicar.

## Comentarios y DMs (fase 5)

```
Meta ──webhook──▶ /api/webhooks/instagram  (firma X-Hub-Signature-256 con INSTAGRAM_APP_SECRET)
                   │ guarda comments/dms (idempotente por id de Instagram) y encola el trabajo
                   ▼ worker
   ¿palabra clave? ──sí──▶ respuesta pública (opcional) + DM privado con el enlace
        │no
        ▼ modo IA: off → nada · approval → sugerencia en /inbox · auto → Claude responde
```

**Configuración en Meta** (App Dashboard → Instagram → API setup with Instagram login → Webhooks)

1. Callback URL: `{NEXT_PUBLIC_APP_URL}/api/webhooks/instagram`
2. Verify token: el valor de `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
3. Suscríbete a los campos `comments` y `messages`.
4. La cuenta tiene que estar suscrita a la app. Ocurre al conectar Instagram con los permisos
   `instagram_business_manage_comments` e `instagram_business_manage_messages`.

**Comportamiento**

- **Palabras clave:** sin distinguir mayúsculas ni tildes y solo como palabra completa ("GROW" no
  coincide con "GROWTH"). Si varias coinciden, gana la más larga. Las plantillas admiten
  `{usuario}` y `{link}`.
- **DM al comentar una palabra clave:** usa *private replies* de Instagram (un DM por comentario,
  hasta 7 días después). En los DMs entrantes, la regla responde dentro de la ventana de 24 h.
- **Sin bucles:** nunca se responde a comentarios de la propia cuenta.
- **Sin duplicados:**
  - Cada paso (respuesta pública y DM) se marca al completarse, así que un reintento no lo repite.
  - Desde la bandeja, el envío reclama el comentario de forma atómica: dos clics no envían dos
    respuestas.
- **Respuestas con IA:** Claude clasifica cada comentario (pregunta, elogio, queja, spam,
  tóxico…). No responde al spam ni a los tóxicos, y no inventa precios ni promesas.
- **Errores de base de datos:** el webhook responde 500 para que Meta reintente; no se pierden eventos.
