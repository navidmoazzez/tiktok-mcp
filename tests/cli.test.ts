/**
 * The CLI adapter.
 *
 * What matters here is that the shell surface is derived from the tool specs
 * rather than described a second time, so the tests that count are the ones
 * asserting parity with ALL_TOOLS and the ones covering the argv shapes a
 * person actually types.
 */

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EXIT, exitCodeFor, flagsFor, parseArgs, isCliCommand, selectFields } from "../src/cli.js";
import { TikTokError } from "../src/api/errors.js";
import { ALL_TOOLS } from "../src/tools/index.js";

describe("flagsFor", () => {
  it("derives a flag per schema key, kebab-cased", () => {
    const flags = flagsFor({ privacy_level: z.string().optional() });
    expect(flags[0]).toMatchObject({ key: "privacy_level", flag: "--privacy-level", kind: "string" });
  });

  it("reads required from the absence of .optional()", () => {
    const flags = flagsFor({ video_url: z.string(), account: z.string().optional() });
    expect(flags.find((f) => f.key === "video_url")?.required).toBe(true);
    expect(flags.find((f) => f.key === "account")?.required).toBe(false);
  });

  it("carries .describe() through as help", () => {
    const flags = flagsFor({ title: z.string().describe("The post caption.") });
    expect(flags[0]?.help).toBe("The post caption.");
  });

  it("finds the description whichever side of .optional() it was chained", () => {
    const outer = flagsFor({ a: z.string().optional().describe("outer") });
    const inner = flagsFor({ b: z.string().describe("inner").optional() });
    expect(outer[0]?.help).toBe("outer");
    expect(inner[0]?.help).toBe("inner");
  });

  it("exposes an enum's values as choices", () => {
    const flags = flagsFor({ sort: z.enum(["views", "likes"]).optional() });
    expect(flags[0]).toMatchObject({ kind: "enum", choices: ["views", "likes"] });
  });

  it("marks a scalar array repeatable and an object array json", () => {
    const flags = flagsFor({
      photo_urls: z.array(z.string()).optional(),
      images: z.array(z.object({ url: z.string() })).optional(),
    });
    expect(flags.find((f) => f.key === "photo_urls")).toMatchObject({
      kind: "string",
      repeatable: true,
    });
    expect(flags.find((f) => f.key === "images")).toMatchObject({ kind: "json", repeatable: true });
  });

  /**
   * An enum element is a word you type, so an array of them is repeatable
   * rather than JSON. Treating it as JSON meant `--flag VALUE` was rejected and
   * you had to write `--flag '"VALUE"'` instead.
   */
  it("treats an array of enums as a repeatable scalar, not JSON", () => {
    const flags = flagsFor({ levels: z.array(z.enum(["PUBLIC_TO_EVERYONE", "SELF_ONLY"])).optional() });
    expect(flags[0]).toMatchObject({ kind: "string", repeatable: true });
    expect(parseArgs(["--levels", "SELF_ONLY"], flags)).toEqual({ levels: ["SELF_ONLY"] });
  });
});

