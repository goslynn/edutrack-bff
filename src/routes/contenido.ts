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
import { passthroughError, pickReqHeaders, proxy } from '../proxy.js'

const CNT = env.ms.content

export const contenidoRouter = new Hono()

// ── Composite: full content tree bundle ───────────────────────────────────────
//
// The frontend loads the whole hierarchy in one round-trip and navigates it in
// the client. MS-Content exposes no flat "all nodes"/"all files" listing
// (`/nodes` returns children of a parentId — roots when omitted; `/files`
// requires a nodeId), so the tree is assembled here: walk it breadth-first
// (roots → children → …) collecting every node, then fetch each node's files
// (non-leaf nodes return an empty list). Returns { levels, nodes, files }.

type GetJson =
  | { ok: true; data: unknown }
  | { ok: false; response: globalThis.Response }

contenidoRouter.get('/', async (c) => {
  const headers = pickReqHeaders(c)
  const getJson = async (url: string): Promise<GetJson> => {
    const res = await fetch(url, { headers })
    return res.ok ? { ok: true, data: await res.json() } : { ok: false, response: res }
  }

  const levels = await getJson(`${CNT}/levels`)
  if (!levels.ok) return passthroughError(levels.response)

  const roots = await getJson(`${CNT}/nodes`)
  if (!roots.ok) return passthroughError(roots.response)

  const nodes: any[] = []
  let frontier = roots.data as any[]
  while (frontier.length > 0) {
    nodes.push(...frontier)
    const batches = await Promise.all(frontier.map((n) => getJson(`${CNT}/nodes?parentId=${n.id}`)))
    const failed = batches.find((b) => !b.ok)
    if (failed && !failed.ok) return passthroughError(failed.response)
    frontier = batches.flatMap((b) => (b.ok ? (b.data as any[]) : []))
  }

  const fileBatches = await Promise.all(nodes.map((n) => getJson(`${CNT}/files?nodeId=${n.id}`)))
  const failedFiles = fileBatches.find((b) => !b.ok)
  if (failedFiles && !failedFiles.ok) return passthroughError(failedFiles.response)
  const files = fileBatches.flatMap((b) => (b.ok ? (b.data as any[]) : []))

  return c.json({ levels: levels.data, nodes, files })
})

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

// ── File upload: reconcile frontend contract → MS-Content ─────────────────────
//
// The frontend posts a multi-file form to `/nodes/:id/files` (nodeId in the path,
// repeated `files` fields). MS-Content instead takes one file per request at
// `POST /files` with a `nodeId` field and a single `file` field, so the batch is
// split and each file forwarded on its own. Identity headers are forwarded, but
// NOT the incoming Content-Type — `fetch` sets its own multipart boundary per body.
// Note: no rollback on a mid-batch failure — files already stored stay; the first
// upstream error is surfaced and the client's reload reflects what landed.
contenidoRouter.post('/nodes/:id/files', async (c) => {
  const nodeId = c.req.param('id')
  const form = await c.req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)

  const headers = pickReqHeaders(c)
  delete headers['content-type']

  const created: unknown[] = []
  for (const file of files) {
    const body = new FormData()
    body.append('nodeId', nodeId)
    body.append('file', file, file.name)
    const res = await fetch(`${CNT}/files`, { method: 'POST', headers, body })
    if (!res.ok) return passthroughError(res)
    created.push(await res.json())
  }
  return c.json(created, 201)
})

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
