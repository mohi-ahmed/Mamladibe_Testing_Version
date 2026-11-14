type Fetcher = (request: Request) => Promise<Response>;

const BODYLESS_STATUSES = new Set([204, 205, 304]);

function configuredBackendOrigin(value = process.env["BACKEND_ORIGIN"]) {
  const raw = value?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("BACKEND_ORIGIN must be an HTTP(S) origin without credentials");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BACKEND_ORIGIN must not include a path, query, or hash");
  }
  return url.origin;
}

export async function proxyApiRequest(
  request: Request,
  backendOrigin = configuredBackendOrigin(),
  fetcher: Fetcher = fetch,
) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith("/api/")) return null;
  if (!backendOrigin) {
    return new Response(
      JSON.stringify({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "The API proxy is not configured.",
        },
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  const target = new URL(`${incoming.pathname}${incoming.search}`, backendOrigin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  const upstream = new Request(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    // Required by Node's fetch when forwarding a streaming request body.
    duplex: request.body ? "half" : undefined,
  } as RequestInit);
  const response = await fetcher(upstream);

  // Nitro's Vercel adapter can keep the status while dropping an upstream
  // undici Response body stream. Materialize it into a platform-owned Response
  // so JSON and Set-Cookie headers survive the same-origin proxy.
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  const body =
    request.method === "HEAD" || BODYLESS_STATUSES.has(response.status)
      ? null
      : await response.arrayBuffer();

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