describe("parseArgs", () => {
  const flags = flagsFor({
    video_url: z.string(),
    limit: z.number().optional(),
    confirm: z.boolean().optional(),
    photo_urls: z.array(z.string()).optional(),
    link: z.object({ uri: z.string() }).optional(),
    privacy_level: z.enum(["PUBLIC_TO_EVERYONE", "SELF_ONLY"]).optional(),
  });

  it("accepts --flag value and --flag=value alike", () => {
    expect(parseArgs(["--video-url", "https://x.test/a.mp4"], flags)).toEqual({
      video_url: "https://x.test/a.mp4",
    });
    expect(parseArgs(["--video-url=https://x.test/a.mp4"], flags)).toEqual({
      video_url: "https://x.test/a.mp4",
    });
  });

  it("accepts the underscore spelling of a flag", () => {
    expect(parseArgs(["--privacy_level", "SELF_ONLY"], flags)).toEqual({ privacy_level: "SELF_ONLY" });
  });

  it("treats a boolean as a bare switch", () => {
    expect(parseArgs(["--video-url", "u", "--confirm"], flags)).toEqual({
      video_url: "u",
      confirm: true,
    });
    expect(parseArgs(["--confirm=false"], flags)).toEqual({ confirm: false });
  });

  it("coerces numbers, and refuses ones that are not", () => {
    expect(parseArgs(["--limit", "25"], flags)).toEqual({ limit: 25 });
    expect(() => parseArgs(["--limit", "many"], flags)).toThrow(/expects a number/);
  });

  it("parses a json flag, and refuses malformed json", () => {
    expect(parseArgs(['--link={"uri":"https://x.com"}'], flags)).toEqual({
      link: { uri: "https://x.com" },
    });
    expect(() => parseArgs(["--link", "{oops"], flags)).toThrow(/expects JSON/);
  });

  it("collects a repeatable flag into an array", () => {
    expect(parseArgs(["--photo-urls", "a", "--photo-urls", "b"], flags)).toEqual({
      photo_urls: ["a", "b"],
    });
  });

  it("checks an enum against its choices", () => {
    expect(() => parseArgs(["--privacy-level", "FRIENDS"], flags)).toThrow(/expects one of/);
  });

  it("fills the first required flag from a bare argument", () => {
    expect(parseArgs(["https://x.test/a.mp4"], flags)).toEqual({ video_url: "https://x.test/a.mp4" });
  });

  it("wraps a bare argument when the required flag is repeatable", () => {
    const repeatable = flagsFor({ video_ids: z.array(z.string()) });
    expect(parseArgs(["7412345"], repeatable)).toEqual({ video_ids: ["7412345"] });
  });

  it("refuses an unknown option rather than dropping it", () => {
    expect(() => parseArgs(["--nope", "x"], flags)).toThrow(/Unknown option/);
  });

  it("refuses a second bare argument", () => {
    expect(() => parseArgs(["one", "two"], flags)).toThrow(/Unexpected argument/);
  });
});

describe("exitCodeFor", () => {
  it("calls a missing credential a config error, not an auth one", () => {
    // The message names a refresh token, so an auth-first order sent someone
    // who had configured nothing looking for an expired credential.
    const nothing = new Error(
      "No TikTok account configured. Run `npx -y @thenavidm/tiktok-mcp-cli auth` to get a refresh token, then set TIKTOK_REFRESH_TOKEN.",
    );
    expect(exitCodeFor(nothing)).toBe(EXIT.config);
    expect(exitCodeFor(new TikTokError("TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are not set.", undefined, 0))).toBe(
      EXIT.config,
    );
  });

  it("maps a rejected token to auth and a rate limit to its own code", () => {
    expect(exitCodeFor(new TikTokError("The access token was rejected.", "access_token_invalid", 401))).toBe(EXIT.auth);
    expect(exitCodeFor(new TikTokError("Rate limited by TikTok.", "rate_limit_exceeded", 429))).toBe(EXIT.rateLimited);
  });

  /**
   * A refused write is a usage problem, not an API failure. Reporting exit 5
   * told a script the call had failed upstream and was worth retrying, when in
   * fact nothing left the machine and retrying unchanged refuses again.
   */
  it("calls a refused write a usage error, not an API one", () => {
    const noConfirm = new Error(
      "post_video is not reversible, so it needs --confirm. Nothing has been changed. Post a video to @navid.",
    );
    expect(exitCodeFor(noConfirm)).toBe(EXIT.usage);
    expect(exitCodeFor(new Error("post_video is unavailable: this server is running with TIKTOK_READ_ONLY=1."))).toBe(
      EXIT.usage,
    );
    expect(
      exitCodeFor(new Error("post_video is unavailable: this server is running with TIKTOK_ALLOW_DESTRUCTIVE=0.")),
    ).toBe(EXIT.usage);
  });

  it("maps a missing publish_id to not found", () => {
    expect(exitCodeFor(new TikTokError("No post with that publish_id.", "invalid_publish_id", 400))).toBe(
      EXIT.notFound,
    );
  });
});

