import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { env } from './env.js'
import { estudiantesRouter }  from './routes/estudiantes.js'
import { asistenciaRouter }   from './routes/asistencia.js'
import { anotacionesRouter }  from './routes/anotaciones.js'
import { calificacionesRouter } from './routes/calificaciones.js'
import { configuracionRouter } from './routes/configuracion.js'

const app = new Hono()

// /health without prefix: used by the docker-compose healthcheck (direct container access,
// not through the gateway). The gateway would require JWT here, so we keep this path
// available at the container level only.
app.get('/health', (c) => c.json({ status: 'ok' }))

// All BFF routes are under /bff because the gateway routes by first path segment but
// does NOT strip it — it forwards the full URI to the upstream container.
app.route('/bff/estudiantes',    estudiantesRouter)
app.route('/bff/asistencia',     asistenciaRouter)
app.route('/bff/anotaciones',    anotacionesRouter)
app.route('/bff/calificaciones', calificacionesRouter)
app.route('/bff/configuracion',  configuracionRouter)

app.onError((err, c) => {
  console.error(`[bff] ${c.req.method} ${c.req.path} — ${err.message}`)
  return c.json({ status: 502, error: 'Bad Gateway', message: 'Upstream service unavailable' }, 502)
})

serve({ fetch: app.fetch, port: env.port }, () =>
  console.log(`[bff] Listening on :${env.port}`),
)
