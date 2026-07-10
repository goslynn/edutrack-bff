/**
 * Reportes — CRUD + ejecución proxies to MS-Report.
 *
 * Definitions (+ Jasper template) and executions live entirely inside MS-Report —
 * no composition needed, everything is a straight proxy. `proxy()` already streams
 * the body and mirrors Content-Type, so the multipart template upload and the
 * rendered JSON/CSV/PDF output (inline or `attachment`, per MS-Report's
 * Content-Disposition) pass through unchanged.
 */
import { Hono } from 'hono'
import { env } from '../env.js'
import { proxy } from '../proxy.js'

const R = env.ms.report

export const reportesRouter = new Hono()

// ── Definitions (proxy → MS-Report) ───────────────────────────────────────────

reportesRouter.get('/definitions',        (c) => proxy(c, `${R}/definitions`))
reportesRouter.post('/definitions',       (c) => proxy(c, `${R}/definitions`))
reportesRouter.get('/definitions/:id',    (c) => proxy(c, `${R}/definitions/${c.req.param('id')}`))
reportesRouter.put('/definitions/:id',    (c) => proxy(c, `${R}/definitions/${c.req.param('id')}`))
reportesRouter.delete('/definitions/:id', (c) => proxy(c, `${R}/definitions/${c.req.param('id')}`))

// ── Jasper template of a definition (proxy → MS-Report) ───────────────────────

reportesRouter.get('/definitions/:id/template',    (c) =>
  proxy(c, `${R}/definitions/${c.req.param('id')}/template`),
)
reportesRouter.post('/definitions/:id/template',   (c) =>
  proxy(c, `${R}/definitions/${c.req.param('id')}/template`),
)
reportesRouter.delete('/definitions/:id/template', (c) =>
  proxy(c, `${R}/definitions/${c.req.param('id')}/template`),
)

// ── Executions: run + audit log (proxy → MS-Report) ───────────────────────────

reportesRouter.post('/executions/run/:definitionId', (c) =>
  proxy(c, `${R}/executions/run/${c.req.param('definitionId')}`),
)
reportesRouter.get('/executions',      (c) => proxy(c, `${R}/executions`))
reportesRouter.get('/executions/:id',  (c) => proxy(c, `${R}/executions/${c.req.param('id')}`))
