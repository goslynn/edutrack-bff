/**
 * Calificaciones — composite + CRUD proxies.
 *
 * GET /calificaciones/:courseId
 *   → fan-out: GET /course/courses/:id + GET /student/students (all, filter server-side).
 *     Returns { subjects: [synthetic from course], students }.
 *
 * GET /calificaciones/:courseId/subjects/:subjectId/evaluations?period=…
 *   → fan-out: evaluations + grades for that subject/period (MS-Assessment).
 *
 * Evaluation + grade CRUD → proxy to MS-Assessment.
 */
import { Hono } from 'hono'
import { env } from '../env.js'
import { fanOutGet, passthroughError, pickReqHeaders, proxy } from '../proxy.js'

const ASS = env.ms.assessment
const S   = env.ms.student
const C   = env.ms.course

export const calificacionesRouter = new Hono()

// ── Composite: course-level bundle (subjects + roster) ────────────────────────

calificacionesRouter.get('/:courseId', async (c) => {
  const id = c.req.param('courseId')
  const result = await fanOutGet(
    pickReqHeaders(c),
    `${C}/courses/${id}`,
    `${S}/students`,
  )
  if (!result.ok) return passthroughError(result.response)
  const [course, allStudents] = result.jsons as [any, any[]]
  const students = allStudents.filter((s: any) => s.courseId === id)
  // MS-Course has no /subjects endpoint yet — treat the course itself as the subject.
  const subjects = [{ id: course.id, name: course.name, course: course.name, teacher: '' }]
  return c.json({ subjects, students })
})

// ── Composite: subject-level bundle (evaluations + grades) ───────────────────

calificacionesRouter.get('/:courseId/subjects/:subjectId/evaluations', async (c) => {
  const { courseId, subjectId } = c.req.param()
  const period = c.req.query('period') ?? ''
  const qs = period ? `?subjectId=${subjectId}&period=${encodeURIComponent(period)}` : `?subjectId=${subjectId}`

  const result = await fanOutGet(
    pickReqHeaders(c),
    `${ASS}/evaluations${qs}`,
    `${ASS}/grades${qs}`,
  )
  if (!result.ok) return passthroughError(result.response)
  const [evaluations, grades] = result.jsons
  return c.json({ courseId, subjectId, period, evaluations, grades })
})

// ── Evaluation CRUD (proxy) ───────────────────────────────────────────────────

calificacionesRouter.post('/evaluations',       (c) => proxy(c, `${ASS}/evaluations`))
calificacionesRouter.get('/evaluations/:id',    (c) => proxy(c, `${ASS}/evaluations/${c.req.param('id')}`))
calificacionesRouter.put('/evaluations/:id',    (c) => proxy(c, `${ASS}/evaluations/${c.req.param('id')}`))
calificacionesRouter.delete('/evaluations/:id', (c) => proxy(c, `${ASS}/evaluations/${c.req.param('id')}`))

// ── Grade CRUD (proxy) ────────────────────────────────────────────────────────

calificacionesRouter.post('/evaluations/:id/grades', (c) =>
  proxy(c, `${ASS}/evaluations/${c.req.param('id')}/grades`),
)
calificacionesRouter.put('/grades/:id',  (c) => proxy(c, `${ASS}/grades/${c.req.param('id')}`))
calificacionesRouter.get('/grades/:id/audit', (c) =>
  proxy(c, `${ASS}/grades/${c.req.param('id')}/history`),
)
