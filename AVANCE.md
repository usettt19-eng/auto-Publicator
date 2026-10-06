# Avance del proyecto: Auto-Publicator

Última actualización: 6 de octubre de 2026 (fases 1-6: todo el código) · Rama: `claude/nice-cerf-sjsfhv`

## Resumen

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Scaffold, login, conexión de Instagram, auditoría de marca y Brand Kit | ✅ Código · ⏳ falta probar con claves |
| 2 | Ideas y guiones con Claude, voz, clips de stock y render de video | ✅ Código · ⏳ falta probar con claves |
| 3 | Dashboard de aprobación y emails con enlace firmado | ✅ Código · ⏳ falta probar con claves |
| 4 | Scheduler y publicación automática en Instagram | ✅ Código · ⏳ falta probar con claves |
| 5 | Comentarios y DMs por palabra clave, respuestas con IA | ✅ Código · ⏳ falta probar con claves |
| 6 | Servidor MCP, analíticas con resumen semanal y pagos con Stripe | ✅ Código · ⏳ falta probar con claves |

**Estado:** las 6 fases están programadas. **Bloqueo actual:** conseguir las claves (checklist abajo)
para probar todo de punta a punta con cuentas reales.

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

## ✅ Fase 5: comentarios y DMs

- **Webhook** `/api/webhooks/instagram`: verificación de Meta y firma `X-Hub-Signature-256`. Guarda
  cada comentario y DM una sola vez aunque Meta reenvíe el evento.
- **`/automations`, reglas de palabra clave:** si alguien comenta "GROW" (o lo que configures),
  respondemos al comentario (opcional) y le enviamos un **DM privado con el enlace**.
  - También funcionan en los DMs que te envían.
  - Plantillas con `{usuario}` y `{link}`, contador de veces activada, y opción de activar o
    desactivar cada regla.
- **Respuestas con IA al resto de comentarios**, en 3 modos:
  - *Desactivadas*
  - *Con aprobación* (Claude sugiere y tú apruebas)
  - *Automáticas*
  
  Claude clasifica el comentario (pregunta, elogio, queja, spam, tóxico…) y no responde al spam ni
  a los tóxicos.
- **`/inbox`:** respuestas por aprobar (editables), historial de comentarios y conversación de DMs.
- **Seguridad:**
  - Nunca responde a comentarios de tu propia cuenta (sin bucles).
  - Cada paso se marca al completarse para no duplicar respuestas en un reintento.
  - Dos clics en "Responder" no envían dos respuestas.
- El worker atiende primero publicar y responder, y después los renders.
- **Cabecera adaptada a móvil:** la navegación se desplaza en horizontal.

## ✅ Fase 6: MCP, analíticas y pagos

- **Servidor MCP** en `/api/mcp`: usa Auto-Publicator desde Claude Code, Claude Desktop u otro
  cliente MCP.
  - 13 herramientas: Brand Kit, ideas, producir, listar, aprobar, pedir cambios, rechazar,
    reprogramar, analíticas, reglas de palabra clave y responder comentarios.
  - Las claves de API se crean en **Ajustes → Conector MCP**. Se muestran una sola vez y en la base
    de datos solo se guarda su hash. Se pueden revocar.
- **`/analytics`:**
  - Totales: reproducciones, alcance, engagement, guardados y compartidos.
  - Rendimiento por pilar y por formato.
  - Tabla de reels, en vista de 7 o 30 días.
- **Métricas automáticas:** cada 6 h el worker lee las métricas de los reels de los últimos 30 días.
- **Resumen semanal con Claude:** cada lunes escribe logros, aprendizajes y recomendaciones con
  cifras, y **añade 3-5 ideas al plan** (ajuste del calendario). También se puede generar con un botón.
- **`/billing` con Stripe:** plan actual y uso del mes, pago (Checkout) y portal del cliente para
  cambiar de plan, actualizar la tarjeta o cancelar. Un webhook mantiene el plan sincronizado.
  Solo el dueño puede pagar.

### Verificado

- [x] 92 tests unitarios. Incluyen:
  - 9 escenarios de publicación con un Instagram simulado (contenedor caducado, rechazado, lento, ya
    publicado, cuota agotada…) y el formato real de las llamadas a la API.
  - Palabras clave, plantillas, decisiones sobre comentarios, parseo de webhooks y firma.
  - El servidor MCP probado con un cliente MCP real: lista las 13 herramientas, valida argumentos y
    devuelve los errores.
  - Estadísticas, lectura de métricas, semana y planes de Stripe.
- [x] Con la app arrancada:
  - MCP rechaza peticiones sin clave (401).
  - Stripe rechaza webhooks sin firma (400) y responde 500 si la BD falla, para que reintente.
- [x] Gráficos de `/analytics` renderizados y revisados en escritorio y móvil
- [x] Webhook probado con la app arrancada: verificación de Meta, firma inválida rechazada (401) y
  500 cuando la BD falla, para que Meta reintente
- [x] Typecheck, lint y build de producción
- [x] Render real de un reel de ejemplo con la plantilla (`npm run render:sample`): MP4 H.264 1080×1920
- [x] Las 5 migraciones ejecutadas en Postgres embebido. Comprobados:
  - RLS (las claves de un workspace no las ve otro y no se pueden crear desde el navegador).
  - La cola atómica, el contador de uso y el scheduler.
  - La idempotencia de comentarios y DMs.
  - Las tareas periódicas: sin duplicados y sin informe repetido en la misma semana.
