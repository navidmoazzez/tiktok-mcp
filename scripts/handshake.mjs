/**
 * Connect a real MCP client to the built server and list its tools.
 *
 * This is the check CI would otherwise miss: the suite can be green while the
 * server fails to register a tool or crashes on connect, and that is the only
 * failure a user ever sees.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expected = { default: 14, readonly: 9, nodestructive: 11 };
let failed = false;

for (const [mode, count] of Object.entries(expected)) {
  const env = { ...process.env };
  if (mode === "readonly") env.TIKTOK_READ_ONLY = "1";
  if (mode === "nodestructive") env.TIKTOK_ALLOW_DESTRUCTIVE = "0";

  const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env });
  const client = new Client({ name: "ci-handshake", version: "1" }, { capabilities: {} });
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();

  const ok = tools.length === count;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${mode}: ${tools.length} tools (expected ${count})`);

  for (const tool of tools) {
    if (!tool.description || tool.description.length < 60) {
      failed = true;
      console.log(`FAIL  ${tool.name} has no usable description`);
    }
  }
}

process.exit(failed ? 1 : 0);
