# Working on tiktok-mcp-cli

For agents editing this repo. Installation belongs in the README.

## Run it

```bash
npm install
npm run build && npm test && npm run typecheck
```

Tests use a faked `fetch` and never touch the network or a real token. Keep it
that way: a test needing credentials is a test nobody runs.

The check that actually counts is a real handshake against the built output,
because a green suite says the code compiles, not that the server speaks MCP:

```bash
node dist/index.js   # then drive it with an MCP client
```

## Decisions already made

Do not re-derive these.

| Decision | Settled as |
|---|---|
| Language | TypeScript, Node >= 20, ESM |
| Package | `@thenavidm/tiktok-mcp-cli` on npm |
| Transport | stdio, and streamable HTTP behind `--http` |
| Writes | on by default, `confirm` on the irreversible three only |

## Things not to break

**Read-only mode removes tools, it does not refuse them.** `WriteGuard.allows`
filters the list at registration in `server.ts`. A model cannot call a tool it
cannot see, and cannot argue with a refusal it never receives. Making this a
runtime error would undo the whole point.

**Do not add `confirm` to the drafts tools.** They land in the creator's own
inbox and publish nothing. Confirming everything trains the reflex that makes
the confirmation on `post_video` worthless.

**The desktop PKCE challenge is hex, not base64url.** `src/auth.ts` uses
`sha256(verifier).digest("hex")`. TikTok's web flow and RFC 7636 both use
base64url, so copying a working web implementation here produces an authorize
call TikTok rejects with a generic parameter error.

**`create_time` is seconds, the list cursor is milliseconds.** Same endpoint,
two units. `format/videos.ts` is the only place that converts either.

**Error mapping is the product.** `api/errors.ts` turns TikTok's codes into a
sentence naming the fix. A new code should get an entry there rather than being
passed through raw.

## Where things are

| Path | What is in it |
|---|---|
| `src/api/` | HTTP client, token refresh, error mapping |
| `src/tools/` | One module per group, plus `kit.ts` which registers them |
| `src/format/` | Shaping payloads for a model |
| `src/cli.ts` | The CLI adapter: flags derived from the same Zod schemas |
| `src/safety.ts` | Guard, annotations, injection framing |
| `src/auth.ts` | The loopback OAuth flow |
| `INSTALL.md` | Long-form auth walkthrough |

## Adding a tool

Define it with `defineTool`, add it to its module's exported array, and pick a
`risk`. `read` and `write` need nothing else; `destructive` must also take
`confirmArg` and provide a `summary` for the audit log.

Then update the tool count in `package.json`, the README and the contents
table, because three places carry it and they drift. Every count in a doc is
read off the running binary, never typed: `tiktok-cli tools` prints it, and
`TIKTOK_READ_ONLY=1 tiktok-cli tools` prints the read-only one.

## Building the desktop extension

```bash
npm run build:mcpb    # -> desktop-extension/tiktok-<version>.mcpb
```

It syncs the manifest version from `package.json`, vendors `node_modules` into
the bundle, and validates the manifest. Unzip the result and run
`node server/index.js` against a real MCP client before shipping it: the point
of a `.mcpb` is that it works on a double click with nothing else installed.
