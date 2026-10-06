# Avance del proyecto: Auto-Publicator

Última actualización: 6 de octubre de 2026 (fases 1-4) · Rama: `claude/nice-cerf-sjsfhv`

## Resumen

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Scaffold, login, conexión de Instagram, auditoría de marca y Brand Kit | ✅ Código · ⏳ falta probar con claves |
| 2 | Ideas y guiones con Claude, voz, clips de stock y render de video | ✅ Código · ⏳ falta probar con claves |
| 3 | Dashboard de aprobación y emails con enlace firmado | ✅ Código · ⏳ falta probar con claves |
| 4 | Scheduler y publicación automática en Instagram | ✅ Código · ⏳ falta probar con claves |
| 5 | Comentarios y DMs por palabra clave | ⬜ Pendiente |
| 6 | Servidor MCP, analíticas y Stripe | ⬜ Pendiente |

**Bloqueo actual:** conseguir las claves (checklist abajo) para probar las fases 1-4 de punta a punta.

---

## ✅ Fase 1: marca

- **Login** con enlace mágico por email (Supabase).
- **Conexión de Instagram** con Instagram Login; token cifrado (AES-256-GCM) y renovado automáticamente.
- **Auditoría de marca:** lee el sitio web (con protección SSRF) e Instagram, y Claude genera el **Brand Kit**.
- **Editor del Brand Kit** en `/brand`.

## ✅ Fase 2: producción de reels

- **`/ideas`:** Claude propone de 4 a 30 ideas repartidas entre tus pilares y a lo largo de 30 días.
  Puedes descartarlas o seleccionarlas y pulsar **Producir**.
- **Límite por plan:** free 10, self-serve 100 y done-for-you 130 reels al mes.
- **Worker** (`npm run worker`), que procesa la cola en este orden:
  1. Claude escribe el guion por escenas: hook, texto en pantalla, voz en off, búsqueda de clip,
     caption, hashtags y CTA.
  2. Voz en off con ElevenLabs, con tiempos por palabra para los subtítulos.
  3. Clips verticales de Pexels (sin repetir clip dentro del mismo reel).
  4. Render con Remotion: 1080×1920, colores, fuente y logo de la marca, subtítulos palabra a
     palabra, barra de progreso y CTA final.
  5. Sube el MP4 y la miniatura a Supabase Storage.
- **Reintentos:** hasta 3 por trabajo; después el reel queda como "Falló", con el error visible y
  un botón **Reintentar**.

## ✅ Fase 3: aprobación

- **`/reels`** con pestañas: Para aprobar · En producción · Programados · Publicados · Rechazados y fallidos.
  Se refresca sola mientras hay reels en producción.
- **Acciones:**
  - Aprobar y programar (si no eliges fecha, se usa el siguiente día libre a las 18:00 de tu zona horaria)
  - Pedir cambios (texto libre: Claude reescribe el guion y se vuelve a renderizar)
  - Editar el caption
  - Reprogramar
  - Quitar la aprobación
  - Rechazar
  - Reintentar
- **Email** cuando un reel está listo, con un enlace firmado a `/r/{token}` para revisarlo sin
  iniciar sesión. Caduca a los 14 días y deja de valer si el reel se regenera.
- **Historial** de cada acción en `approval_events`.
- **Regla central:** nada pasa a "Aprobado" sin una acción humana, y solo los reels aprobados
  se publican.

## ✅ Fase 4: publicación automática

- **Scheduler** dentro del worker: cada 30 s pasa a "Publicando" los reels aprobados cuya hora llegó
  y encola su publicación. Lo hace en una sola operación atómica, así que nunca se encola dos veces.
- **Publicación en Instagram:**
  1. Crea el contenedor `REELS`.
  2. Espera a que Instagram procese el video.
  3. Comprueba el límite diario de publicaciones.
  4. Publica y guarda el id y el enlace del post. El reel pasa a "Publicado", con un enlace **Ver en Instagram**.
- **Sin duplicados:** si el worker se cae justo después de publicar, el siguiente intento detecta
  que ya está publicado y lo recupera sin volver a publicarlo.
- **Límite diario agotado:** se aplaza 1 hora sin gastar reintentos.
- **Errores definitivos:** si Instagram rechaza el video, el token caducó o no hay cuenta conectada,
  el reel pasa a "Falló" con el motivo. **Reintentar** lo devuelve a "Pendiente de aprobación" para
  elegir otra fecha.
- **Prioridad:** publicar va antes que renderizar; también se puede tener un worker solo para publicar
  (`WORKER_KINDS=publish_reel`).
- **`/settings`:** zona horaria y hora de publicación por defecto, más las **3 mejores horas** según
  el engagement de tus últimas 50 publicaciones, con un botón para usarlas.

### Verificado

- [x] 63 tests unitarios. Incluyen 9 escenarios de publicación con un Instagram simulado (contenedor
  caducado, rechazado, lento, ya publicado, cuota agotada…) y el formato real de las llamadas a la API
