const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:8081",
  "http://localhost:8081",
])

export function withCors(req: Request, response: Response): Response {
  const origin = req.headers.get("origin")
  if (!(origin && ALLOWED_ORIGINS.has(origin))) {
    return response
  }

  const requestedHeaders = req.headers.get("access-control-request-headers")

  const headers = new Headers(response.headers)
  headers.set("Access-Control-Allow-Origin", origin)
  headers.set("Access-Control-Allow-Credentials", "true")
  headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
  headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders || "Content-Type, Authorization, x-requested-with"
  )
  headers.append("Vary", "Origin")
  headers.append("Vary", "Access-Control-Request-Headers")

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function corsPreflight(req: Request): Response {
  return withCors(req, new Response(null, { status: 204 }))
}
