// Relays a request from the report page to an app the user started on localhost.
// The browser can't read responses from another localhost port (CORS), so the backend
// makes the call. It only ever talks to 127.0.0.1, never to this API or the web app.
import { UserFacingError } from "../indexer/github.js";

const BLOCKED_PORTS = new Set([Number(process.env.PORT ?? 3100)]);

export async function localRequest(input) {
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || BLOCKED_PORTS.has(port)) {
    throw new UserFacingError("Pick the port your app is running on (1024–65535).");
  }
  const method = String(input.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method))
    throw new UserFacingError("Unsupported method");
  const path = String(input.path ?? "/");
  if (!path.startsWith("/") || path.startsWith("//") || /[\s\\]/.test(path))
    throw new UserFacingError("The path must start with /");
  const body =
    typeof input.body === "string" && input.body.trim() && !["GET", "HEAD"].includes(method) ? input.body : undefined;
  const started = Date.now();
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      body,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new UserFacingError(`Nothing answered on localhost:${port}. Is the app running?`, 502);
  }
  const buf = await res.arrayBuffer();
  const max = 200_000;
  const text = new TextDecoder().decode(buf.slice(0, max));
  return {
    status: res.status,
    statusText: res.statusText,
    ms: Date.now() - started,
    contentType: res.headers.get("content-type"),
    body: text,
    truncated: buf.byteLength > max,
  };
}
