/**
 * HTTP transport, for running the server somewhere always on.
 *
 * Streamable HTTP per the 2025-03-26 spec, stateless: every request builds its
 * own transport and tears it down. No session map means no session leak, which
 * matters more here than the reconnect support a stateful server would buy.
 *
 * Bound to 127.0.0.1 by default, and it refuses to bind anything else without
 * a bearer token. A TikTok refresh token can publish to somebody's account, so
 * a port open to the network with no auth is not a footgun worth leaving
 * loaded. TIKTOK_HTTP_HOST plus TIKTOK_HTTP_TOKEN is there for people who mean
 * it.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer, type BuiltServer } from "../server.js";

export type HttpOptions = {
  port: number;
  host: string;
  /** When set, every request must send `Authorization: Bearer <token>`. */
  token?: string;
};

export function httpOptionsFromEnv(port?: number): HttpOptions {
  const envPort = Number(process.env.TIKTOK_HTTP_PORT ?? 8000);
  return {
    port: port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : 8000),
    host: process.env.TIKTOK_HTTP_HOST || "127.0.0.1",
    token: process.env.TIKTOK_HTTP_TOKEN || undefined,
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function startHttpServer(
  built: BuiltServer,
  options: HttpOptions,
): Promise<{ close: () => Promise<void> }> {
  const nonLoopback = options.host !== "127.0.0.1" && options.host !== "localhost";
  if (nonLoopback && !options.token) {
    throw new Error(
      `Refusing to bind ${options.host} without TIKTOK_HTTP_TOKEN. Anything that can reach the port could publish to the connected account.`,
    );
  }

  const http = createServer((req, res) => {
    void handle(built, options, req, res).catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: (error as Error)?.message ?? "internal error" },
          id: null,
        }),
      );
    });
  });

  await new Promise<void>((resolve) => http.listen(options.port, options.host, resolve));
  process.stderr.write(
    `[tiktok-mcp] listening on http://${options.host}:${options.port}/mcp${options.token ? " (bearer token required)" : ""}\n`,
  );

  return {
    close: () =>
      new Promise<void>((resolve) => {
        http.close(() => resolve());
      }),
  };
}

async function handle(
  built: BuiltServer,
  options: HttpOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    /* Health answers before the bearer check, so it must say nothing about
       which account is connected or how many are. */
    res.end(JSON.stringify({ ok: true, tools: built.toolCount, read_only: built.config.readOnly }));
    return;
  }

  if (options.token) {
    if ((req.headers.authorization ?? "") !== `Bearer ${options.token}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }

  if (req.method === "DELETE") {
    /* Stateless: there is no session to end, and saying so beats a 404 that a
       client surfaces as "failed to remove server". */
    res.writeHead(204).end();
    return;
  }

  /* A fresh transport per request. `sessionIdGenerator: undefined` is what puts
     the SDK into stateless mode. */
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => void transport.close());
  await built.server.connect(transport);
  await transport.handleRequest(req, res, await readBody(req));
}

/** Convenience wrapper used by the CLI. */
export async function startHttp(port?: number): Promise<void> {
  const built = buildServer();
  await startHttpServer(built, httpOptionsFromEnv(port));
}
