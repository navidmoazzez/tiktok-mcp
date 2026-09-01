import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { AUTHORIZE_URL, PUBLISH_SCOPES, READ_SCOPES, TOKEN_URL } from "./api/client.js";
import { clean } from "./config.js";

/**
 * The `auth` command: get a refresh token without leaving the terminal.
 *
 * TikTok's desktop flow allows loopback redirect URIs (`http://127.0.0.1:*`),
 * which is what makes this possible at all. So this opens a one-request local
 * listener, prints an authorize URL, and trades the code it receives for a
 * refresh token that lasts 365 days. The user pastes that into their client
 * config once and the server keeps itself alive from there.
 *
 * The trap this exists to avoid: TikTok's DESKTOP flow wants the PKCE code
 * challenge as a HEX-encoded SHA-256, while its web flow and RFC 7636 both use
 * base64url. Copying a working web implementation produces an authorize call
 * that TikTok rejects with a generic parameter error, which sends people
 * hunting through their client key.
 */

const DEFAULT_PORT = 8481;
const CALLBACK_PATH = "/callback/";

function verifier(): string {
  /* Unreserved characters only, 43 to 128 long, per RFC 7636. base64url gives
     exactly that alphabet, so this needs no further filtering. */
  return randomBytes(64).toString("base64url").slice(0, 64);
}

/** Hex, not base64url. This is the whole reason the desktop flow trips people. */
function challenge(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export type AuthResult = {
  refreshToken: string;
  scope: string;
  openId: string | null;
  refreshExpiresInDays: number;
};

export async function runAuth(opts: {
  clientKey: string;
  clientSecret: string;
  port?: number;
  publish?: boolean;
  log?: (line: string) => void;
}): Promise<AuthResult> {
  const log = opts.log ?? ((line: string) => console.error(line));
  const port = opts.port ?? DEFAULT_PORT;
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

  const clientKey = clean(opts.clientKey);
  const clientSecret = clean(opts.clientSecret);
  if (!clientKey || !clientSecret) {
    throw new Error("Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET before running auth.");
  }

  const codeVerifier = verifier();
  const state = randomBytes(16).toString("hex");
  const scopes = [...READ_SCOPES, ...(opts.publish ? PUBLISH_SCOPES : [])].join(",");

  const authorize = new URL(AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge(codeVerifier),
    code_challenge_method: "S256",
  }).toString();

  log("");
  log(`Register this exact redirect URI in your TikTok app under Login Kit:`);
  log(`  ${redirectUri}`);
  log("");
  log("Then open this URL and approve the scopes:");
  log(`  ${authorize.toString()}`);
  log("");
  log(`Waiting on ${redirectUri} ...`);

  const code = await waitForCode(port, state, log);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.refresh_token !== "string") {
    const detail = String(body.error_description || body.error || `HTTP ${res.status}`);
    throw new Error(
      `TikTok refused the token exchange: ${detail}. The usual cause is a redirect URI that does not byte-match the one registered in your app.`,
    );
  }

  return {
    refreshToken: body.refresh_token,
    scope: typeof body.scope === "string" ? body.scope : "",
    openId: typeof body.open_id === "string" ? body.open_id : null,
    refreshExpiresInDays: Math.round(Number(body.refresh_expires_in ?? 31_536_000) / 86_400),
  };
}

/** One request, then the listener closes. It exists only to catch the redirect. */
function waitForCode(port: number, expectedState: string, log: (l: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (!url.pathname.startsWith(CALLBACK_PATH)) {
        res.writeHead(404).end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      const done = (message: string) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><meta charset="utf-8"><title>TikTok MCP</title>
<p style="font-family:system-ui;padding:32px;font-size:16px">${message}</p>`);
        server.close();
      };

      if (error) {
        done("Authorization was declined. You can close this tab.");
        reject(new Error(`TikTok returned an error: ${error}`));
        return;
      }
      /* Comparing state is what stops a different page in the user's browser
         from feeding a code of its own into this listener. */
      if (!code || state !== expectedState) {
        done("That response did not match this session. You can close this tab.");
        reject(new Error("State mismatch or missing code. Run auth again."));
        return;
      }

      done("Connected. You can close this tab and go back to the terminal.");
      resolve(code);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is in use. Run auth again with --port <other> and register that URI too.`));
        return;
      }
      reject(err);
    });

    /* Ten minutes is generous for signing into TikTok on a phone, and it stops
       a forgotten terminal holding the port open indefinitely. */
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out after 10 minutes waiting for TikTok to redirect back."));
    }, 600_000);
    timer.unref();

    server.listen(port, "127.0.0.1", () => log(""));
  });
}
