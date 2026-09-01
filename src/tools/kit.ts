/**
 * Shared plumbing every tool uses.
 *
 * Registering sixteen tools by hand is sixteen chances to forget an
 * annotation, leak a stack trace, or return a shape the model cannot read.
 * This wraps all of it once so a tool module only describes what it does.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { TikTokClient } from "../api/client.js";
import { TikTokError } from "../api/errors.js";
import { pickAccount, type Account, type Config } from "../config.js";
import { annotationsFor, type Risk, type WriteGuard } from "../safety.js";

export type ToolContext = {
  config: Config;
  guard: WriteGuard;
  /** An authenticated client for the account this call targets. */
  client: (hint?: string) => TikTokClient;
  account: (hint?: string) => Account;
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function ok(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

/**
 * Errors come back as a normal result with `isError`, not a thrown exception.
 *
 * A thrown MCP error reaches the model as a protocol failure with no
 * structure. A result it can read carries the TikTok error code and the
 * sentence that says what to do about it, which is the difference between a
 * correct retry and a give-up. This is worth verifying against your own client
 * before writing thirty careful error messages, because SDKs differ on whether
 * a thrown message survives at all.
 */
export function fail(error: unknown): ToolResult {
  const payload =
    error instanceof TikTokError
      ? { error: error.message, code: error.code, status: error.status, log_id: error.logId }
      : { error: (error as Error)?.message ?? String(error) };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
}

/** The optional argument that picks an account, on every account-scoped tool. */
export const accountArg = {
  account: z
    .string()
    .optional()
    .describe(
      "Which connected TikTok account to act as, by the name you gave it in TIKTOK_ACCOUNTS. Defaults to the first. Call list_accounts to see them.",
    ),
};

/** The confirmation argument on every tool that reaches the public timeline. */
export const confirmArg = {
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Must be true for this to run. A TikTok post is public the moment moderation clears it, and deleting it later does not pull it out of feeds that already have it.",
    ),
};

export type ToolSpec<S extends ZodRawShape> = {
  name: string;
  /** One line, imperative. Shown in tool pickers. */
  title: string;
  description: string;
  schema: S;
  risk: Risk;
  idempotent?: boolean;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>;
  /** One line for the audit log and the confirm message, when this is a write. */
  summary?: (args: z.infer<z.ZodObject<S>>) => string;
};

export function defineTool<S extends ZodRawShape>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}

/**
 * A tool of any shape, for the one place tools are collected into a list.
 *
 * `ToolSpec` is generic over its schema, so a list of tools with different
 * schemas has no single type: each handler takes a different argument shape
 * and function parameters are contravariant. The safety that matters lives
 * inside each `defineTool` call, where schema and handler are checked against
 * each other. This only loosens the seam where they are gathered.
 */
export type AnyToolSpec = Omit<ToolSpec<ZodRawShape>, "handler" | "summary"> & {
  handler: (args: never, ctx: ToolContext) => Promise<unknown>;
  summary?: (args: never) => string;
};

export function register(server: McpServer, ctx: ToolContext, spec: AnyToolSpec): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.schema,
      annotations: { title: spec.title, ...annotationsFor(spec.risk, { idempotent: spec.idempotent }) },
    },
    // The SDK derives its callback type from the schema generic. This wrapper
    // is generic over the same shape, but TypeScript cannot prove the two equal
    // through the indirection, so the cast lives at this single boundary rather
    // than in every tool definition.
    (async (args: Record<string, unknown>) => {
      try {
        if (spec.risk !== "read") {
          const summary = spec.summary?.(args as never) ?? spec.name;
          ctx.guard.check(spec.name, spec.risk, (args as { confirm?: boolean }).confirm, summary);
        }
        return ok(await spec.handler(args as never, ctx));
      } catch (error) {
        return fail(error);
      }
    }) as never,
  );
}

export function makeContext(config: Config, guard: WriteGuard): ToolContext {
  /* One client per account, built once and kept, because the client caches the
     24-hour access token. Rebuilding it per call would mint a fresh token on
     every tool invocation and hit TikTok's rate limit on a busy session. */
  const clients = new Map<string, TikTokClient>();
  return {
    config,
    guard,
    account: (hint?: string) => pickAccount(config.accounts, hint),
    client: (hint?: string) => {
      const account = pickAccount(config.accounts, hint);
      let client = clients.get(account.name);
      if (!client) {
        client = new TikTokClient(config, account);
        clients.set(account.name, client);
      }
      return client;
    },
  };
}

/** Clamp a caller-supplied limit into a range TikTok will accept. */
export function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}
