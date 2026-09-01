import { TikTokClient } from "./api/client.js";
import { PUBLISH_SCOPES, READ_SCOPES } from "./api/client.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

/**
 * `doctor` exists because an integration fails for about six reasons and all
 * of them look identical from inside an MCP client, which reports "the tool
 * errored" and nothing else.
 *
 * So this tests every credential, names which tools are unavailable and why,
 * and checks the things the server assumes but cannot guarantee: that the
 * refresh token still works, and that the account actually granted the scopes
 * the publishing tools need. Both of those are silent until the first call.
 */

type Line = { ok: boolean; label: string; detail?: string };

function render(lines: Line[]): string {
  return lines.map((l) => `${l.ok ? "PASS" : "FAIL"}  ${l.label}${l.detail ? `\n      ${l.detail}` : ""}`).join("\n");
}

export async function runDoctor(): Promise<{ text: string; healthy: boolean }> {
  const config = loadConfig();
  const lines: Line[] = [];

  lines.push({
    ok: Number(process.versions.node.split(".")[0]) >= 20,
    label: `Node ${process.versions.node}`,
    detail: Number(process.versions.node.split(".")[0]) >= 20 ? undefined : "This server needs Node 20 or newer.",
  });

  const hasApp = Boolean(config.clientKey && config.clientSecret);
  lines.push({
    ok: hasApp,
    label: "TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET",
    detail: hasApp
      ? config.clientKey.startsWith("sb")
        ? "This is a SANDBOX client key. A sandbox app only authorises test users you add by hand, and cannot post publicly."
        : undefined
      : "Both come from your app on developers.tiktok.com, under Manage apps.",
  });

  lines.push({
    ok: config.accounts.length > 0,
    label: `${config.accounts.length} account(s) configured`,
    detail:
      config.accounts.length > 0
        ? config.accounts.map((a) => a.name).join(", ")
        : "Run `tiktok-mcp auth` to get a refresh token, then set TIKTOK_REFRESH_TOKEN.",
  });

  /* Test every account rather than the first. One dead token must not hide
     five healthy ones, which is exactly what a first-account-only check does
     and why it is worth the extra requests here. */
  for (const account of config.accounts) {
    if (!hasApp) break;
    const client = new TikTokClient(config, account);
    try {
      const data = (await client.request("GET", "/user/info/", { fields: "open_id,display_name,username" })) as {
        user?: Record<string, unknown>;
      };
      const username = data.user?.username ?? data.user?.display_name ?? "(no username granted)";
      lines.push({ ok: true, label: `${account.name}: connected as ${String(username)}` });

      const granted = (client.grantedScope ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const missingRead = READ_SCOPES.filter((s) => !granted.includes(s));
      const missingPublish = PUBLISH_SCOPES.filter((s) => !granted.includes(s));

      if (missingRead.length) {
        lines.push({
          ok: false,
          label: `${account.name}: missing read scopes`,
          detail: `${missingRead.join(", ")}. Re-run \`tiktok-mcp auth\` and approve them.`,
        });
      }
      lines.push({
        ok: missingPublish.length === 0,
        label:
          missingPublish.length === 0
            ? `${account.name}: publishing available`
            : `${account.name}: publishing unavailable`,
        detail:
          missingPublish.length === 0
            ? undefined
            : `Missing ${missingPublish.join(", ")}. Add the Content Posting API product to your TikTok app, then re-run \`tiktok-mcp auth --publish\`. The draft tools still work without it.`,
      });
    } catch (error) {
      lines.push({
        ok: false,
        label: `${account.name}: token rejected`,
        detail: (error as Error).message,
      });
    }
  }

  const built = buildServer(config);
  lines.push({
    ok: true,
    label: `${built.toolCount} tools registered`,
    detail: config.readOnly
      ? "TIKTOK_READ_ONLY=1 is set, so every write tool is hidden."
      : config.allowDestructive
        ? undefined
        : "TIKTOK_ALLOW_DESTRUCTIVE=0 is set, so drafts work and publishing is hidden.",
  });

  if (config.auditLog) {
    lines.push({ ok: true, label: `Audit log at ${config.auditLog}` });
  }

  return { text: render(lines), healthy: lines.every((l) => l.ok) };
}
