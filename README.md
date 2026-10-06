# Auto-Publicator

Plataforma que crea, programa y publica reels de Instagram con IA (Claude) a partir del sitio
web y la identidad de marca del usuario. Nada se publica sin aprobación humana.

## Estado por fases

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Scaffold, auth, conexión de Instagram, auditoría de marca y Brand Kit editable | ✅ |
| 2 | Generación de guiones y render de video (Remotion) | Pendiente |
| 3 | Dashboard de aprobación y emails | Pendiente |
| 4 | Scheduler y auto-posting | Pendiente |
| 5 | Comentarios y DMs por palabra clave | Pendiente |
| 6 | Servidor MCP, analíticas y Stripe | Pendiente |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth y RLS) ·
Anthropic SDK · Instagram API con Instagram Login · Vitest.

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
tests/                      Tests de cifrado, guarda SSRF, extracción y Brand Kit
```

## Puesta en marcha

1. `npm install`
2. `cp .env.example .env.local` y rellena las variables (ver abajo).
3. Aplica la migración: `supabase db push`, o pega
   `supabase/migrations/20261006000000_initial_schema.sql` en el SQL Editor.
4. `npm run dev` y abre http://localhost:3000

Comandos: `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`.

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
