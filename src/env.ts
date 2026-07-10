// Each MS exposes its resources under /@ApplicationPath("/<serviceId>"), matching
// the gateway's first-segment routing key. The env var is the base URL (host+port);
// we always append the service path so callers write ${S}/students, not ${S}/student/students.
const base = (envVar: string, defaultHost: string, serviceId: string) =>
  (process.env[envVar] ?? defaultHost) + '/' + serviceId

export const env = {
  port: Number(process.env.PORT ?? 8080),
  ms: {
    student:    base('STUDENT_MS_URL',    'http://student:8080',    'student'),
    course:     base('COURSE_MS_URL',     'http://course:8080',     'course'),
    auth:       base('AUTH_MS_URL',       'http://auth:8080',       'auth'),
    annotation: base('ANNOTATION_MS_URL', 'http://annotation:8080', 'annotation'),
    attendance: base('ATTENDANCE_MS_URL', 'http://attendance:8080', 'attendance'),
    assessment: base('ASSESSMENT_MS_URL', 'http://assessment:8080', 'assessment'),
    content:    base('CONTENT_MS_URL',    'http://content:8080',    'content'),
    report:     base('REPORT_MS_URL',     'http://report:8080',     'report'),
  },
} as const
