import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { ALL_TOOLS } from "../src/tools/index.js";
import { annotationsFor } from "../src/safety.js";

const BASE = {
  TIKTOK_CLIENT_KEY: "key",
  TIKTOK_CLIENT_SECRET: "secret",
  TIKTOK_REFRESH_TOKEN: "refresh",
} as NodeJS.ProcessEnv;

describe("tool registration", () => {
  it("registers every tool with a description and a title", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name, "tool name").toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.title.length, `${tool.name} title`).toBeGreaterThan(0);
      /* A short description is the most common way a tool becomes unusable:
         the model is choosing from names and descriptions alone. */
      expect(tool.description.length, `${tool.name} description`).toBeGreaterThan(60);
    }
  });

  it("gives every tool a unique name", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("puts an account argument on everything that reaches TikTok", () => {
    for (const tool of ALL_TOOLS) {
      if (tool.name === "list_accounts") continue;
      expect(Object.keys(tool.schema), `${tool.name}`).toContain("account");
    }
  });

  it("requires confirm on exactly the irreversible tools", () => {
    const needConfirm = ALL_TOOLS.filter((t) => Object.keys(t.schema).includes("confirm")).map((t) => t.name);
    expect(needConfirm.sort()).toEqual(["post_photos", "post_video", "revoke_access"]);
  });

  it("does not guard the reversible writes", () => {
    /* Drafts land in the creator's own inbox and publish nothing. Confirming
       them would train the reflex that makes the confirm on post_video
       worthless, which is the whole reason this test exists. */
    for (const name of ["send_video_to_drafts", "send_photos_to_drafts"]) {
      const tool = ALL_TOOLS.find((t) => t.name === name)!;
      expect(tool.risk).toBe("write");
      expect(Object.keys(tool.schema)).not.toContain("confirm");
    }
  });
});

describe("annotations", () => {
  it("marks reads read-only and irreversible writes destructive", () => {
    expect(annotationsFor("read")).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(annotationsFor("write")).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(annotationsFor("destructive")).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("marks every tool as reaching the network", () => {
    for (const risk of ["read", "write", "destructive"] as const) {
      expect(annotationsFor(risk).openWorldHint).toBe(true);
    }
  });
});

describe("read-only and destructive modes", () => {
  it("registers all 14 tools by default", () => {
    expect(buildServer(loadConfig(BASE)).toolCount).toBe(14);
  });

  it("removes write tools entirely under TIKTOK_READ_ONLY", () => {
    const built = buildServer(loadConfig({ ...BASE, TIKTOK_READ_ONLY: "1" }));
    /* Removed, not refused: a model cannot call a tool it cannot see, and it
       cannot argue with a refusal it never receives. */
    for (const name of ["post_video", "post_photos", "send_video_to_drafts", "revoke_access"]) {
      expect(built.toolNames).not.toContain(name);
    }
    expect(built.toolCount).toBe(9);
  });

  it("keeps drafts and removes publishing under TIKTOK_ALLOW_DESTRUCTIVE=0", () => {
    const built = buildServer(loadConfig({ ...BASE, TIKTOK_ALLOW_DESTRUCTIVE: "0" }));
    expect(built.toolNames).toContain("send_video_to_drafts");
    expect(built.toolNames).not.toContain("post_video");
    expect(built.toolCount).toBe(11);
  });
});