describe("selectFields", () => {
  it("keeps only the named fields and descends dotted paths element-wise", () => {
    const data = { videos: [{ id: "1", title: "a", stats: { views: 9, likes: 2 } }], cursor: 5 };
    expect(selectFields(data, ["videos"])).toEqual({ videos: data.videos });
    expect(selectFields(data.videos, ["id", "stats.views"])).toEqual([{ id: "1", stats: { views: 9 } }]);
  });
});

describe("parity with the MCP surface", () => {
  it("routes every tool name, in both spellings", () => {
    for (const tool of ALL_TOOLS) {
      expect(isCliCommand([tool.name])).toBe(true);
      expect(isCliCommand([tool.name.replace(/_/g, "-")])).toBe(true);
    }
  });

  it("builds flags for every tool without throwing", () => {
    for (const tool of ALL_TOOLS) {
      expect(() => flagsFor(tool.schema)).not.toThrow();
    }
  });

  it("gives every schema key a flag", () => {
    for (const tool of ALL_TOOLS) {
      expect(flagsFor(tool.schema)).toHaveLength(Object.keys(tool.schema).length);
    }
  });

  it("leaves the server's own flags alone", () => {
    expect(isCliCommand(["--http"])).toBe(false);
    expect(isCliCommand(["--version"])).toBe(false);
    expect(isCliCommand([])).toBe(false);
  });

  /**
   * `auth` and `doctor` are server subcommands, not tools. If one ever shared a
   * name with a tool the dispatch in index.ts would route it to the wrong half.
   */
  it("does not collide with the server's own subcommands", () => {
    for (const word of ["auth", "doctor", "help"]) {
      expect(isCliCommand([word])).toBe(false);
    }
  });
});

describe("documentation stays in step with the code", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf-8");
  const names = (text: string): Set<string> => new Set(text.match(/TIKTOK_[A-Z_]+/g) ?? []);

  /**
   * Two variables shipped undocumented and five never reached `--help`, which is
   * the kind of drift nobody notices because both sides look complete on their own.
   */
  it("documents every environment variable the code reads", () => {
    const used = names(["config.ts", "transport/http.ts"].map((f) => read(`../src/${f}`)).join("\n"));
    const documented = names(read("../README.md"));
    expect([...used].filter((v) => !documented.has(v))).toEqual([]);
  });

  it("lists every environment variable in --help", () => {
    const used = names(["config.ts", "transport/http.ts"].map((f) => read(`../src/${f}`)).join("\n"));
    const helped = names(read("../src/index.ts"));
    expect([...used].filter((v) => !helped.has(v))).toEqual([]);
  });

  /**
   * Two in-page links pointed at headings that had been renamed, including the
   * one row routing a shell user to the CLI. The ship checklist's link pass only
   * greps http, so a dead `#anchor` is the kind that ships quietly.
   */
  it.each(["../README.md", "../INSTALL.md"])("has no dead in-page anchors in %s", (file) => {
    if (!existsSync(new URL(file, import.meta.url))) return; // repo may ship one doc
    const md = read(file);
    const slugs = new Set<string>();
    for (const [, heading] of md.matchAll(/^#{2,4} (.+)$/gm)) {
      const stripped = (heading as string).toLowerCase().replace(/[^\w\s-]/g, "");
      // GitHub keeps the trailing hyphen when a heading ends in an emoji.
      slugs.add(stripped.trim().replace(/\s+/g, "-"));
      slugs.add(stripped.replace(/\s+/g, "-"));
    }
    const dead = [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)]
      .map((m) => m[1] as string)
      .filter((a) => !slugs.has(a));
    expect(dead).toEqual([]);
  });
});
