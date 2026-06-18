/**
 * Estudiantes y cursos — composite + CRUD proxies.
 *
 * GET /estudiantes          → fan-out students (MS-Student) + courses (MS-Course),
 *                             single round-trip for the Estudiantes page bundle.
 * /estudiantes/students/*   → proxy to MS-Student
 * /estudiantes/courses/*    → proxy to MS-Course (incl. teacher assignments)
 */
import { Hono } from 'hono'
import { env } from '../env.js'
import { fanOutGet, passthroughError, pickReqHeaders, proxy } from '../proxy.js'

const S = env.ms.student
const C = env.ms.course

export const estudiantesRouter = new Hono()

// ── Composite ─────────────────────────────────────────────────────────────────

estudiantesRouter.get('/', async (c) => {
  const headers = pickReqHeaders(c)

  const result = await fanOutGet(headers, `${S}/students`, `${C}/courses`)
  if (!result.ok) return passthroughError(result.response)
  const [studentsRaw, courses] = result.jsons as [Array<{ id: string }>, unknown[]]

  // Enrich each student with their guardians (server-to-server, all in parallel).
  // Falls back to [] if the guardian request fails (e.g. 403 for the caller's role).
  const guardianResponses = await Promise.all(
    studentsRaw.map((s) => fetch(`${S}/students/${s.id}/guardians`, { headers })),
  )
  const students = await Promise.all(
    studentsRaw.map(async (s, i) => {
      const res = guardianResponses[i]
      const guardians = res.ok ? await res.json() : []
      return { ...s, guardians }
    }),
  )

  return c.json({ students, courses })
})

// ── Student CRUD ──────────────────────────────────────────────────────────────

estudiantesRouter.get('/students',     (c) => proxy(c, `${S}/students`))
estudiantesRouter.post('/students',    (c) => proxy(c, `${S}/students`))

estudiantesRouter.get('/students/:id',    (c) => proxy(c, `${S}/students/${c.req.param('id')}`))
estudiantesRouter.put('/students/:id',    (c) => proxy(c, `${S}/students/${c.req.param('id')}`))
estudiantesRouter.delete('/students/:id', (c) => proxy(c, `${S}/students/${c.req.param('id')}`))

estudiantesRouter.patch('/students/:id/transfer', (c) =>
  proxy(c, `${S}/students/${c.req.param('id')}/transfer`),
)

// ── Guardian sub-resource ─────────────────────────────────────────────────────

estudiantesRouter.get('/students/:id/guardians',  (c) =>
  proxy(c, `${S}/students/${c.req.param('id')}/guardians`),
)
estudiantesRouter.post('/students/:id/guardians', (c) =>
  proxy(c, `${S}/students/${c.req.param('id')}/guardians`),
)

// ── Course CRUD ───────────────────────────────────────────────────────────────

estudiantesRouter.get('/courses',     (c) => proxy(c, `${C}/courses`))
estudiantesRouter.post('/courses',    (c) => proxy(c, `${C}/courses`))

estudiantesRouter.get('/courses/:id',    (c) => proxy(c, `${C}/courses/${c.req.param('id')}`))
estudiantesRouter.put('/courses/:id',    (c) => proxy(c, `${C}/courses/${c.req.param('id')}`))
estudiantesRouter.delete('/courses/:id', (c) => proxy(c, `${C}/courses/${c.req.param('id')}`))

// ── Teacher assignments ───────────────────────────────────────────────────────

estudiantesRouter.get('/courses/:id/teachers',  (c) =>
  proxy(c, `${C}/courses/${c.req.param('id')}/teachers`),
)
estudiantesRouter.post('/courses/:id/teachers', (c) =>
  proxy(c, `${C}/courses/${c.req.param('id')}/teachers`),
)
estudiantesRouter.put('/courses/:id/teachers/:tid', (c) =>
  proxy(c, `${C}/courses/${c.req.param('id')}/teachers/${c.req.param('tid')}`),
)
estudiantesRouter.delete('/courses/:id/teachers/:tid', (c) =>
  proxy(c, `${C}/courses/${c.req.param('id')}/teachers/${c.req.param('tid')}`),
)