- [x] El worker arranca (solo se detiene por falta de claves)
- [ ] Login, OAuth de Instagram y auditoría con claves reales
- [ ] Guion y render con Claude, Pexels y ElevenLabs reales
- [ ] Email real con Resend
- [ ] Publicación real en una cuenta tester de Instagram
- [ ] Webhooks reales de comentarios y DMs (palabra clave → DM)
- [ ] Conectar el MCP desde Claude Code con una clave real
- [ ] Pago de prueba en Stripe (modo test) y cambio de plan

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
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Verificar los webhooks de Meta | Lo inventas tú (cualquier texto largo) y lo pegas en Meta | [ ] |
| `STRIPE_SECRET_KEY` | Pagos *(opcional)* | Stripe → Developers → API keys (`sk_test_…` para pruebas) | [ ] |
| `STRIPE_WEBHOOK_SECRET` | Pagos *(opcional)* | Stripe → Developers → Webhooks → tu endpoint → Signing secret | [ ] |
| `STRIPE_PRICE_SELF_SERVE` / `STRIPE_PRICE_DONE_FOR_YOU` | Precios de los planes *(opcional)* | Stripe → Product catalog → precio mensual → ID `price_…` | [ ] |
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
- [ ] Aplicar las 5 migraciones de `supabase/migrations/`, en orden
- [ ] Authentication → URL Configuration: añadir `{APP_URL}/auth/callback` a las Redirect URLs

**Meta / Instagram**
- [ ] Tener una cuenta de Instagram **profesional** (Business o Creator)
- [ ] Crear una app de tipo **Business** y añadir *Instagram → API setup with Instagram login*
- [ ] Registrar la redirect URI `{APP_URL}/api/instagram/callback` (HTTPS)
- [ ] Añadir tu cuenta como **Instagram tester** y aceptar la invitación
- [ ] **Webhooks:** callback `{APP_URL}/api/webhooks/instagram`, el verify token y suscripción a
      `comments` y `messages`
- [ ] Iniciar **App Review** y la verificación del negocio pronto (puede tardar semanas)

**Anthropic**
- [ ] Cargar saldo en la cuenta de la API

**Stripe** (si quieres cobrar)
- [ ] Crear los 2 productos con precio mensual
- [ ] Webhook a `{APP_URL}/api/webhooks/stripe` con `checkout.session.completed` y `customer.subscription.*`
- [ ] Activar el *Customer portal*

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
10. Crea una regla en `/automations` (p. ej. GROW), comenta "grow" en un reel desde otra cuenta y
    comprueba la respuesta y el DM. Pon el modo IA en *Con aprobación* y revisa `/inbox`.
11. En **Ajustes → Conector MCP** crea una clave y conéctala en Claude Code con el comando que
    aparece. Pídele "¿qué reels tengo pendientes de aprobar?".
12. En `/billing`, paga el plan Self-serve con la tarjeta de prueba `4242 4242 4242 4242` y
    comprueba que el límite sube a 100.

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

### 6 oct 2026: fase 6
- Servidor MCP con 13 herramientas y claves de API, analíticas con métricas automáticas y resumen
  semanal con Claude que añade ideas al plan, y pagos con Stripe (checkout, portal y webhook).
- **Bugs encontrados y corregidos al revisar:**
  - Al renderizar la página de analíticas para revisarla: cada fila de barras calculaba su propio
    ancho, así que las barras **no eran comparables entre sí**. Ahora todas tienen la misma
    longitud de pista.
  - Los porcentajes mezclaban "6,4 %" y "6.2 %". Ahora usan siempre el formato español.

### 6 oct 2026: fase 5 (commit `689526b`)
- Webhooks de Meta, reglas de palabra clave con respuesta pública y DM privado, respuestas a
  comentarios con Claude (apagado, con aprobación o automático), bandeja de entrada y página de
  automatizaciones.
- **Bugs encontrados y corregidos al revisar:**
  - Al probar el webhook con la app arrancada: si la BD fallaba al buscar la cuenta, el error se
    ignoraba, se respondía 200 y **el comentario se perdía** (Meta no reintenta tras un 200). Ahora
    responde 500.
  - El mismo patrón en el procesamiento: sin reglas por un fallo de BD, una palabra clave podía
    acabar respondida por la IA en lugar de enviar el DM. Ahora se reintenta.
  - La cabecera con 6 secciones se desbordaba en móvil.

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

## ⏭️ Siguiente: probar con claves reales y desplegar

Todo el código de las 6 fases está hecho. Pasos para ponerlo en marcha:

1. **Claves y configuración:** completar la checklist de arriba.
2. **Prueba de punta a punta:** seguir los pasos de "Cómo probar todo" y anotar aquí los fallos.
3. **Despliegue:**
   - App web en Vercel.
   - Worker en Railway, Fly.io o un VPS (necesita Chromium para Remotion).
   - Supabase en producción.
4. **App Review de Meta** con un screencast de cada permiso.

**Mejoras opcionales** para después:

- OAuth en el servidor MCP (lo exigen los conectores personalizados de claude.ai).
- Música de fondo libre de derechos en los videos.
- Invitar a otros miembros al workspace.
- Contar el uso al publicar en lugar de al producir.
