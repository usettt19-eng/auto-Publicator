# Avance del proyecto: Auto-Publicator

Última actualización: 6 de octubre de 2026 · Rama: `claude/nice-cerf-sjsfhv`

## Resumen

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Scaffold, login, conexión de Instagram, auditoría de marca y Brand Kit | ✅ Código terminado · ⏳ falta probar con claves reales |
| 2 | Guiones con Claude y render de video (Remotion) | ⬜ Pendiente |
| 3 | Dashboard de aprobación y emails | ⬜ Pendiente |
| 4 | Scheduler y publicación automática | ⬜ Pendiente |
| 5 | Comentarios y DMs por palabra clave | ⬜ Pendiente |
| 6 | Servidor MCP, analíticas y Stripe | ⬜ Pendiente |

**Bloqueo actual:** conseguir las claves (ver checklist abajo) para probar la fase 1 con cuentas reales.

---

## ✅ Fase 1: hecho

- **Login** con enlace mágico por email (Supabase). `/dashboard` y `/brand` requieren sesión.
- **Conexión de Instagram** con Instagram Login. El token dura 60 días, se guarda cifrado
  (AES-256-GCM) y se renueva solo cuando le quedan menos de 7 días.
- **Auditoría de marca:**
  - Lee la home y hasta 4 páginas clave del sitio, con protección SSRF, límite de 2 MB y de 10 s.
  - Extrae textos, colores (hex y `rgb()`), fuentes, logo y redes sociales.
  - Si Instagram está conectado, añade el perfil y las últimas 30 publicaciones.
  - Claude genera el **Brand Kit** con structured outputs validados con Zod.
- **Dashboard** de onboarding en 3 pasos, con el progreso de la auditoría en vivo.
- **Editor del Brand Kit** en `/brand`: voz, público, colores, fuentes, pilares, CTAs y hashtags.
- **Base de datos:** esquema completo para las 6 fases, con RLS por workspace. Los tokens de
  Instagram no se pueden leer desde el navegador.

### Verificado

- [x] 26 tests unitarios (cifrado, guarda SSRF, extracción y Brand Kit)
- [x] Typecheck, lint y build de producción
- [x] Scraper probado contra un sitio real (github.com)
- [x] Migración SQL ejecutada en Postgres embebido; RLS comprobado (un usuario no ve ni escribe en el workspace de otro)
- [ ] Login real con Supabase
- [ ] OAuth real con una cuenta de Instagram
- [ ] Auditoría completa con Claude sobre tu sitio web

---

## 🔑 Checklist de claves

Copia `.env.example` a `.env.local` y rellena:

| Variable | Dónde se consigue | Listo |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | [ ] |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | [ ] |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (⚠️ secreta) | [ ] |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys | [ ] |
| `INSTAGRAM_APP_ID` | developers.facebook.com → tu app → Instagram → API setup with Instagram login | [ ] |
| `INSTAGRAM_APP_SECRET` | Mismo lugar que el App ID (⚠️ secreta) | [ ] |
| `TOKEN_ENCRYPTION_KEY` | Genérala tú: `openssl rand -base64 32` | [ ] |
| `NEXT_PUBLIC_APP_URL` | Tu URL pública HTTPS (en local, la de ngrok o cloudflared) | [ ] |

### Configuración adicional

**Supabase**
- [ ] Crear el proyecto
- [ ] Aplicar `supabase/migrations/20261006000000_initial_schema.sql` (SQL Editor o `supabase db push`)
- [ ] Authentication → URL Configuration: añadir `{APP_URL}/auth/callback` a las Redirect URLs

**Meta / Instagram**
- [ ] Tener una cuenta de Instagram **profesional** (Business o Creator)
- [ ] Crear una app de tipo **Business** en developers.facebook.com
- [ ] Añadir el producto Instagram → *API setup with Instagram login*
- [ ] Registrar la redirect URI `{APP_URL}/api/instagram/callback` (tiene que ser HTTPS)
- [ ] Añadir tu cuenta como **Instagram tester** y aceptar la invitación desde Instagram
- [ ] Iniciar **App Review** y la verificación del negocio pronto (puede tardar semanas)

**Anthropic**
- [ ] Cargar saldo en la cuenta de la API

---

## 🧪 Cómo probar la fase 1 cuando tengas las claves

1. `npm install` y `npm run dev` (con un túnel HTTPS apuntando a `localhost:3000`).
2. Entra con tu email en `/login` y abre el enlace que te llegue.
3. En `/dashboard`, pulsa **Conectar Instagram** y autoriza la app.
4. Escribe la URL de tu web y pulsa **Auditar mi marca** (tarda entre 30 s y 2 min).
5. Revisa el resumen y edita el Brand Kit en `/brand`.

Si algo falla, el error queda guardado en la tabla `brand_audits` (columna `error`) y se muestra
en el dashboard.

---

## 📌 Decisiones tomadas

- **Next.js 16:** `middleware` ahora se llama `proxy` (`src/proxy.ts`).
- **Modelo:** `claude-opus-5-5` con esfuerzo `medium` (se cambia con `ANTHROPIC_MODEL`). El
  fallback del servidor está activado: si el modelo rechaza la petición, la API reintenta con otro.
- **La auditoría corre en segundo plano** con `after()` y un límite de 5 minutos. Si el hosting
  corta antes, habrá que pasarla a una cola (la tabla `jobs` ya existe).
- **Un workspace por usuario** por ahora; el esquema ya admite varios miembros.

## ⚠️ Limitaciones conocidas

- Webs que se renderizan solo en el navegador (SPA sin SSR) dan poco texto al scraper. Si hace
  falta, se puede añadir Playwright más adelante.
- Los colores salen solo del CSS en línea y de las primeras 4 hojas de estilo; no se analizan
  imágenes.
- La guarda SSRF valida el DNS antes de cada petición, pero no protege frente a DNS rebinding.
  Es aceptable para la fase 1; se puede reforzar fijando la IP resuelta.

---

## ⏭️ Siguiente: fase 2 (no necesita las claves de Meta para empezar)

- [ ] Calendario mensual de ideas a partir de los pilares (`reel_ideas`)
- [ ] Guion por escenas: hook, texto en pantalla, voz en off, B-roll, caption y CTA (`reels.script_json`)
- [ ] Plantillas de Remotion 9:16 con los colores, fuentes y logo del Brand Kit, y subtítulos animados
- [ ] TTS para la voz en off (proveedor por decidir: ElevenLabs u otro → **otra clave más**)
- [ ] Clips de stock (Pexels API → **clave gratuita**)
- [ ] Cola de render con reintentos y límites por plan

> Claves extra que necesitará la fase 2: **Pexels** (gratis) y un proveedor de **TTS**.
> Puedes ir pidiéndolas junto con las demás.
