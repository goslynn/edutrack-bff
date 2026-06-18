/**
 * Anotaciones — composite + CRUD proxies.
 *
 * GET /anotaciones/:courseId
 *   → fan-out: ALL students (MS-Student) + ALL annotations (MS-Annotation).
 *     The BFF filters both to the requested courseId server-side because neither
 *     MS exposes a ?courseId= query parameter yet.
 *
 * Annotation CRUD → proxy to MS-Annotation.
 */
import { Hono } from 'hono'
import { env } from '../env.js'
import { fanOutGet, passthroughError, pickReqHeaders, proxy } from '../proxy.js'

const ANN = env.ms.annotation
const S   = env.ms.student

export const anotacionesRouter = new Hono()

// ── Composite ─────────────────────────────────────────────────────────────────

anotacionesRouter.get('/:courseId', async (c) => {
  const courseId = c.req.param('courseId')
  const headers  = pickReqHeaders(c)

  const result = await fanOutGet(headers, `${S}/students`, `${ANN}/annotations`)
  if (!result.ok) return passthroughError(result.response)

  const [allStudents, allAnnotations] = result.jsons as [
    Array<{ id: string; courseId?: string }>,
    Array<{ studentId: string }>,
  ]

  // Filter students to this course (MS-Student has no ?courseId= param).
  const roster = allStudents.filter((s) => s.courseId === courseId)
  const studentIds = new Set(roster.map((s) => s.id))

  // Filter annotations to students in this course.
  const annotations = allAnnotations.filter((a) => studentIds.has(a.studentId))

  return c.json({ annotations, roster })
})

// ── Annotation CRUD (proxy → MS-Annotation) ───────────────────────────────────

anotacionesRouter.post('/annotations',       (c) => proxy(c, `${ANN}/annotations`))
anotacionesRouter.get('/annotations/:id',    (c) => proxy(c, `${ANN}/annotations/${c.req.param('id')}`))
anotacionesRouter.delete('/annotations/:id', (c) => proxy(c, `${ANN}/annotations/${c.req.param('id')}`))
