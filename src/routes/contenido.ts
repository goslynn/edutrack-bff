/**
 * Contenido — CRUD proxies to MS-Content.
 *
 * Levels, nodes and files are proxied as-is (no composition needed — the tree
 * lives entirely inside MS-Content). File upload/download are forwarded verbatim:
 * `proxy()` already streams the body and mirrors Content-Type (multipart boundary
 * included), so no special-casing is needed for the multipart upload or the
 * binary download.
 */
import { Hono } from 'hono'
import { env } from '../env.js'
import { proxy } from '../proxy.js'

const CNT = env.ms.content

export const contenidoRouter = new Hono()

// ── Levels (proxy → MS-Content) ───────────────────────────────────────────────

contenidoRouter.get('/levels',        (c) => proxy(c, `${CNT}/levels`))
contenidoRouter.post('/levels',       (c) => proxy(c, `${CNT}/levels`))
contenidoRouter.get('/levels/:id',    (c) => proxy(c, `${CNT}/levels/${c.req.param('id')}`))
contenidoRouter.put('/levels/:id',    (c) => proxy(c, `${CNT}/levels/${c.req.param('id')}`))
contenidoRouter.delete('/levels/:id', (c) => proxy(c, `${CNT}/levels/${c.req.param('id')}`))

// ── Nodes (proxy → MS-Content) ────────────────────────────────────────────────

contenidoRouter.get('/nodes',        (c) => proxy(c, `${CNT}/nodes`))
contenidoRouter.post('/nodes',       (c) => proxy(c, `${CNT}/nodes`))
contenidoRouter.get('/nodes/:id',    (c) => proxy(c, `${CNT}/nodes/${c.req.param('id')}`))
contenidoRouter.put('/nodes/:id',    (c) => proxy(c, `${CNT}/nodes/${c.req.param('id')}`))
contenidoRouter.delete('/nodes/:id', (c) => proxy(c, `${CNT}/nodes/${c.req.param('id')}`))

// ── Files (proxy → MS-Content) ────────────────────────────────────────────────

contenidoRouter.post('/files',              (c) => proxy(c, `${CNT}/files`))
contenidoRouter.get('/files',                (c) => proxy(c, `${CNT}/files`))
contenidoRouter.get('/files/:id',           (c) => proxy(c, `${CNT}/files/${c.req.param('id')}`))
contenidoRouter.get('/files/:id/link',      (c) => proxy(c, `${CNT}/files/${c.req.param('id')}/link`))
// Download is unauthenticated on MS-Content (authorized by the signed token in
// the query string), but the frontend still calls it through the BFF like any
// other content endpoint, so it's proxied the same way.
contenidoRouter.get('/files/:id/download', (c) => proxy(c, `${CNT}/files/${c.req.param('id')}/download`))
contenidoRouter.delete('/files/:id',       (c) => proxy(c, `${CNT}/files/${c.req.param('id')}`))
