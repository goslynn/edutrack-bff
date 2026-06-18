/**
 * Configuración — admin proxies + composite resource catalog.
 *
 * Users + roles → proxy to MS-Auth.
 *
 * GET /configuracion/resources
 *   → fan-out to every MS's /meta/resources endpoint, returning the unified
 *     resource catalog the Roles panel needs to build the permission matrix.
 *     Shape: { auth, course, student, attendance, annotation, assessment }
 *     (each is the ServiceResources response from that MS).
 */
import { Hono } from 'hono'
import { env } from '../env.js'
import { fanOutGet, passthroughError, pickReqHeaders, proxy } from '../proxy.js'

const AUTH = env.ms.auth
const C    = env.ms.course
const S    = env.ms.student
const ATT  = env.ms.attendance
const ANN  = env.ms.annotation
const ASS  = env.ms.assessment

export const configuracionRouter = new Hono()

// ── Resource catalog (composite) ──────────────────────────────────────────────

configuracionRouter.get('/resources', async (c) => {
  const result = await fanOutGet(
    pickReqHeaders(c),
    `${AUTH}/meta/resources`,
    `${C}/meta/resources`,
    `${S}/meta/resources`,
    `${ATT}/meta/resources`,
    `${ANN}/meta/resources`,
    `${ASS}/meta/resources`,
  )
  if (!result.ok) return passthroughError(result.response)
  const [auth, course, student, attendance, annotation, assessment] = result.jsons
  return c.json({ auth, course, student, attendance, annotation, assessment })
})

// ── Users (proxy → MS-Auth) ───────────────────────────────────────────────────

configuracionRouter.get('/users',       (c) => proxy(c, `${AUTH}/users`))
configuracionRouter.post('/users',      (c) => proxy(c, `${AUTH}/users`))
configuracionRouter.get('/users/:id',   (c) => proxy(c, `${AUTH}/users/${c.req.param('id')}`))
// Update (displayName + enabled) y soft-delete (disable) viven en el mismo recurso de Auth:
// habilitar/inhabilitar es un PUT con { enabled }, no un endpoint /status aparte.
configuracionRouter.put('/users/:id',   (c) => proxy(c, `${AUTH}/users/${c.req.param('id')}`))
configuracionRouter.delete('/users/:id', (c) =>
  proxy(c, `${AUTH}/users/${c.req.param('id')}`),
)

// ── Roles (proxy → MS-Auth) ───────────────────────────────────────────────────

configuracionRouter.get('/roles',          (c) => proxy(c, `${AUTH}/roles`))
configuracionRouter.post('/roles',         (c) => proxy(c, `${AUTH}/roles`))
configuracionRouter.get('/roles/:id',      (c) => proxy(c, `${AUTH}/roles/${c.req.param('id')}`))
configuracionRouter.put('/roles/:id',      (c) => proxy(c, `${AUTH}/roles/${c.req.param('id')}`))
configuracionRouter.delete('/roles/:id',   (c) => proxy(c, `${AUTH}/roles/${c.req.param('id')}`))

// ── Permissions per role (proxy → MS-Auth) ────────────────────────────────────

configuracionRouter.get('/roles/:id/permissions',  (c) =>
  proxy(c, `${AUTH}/roles/${c.req.param('id')}/permissions`),
)
configuracionRouter.put('/roles/:id/permissions/:resourceKey', (c) =>
  proxy(c, `${AUTH}/roles/${c.req.param('id')}/permissions/${c.req.param('resourceKey')}`),
)
configuracionRouter.delete('/roles/:id/permissions/:resourceKey', (c) =>
  proxy(c, `${AUTH}/roles/${c.req.param('id')}/permissions/${c.req.param('resourceKey')}`),
)

// ── User-role assignments (proxy → MS-Auth) ───────────────────────────────────

configuracionRouter.get('/users/:id/roles',           (c) =>
  proxy(c, `${AUTH}/users/${c.req.param('id')}/roles`),
)
// Asignar un rol es un POST sobre el par (userId, roleId) — el roleId va en el path,
// no en el body (contrato de Auth UserRoleResource).
configuracionRouter.post('/users/:id/roles/:roleId',   (c) =>
  proxy(c, `${AUTH}/users/${c.req.param('id')}/roles/${c.req.param('roleId')}`),
)
configuracionRouter.delete('/users/:id/roles/:roleId', (c) =>
  proxy(c, `${AUTH}/users/${c.req.param('id')}/roles/${c.req.param('roleId')}`),
)
