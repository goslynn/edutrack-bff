/**
 * Asistencia — composite + session/record proxies.
 *
 * GET /asistencia/:courseId
 *   → fan-out: course detail (MS-Course) + all students (MS-Student, filtered
 *     server-side by courseId). Sessions are excluded because MS-Attendance
 *     does not yet expose a GET /sessions?courseId= endpoint; history is
 *     therefore an empty array until that endpoint is added.
 *
 * Session/record CRUD → proxy to MS-Attendance.
 */
import { Hono } from 'hono'
import { env } from '../env.js'
import { fanOutGet, passthroughError, pickReqHeaders, proxy } from '../proxy.js'

const ATT = env.ms.attendance
const S   = env.ms.student
const C   = env.ms.course

export const asistenciaRouter = new Hono()

// ── Composite ─────────────────────────────────────────────────────────────────

asistenciaRouter.get('/:courseId', async (c) => {
  const id      = c.req.param('courseId')
  const headers = pickReqHeaders(c)

  const result = await fanOutGet(
    headers,
    `${C}/courses/${id}`,
    `${S}/students`,
  )
  if (!result.ok) return passthroughError(result.response)

  const [course, allStudents] = result.jsons as [unknown, Array<{ courseId?: string }>]

  // Filter students belonging to this course (MS-Student has no ?courseId= param).
  const students = allStudents.filter((s) => s.courseId === id)

  return c.json({ course, students, sessions: [] })
})

// ── Sessions (proxy → MS-Attendance) ─────────────────────────────────────────

asistenciaRouter.post('/:courseId/sessions', (c) =>
  proxy(c, `${ATT}/sessions`),
)
asistenciaRouter.patch('/:courseId/sessions/:sessionId/close', (c) =>
  proxy(c, `${ATT}/sessions/${c.req.param('sessionId')}/close`),
)

// ── Records (proxy → MS-Attendance) ──────────────────────────────────────────

asistenciaRouter.post('/:courseId/sessions/:sessionId/records', (c) =>
  proxy(c, `${ATT}/sessions/${c.req.param('sessionId')}/records`),
)
