import type { Context } from 'hono'

// Internal headers the Gateway propagates downstream; the BFF must mirror them to the MSes.
const FORWARD_REQ = ['x-user-id', 'x-user-roles', 'content-type', 'accept', 'accept-language']
// Response headers worth surfacing back to the frontend.
const FORWARD_RES = ['content-type', 'x-request-id']

export function pickReqHeaders(c: Context): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of FORWARD_REQ) {
    const v = c.req.header(h)
    if (v != null) out[h] = v
  }
  return out
}

function pickResHeaders(res: globalThis.Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of FORWARD_RES) {
    const v = res.headers.get(h)
    if (v != null) out[h] = v
  }
  return out
}

function appendQueryString(target: URL, c: Context): void {
  const params = c.req.queries()
  for (const [k, values] of Object.entries(params)) {
    for (const v of values) target.searchParams.append(k, v)
  }
}

/**
 * Proxies the incoming request to `targetUrl`:
 * - Forwards internal gateway headers (X-User-Id, X-User-Roles, Content-Type, …)
 * - Forwards the query string verbatim
 * - Forwards the body for write methods
 * - Returns the upstream response as-is (status + headers + body)
 */
export async function proxy(c: Context, targetUrl: string): Promise<globalThis.Response> {
  const url = new URL(targetUrl)
  appendQueryString(url, c)

  const noBody = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'DELETE'

  const upstream = await fetch(url, {
    method: c.req.method,
    headers: pickReqHeaders(c),
    body: noBody ? undefined : await c.req.arrayBuffer(),
  })

  return new Response(upstream.body, { status: upstream.status, headers: pickResHeaders(upstream) })
}

type FanOutOk  = { ok: true;  jsons: unknown[] }
type FanOutErr = { ok: false; response: globalThis.Response }

/**
 * Fires multiple GET requests in parallel. On any non-2xx the first failing
 * response is returned and the others are drained to avoid connection leaks.
 */
export async function fanOutGet(
  headers: Record<string, string>,
  ...urls: string[]
): Promise<FanOutOk | FanOutErr> {
  const responses = await Promise.all(urls.map((url) => fetch(url, { headers })))

  const failed = responses.find((r) => !r.ok)
  if (failed) {
    responses.filter((r) => r !== failed).forEach((r) => r.body?.cancel())
    return { ok: false, response: failed }
  }

  return { ok: true, jsons: await Promise.all(responses.map((r) => r.json())) }
}

/** Passes a failed fan-out response back to the client, preserving status and body. */
export function passthroughError(r: globalThis.Response): globalThis.Response {
  return new Response(r.body, {
    status: r.status,
    headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' },
  })
}
