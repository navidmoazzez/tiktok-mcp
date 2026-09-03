#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runAuth } from "./auth.js";
import { isCliCommand, runCli } from "./cli.js";
import { loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { buildServer, VERSION } from "./server.js";
import { startHttp } from "./transport/http.js";

/**
 * Entry point. Four modes: serve over stdio (the default), serve over HTTP,
 * mint a refresh token, or explain what is broken.
 *
 * Everything writes diagnostics to stderr. On stdio, stdout is the MCP
 * protocol stream, and a single stray console.log there corrupts the framing
 * and the client reports a parse error rather than the message you wrote.
 */

const HELP = `tiktok-mcp ${VERSION}

  tiktok-mcp                 serve over stdio (what an MCP client runs)
  tiktok-mcp --http [--port] serve over streamable HTTP on 127.0.0.1
  tiktok-mcp auth [--publish] [--port N]
                             get a refresh token through TikTok's desktop flow
  tiktok-mcp doctor          test every credential and say what is unavailable
  tiktok-mcp --version

  tiktok-cli                 list every command, one line each, writes marked
  tiktok-cli <command>       run one tool from the shell
  tiktok-cli <command> --help
                             its arguments, types, and which are required

Environment:
  TIKTOK_CLIENT_KEY          from your app on developers.tiktok.com
  TIKTOK_CLIENT_SECRET
  TIKTOK_REFRESH_TOKEN       one account
  TIKTOK_ACCOUNTS            several, as name:token,name:token
  TIKTOK_READ_ONLY=1         hide every write tool
  TIKTOK_ALLOW_DESTRUCTIVE=0 keep drafts, hide publishing
  TIKTOK_AUDIT_LOG=<path>    one JSON line per attempted write

HTTP transport:
  TIKTOK_HTTP_PORT           default 8000, --port overrides it
  TIKTOK_HTTP_HOST           default 127.0.0.1
  TIKTOK_HTTP_TOKEN          bearer token, required on any other host
`;

/**
 * Words that are not tools but are still meant to work from either binary.
 *
 * `tiktok-cli auth` and `tiktok-cli doctor` are the two commands a person
 * reaches for when nothing works yet, so rejecting them as unknown from the
 * binary they already have in their fingers would be the wrong answer at the
 * worst moment.
 */
const CLI_PASSTHROUGH = new Set(["auth", "doctor", "help"]);

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

/**
 * One entry point, two programs. `tiktok-mcp` is the server and must stay
 * silent on stdout; `tiktok-cli` is the one a person types. Running the CLI
 * binary with no arguments is someone asking what they can type, so it lists
 * the commands rather than hanging on a transport that will never speak.
 */
function invokedAsCli(): boolean {
  const name = (process.argv[1] ?? "").split("/").pop() ?? "";
  return name.startsWith("tiktok-cli");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv.find((a) => !a.startsWith("-"));
  const first = argv[0];

  if (invokedAsCli() && argv.length === 0) {
    process.exitCode = await runCli(["tools"]);
    return;
  }

  // Checked before --help and --version so `<tool> --help` reaches the tool.
  // A bare `--help` starts with a dash, so it falls through to the block below.
  if (isCliCommand(argv)) {
    process.exitCode = await runCli(argv);
    return;
  }

  // An unknown word used to fall through and start the server, which then sat
  // waiting on stdin: a typo looked like a hang, and scripts saw exit code 0.
  if (invokedAsCli() && first !== undefined && !first.startsWith("-") && !CLI_PASSTHROUGH.has(first)) {
    process.stderr.write(
      `${JSON.stringify({ error: `Unknown command '${first}'. Run \`tiktok-cli\` to list them.` }, null, 2)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(VERSION);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    console.log(HELP);
    return;
  }

  if (command === "doctor") {
    const { text, healthy } = await runDoctor();
    console.log(text);
    process.exitCode = healthy ? 0 : 1;
    return;
  }

  if (command === "auth") {
    const config = loadConfig();
    const port = Number(flagValue(argv, "--port") ?? 8481);
    const result = await runAuth({
      clientKey: config.clientKey,
      clientSecret: config.clientSecret,
      port,
      publish: argv.includes("--publish"),
    });

    /* The token goes to stdout on its own line and everything else to stderr,
       so `tiktok-mcp auth > token.txt` captures the token and nothing else. */
    console.error("");
    console.error(`Connected. Scopes granted: ${result.scope || "(none reported)"}`);
    console.error(`This refresh token is valid for about ${result.refreshExpiresInDays} days.`);
    console.error("Add it to your client config as TIKTOK_REFRESH_TOKEN:");
    console.error("");
    console.log(result.refreshToken);
    return;
  }

  if (argv.includes("--http")) {
    const port = Number(flagValue(argv, "--port") ?? 8000);
    await startHttp(port);
    return;
  }

  const { server, toolCount } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`tiktok-mcp ${VERSION} ready, ${toolCount} tools`);
}

main().catch((error: unknown) => {
  console.error(`tiktok-mcp: ${(error as Error)?.message ?? String(error)}`);
  process.exit(1);
});