- [x] Typecheck, lint y build de producción
- [x] Render real de un reel de ejemplo con la plantilla (`npm run render:sample`): MP4 H.264 1080×1920
- [x] Las 3 migraciones ejecutadas en Postgres embebido. Comprobados RLS, la cola atómica, el contador
  de uso y el scheduler (solo encola reels aprobados y vencidos, una única vez)
- [x] El worker arranca (solo se detiene por falta de claves)
- [ ] Login, OAuth de Instagram y auditoría con claves reales
- [ ] Guion y render con Claude, Pexels y ElevenLabs reales
- [ ] Email real con Resend
- [ ] Publicación real en una cuenta tester de Instagram

---

## 🔑 Checklist de claves

Copia `.env.example` a `.env.local` y rellena:

| Variable | Para qué | Dónde se consigue | Listo |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Base de datos y login | Supabase → Project Settings → API | [ ] |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Base de datos y login | Supabase → Project Settings → API | [ ] |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor y worker (⚠️ secreta) | Supabase → Project Settings → API | [ ] |
| `ANTHROPIC_API_KEY` | Auditoría, ideas y guiones | [console.anthropic.com](https://console.anthropic.com) → API Keys | [ ] |
| `INSTAGRAM_APP_ID` | Conectar Instagram | developers.facebook.com → tu app → Instagram → API setup with Instagram login | [ ] |
| `INSTAGRAM_APP_SECRET` | Conectar Instagram (⚠️ secreta) | Mismo lugar | [ ] |
| `TOKEN_ENCRYPTION_KEY` | Cifrar tokens | `openssl rand -base64 32` | [ ] |
| `APPROVAL_LINK_SECRET` | Firmar enlaces de email | `openssl rand -base64 32` | [ ] |
| `NEXT_PUBLIC_APP_URL` | Redirects y enlaces | Tu URL pública HTTPS (en local, ngrok o cloudflared) | [ ] |
| `PEXELS_API_KEY` | Clips de stock *(opcional)* | [pexels.com/api](https://www.pexels.com/api/) (gratis) | [ ] |
| `ELEVENLABS_API_KEY` | Voz en off *(opcional)* | [elevenlabs.io](https://elevenlabs.io) → Profile → API key | [ ] |
| `ELEVENLABS_VOICE_ID` | Voz concreta *(opcional)* | ElevenLabs → Voices → ID de la voz | [ ] |
| `RESEND_API_KEY` | Emails *(opcional)* | [resend.com](https://resend.com) → API Keys | [ ] |
| `EMAIL_FROM` | Remitente *(opcional)* | Dominio verificado en Resend, p. ej. `Reels <reels@tudominio.com>` | [ ] |

Las opcionales tienen un comportamiento por defecto: sin Pexels, fondos con degradado de marca;
sin ElevenLabs, video sin voz; sin Resend, el enlace de aprobación se escribe en el log del worker.

### Configuración adicional

**Supabase**
- [ ] Crear el proyecto
- [ ] Aplicar las 3 migraciones de `supabase/migrations/`, en orden
- [ ] Authentication → URL Configuration: añadir `{APP_URL}/auth/callback` a las Redirect URLs

**Meta / Instagram**
- [ ] Tener una cuenta de Instagram **profesional** (Business o Creator)
- [ ] Crear una app de tipo **Business** y añadir *Instagram → API setup with Instagram login*
- [ ] Registrar la redirect URI `{APP_URL}/api/instagram/callback` (HTTPS)
- [ ] Añadir tu cuenta como **Instagram tester** y aceptar la invitación
- [ ] Iniciar **App Review** y la verificación del negocio pronto (puede tardar semanas)

**Anthropic**
- [ ] Cargar saldo en la cuenta de la API

**Resend** (si quieres emails)
- [ ] Verificar un dominio para el remitente

---

## 🧪 Cómo probar todo cuando tengas las claves

1. `npm install`
2. Terminal 1: `npm run dev`. Terminal 2: `npm run worker`. Usa un túnel HTTPS hacia `localhost:3000`.
3. `/login` → entra con tu email.
4. `/dashboard` → **Conectar Instagram** → **Auditar mi marca** (entre 30 s y 2 min) → revisa `/brand`.
5. `/ideas` → **Generar ideas** → selecciona 1 o 2 → **Producir**.
6. `/reels` → pestaña *En producción*. El primer reel tarda unos minutos (guion, voz, clips y render).
7. Cuando pase a *Para aprobar*: revisa el video, pide un cambio y comprueba que se regenera; después
   apruébalo.
8. Comprueba el email (o el enlace en el log del worker) y abre `/r/...`.
9. Para probar la publicación, aprueba un reel con fecha a 6-10 minutos vista. En el log del worker
   verás `[scheduler]` y `[publish]`, y el reel aparecerá en *Publicados* con "Ver en Instagram".

Sin ninguna clave puedes ver la plantilla de video con `npm run render:sample` (genera
`out/sample.mp4`) o editarla en vivo con `npm run remotion:studio`.

---

## 📌 Decisiones tomadas

- **Next.js 16:** `middleware` ahora se llama `proxy` (`src/proxy.ts`).
- **Modelo:** `claude-opus-5-5` con esfuerzo `medium` para auditoría, ideas y guiones (se cambia
  con `ANTHROPIC_MODEL`). El fallback del servidor está activado.
- **Cola propia en Postgres** (`jobs` + `claim_job` con `SKIP LOCKED`) en lugar de Redis/BullMQ:
  una pieza menos de infraestructura. Se pueden lanzar varios workers.
- **El worker es un proceso aparte**, porque Remotion necesita Chromium y varios minutos por
  render. No puede ir en funciones serverless: hay que desplegarlo en un servidor o contenedor
  (Railway, Fly.io, un VPS…). La app web puede ir en Vercel.
- **Bucket público** para los videos: Instagram los descarga desde una URL pública al publicar.
- **Un workspace por usuario** por ahora; el esquema ya admite varios miembros.

## ⚠️ Limitaciones conocidas

- **Licencia de Remotion:** gratis hasta 3 personas en la empresa; por encima hace falta licencia
  de empresa.
- **Scraper:** las webs que solo se renderizan en el navegador (SPA) dan poco texto. Los colores
  salen solo del CSS.
- **Guarda SSRF:** no protege frente a DNS rebinding (aceptable por ahora).
- **Música de fondo:** el video aún no lleva (pendiente: biblioteca libre de derechos).
- **Uso:** el contador de reels se suma al pasar a producción, aunque luego se rechace el reel.
- **Rendimiento:** el render tarda aproximadamente lo que dura el video multiplicado por 1-2 en
  una CPU normal.

---

## 📜 Registro de avances

### 6 oct 2026: fase 4 (commit `bd512e7`)
- Scheduler en el worker y publicación de reels con la Content Publishing API de Instagram.
- Flujo de publicación idempotente, con recuperación tras caídas, aplazamiento por cuota y errores
  definitivos frente a reintentables.
- `/settings` con zona horaria, hora de publicación y mejores horas según el engagement.
- **Bugs encontrados y corregidos al revisar:**
  - Marcar un trabajo como fallido definitivo calculaba una fecha inválida (`4 ** número enorme`).
    Ahora existe una opción `permanent` explícita.
  - Un contenedor creado antes de editar el caption podía publicarse con el caption viejo. Ahora
    solo se reutiliza en reintentos del mismo trabajo.
  - La lista de zonas horarias se calculaba en el navegador y en el servidor, y podía no coincidir.
    Ahora se calcula solo en el servidor.

### 6 oct 2026: fases 2 y 3 (commit `f151eea`)
- Plan de ideas con Claude (`/ideas`) y paso a producción con límite mensual por plan.
- Worker: guion por escenas → voz (ElevenLabs) → clips (Pexels) → render (Remotion) → Storage → email.
- Cola de trabajos en Postgres con reintentos (`claim_job`, `SKIP LOCKED`).
- `/reels`: aprobar y programar, pedir cambios, editar caption, reprogramar, rechazar y reintentar.
- Email con enlace firmado y página pública `/r/[token]`.
- Video de ejemplo renderizado con la plantilla real (`npm run render:sample`).
- **Bugs encontrados y corregidos:**
  - "Reintentar" no volvía a renderizar si el guion ya existía (el worker ignoraba los reels en `queued`).
  - Remotion fallaba con la condición `react-server`; se sustituyó por un shim de `server-only` solo para el worker.

### 6 oct 2026: documento de avance (commit `ac4ee10`)
- Creado este `AVANCE.md` con el estado y la checklist de claves.

### 6 oct 2026: fase 1 (commit `e6873a2`)
- Scaffold con Next.js 16, login con Supabase, OAuth de Instagram, auditoría de marca, Brand Kit editable
  y esquema SQL completo con RLS.
- **Bugs encontrados y corregidos:**
  - `ftp://x.com` se aceptaba como `https://ftp://x.com`.
  - La migración usaba la extensión `pgcrypto`, que no hace falta (`gen_random_uuid()` viene incluida).
  - El scraper priorizaba logos de clientes sobre el de la marca y no leía colores `rgb()`.

---

## ⏭️ Siguiente: fase 5 (comentarios y DMs)

- [ ] Webhooks de Meta: verificación (`hub.challenge`) y firma `X-Hub-Signature-256`
- [ ] Guardar comentarios entrantes de los reels publicados (`comments`)
- [ ] Reglas de palabra clave (`keyword_rules`): si alguien comenta "GROW", responder al comentario
      y enviarle un DM privado con el enlace (Private Replies)
- [ ] Respuestas a comentarios generadas por Claude con la voz de la marca, en modo automático o
      con aprobación, más filtro de spam y toxicidad
- [ ] Bandeja de entrada en el dashboard (comentarios y DMs)

> La fase 5 necesita la app de Meta con los permisos `instagram_business_manage_comments` e
> `instagram_business_manage_messages`, y una URL HTTPS pública para los webhooks.
