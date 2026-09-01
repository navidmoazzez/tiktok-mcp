/**
 * Reading the account's own posts.
 *
 * Everything here is scoped to the connected account. TikTok's official API
 * has no endpoint that reads anybody else's videos, so a question about a
 * competitor has no answer through this server, and saying so plainly beats a
 * tool that returns empty and invites a retry with different arguments.
 *
 * `list_videos` pages on its own past TikTok's 20-per-page ceiling. Making a
 * model drive that cursor by hand costs a round trip per page and usually gets
 * abandoned after the first one.
 */

import { z } from "zod";
import type { TikTokClient } from "../api/client.js";
import { shapeVideo, summarise, VIDEO_FIELDS, type RawVideo, type Video } from "../format/videos.js";
import { accountArg, clamp, defineTool, type AnyToolSpec } from "./kit.js";

/** TikTok's hard ceiling on one page of /video/list/. */
const PAGE_MAX = 20;

type ListPage = { videos?: RawVideo[]; cursor?: number; has_more?: boolean };

/**
 * Page until `want` videos or the account runs out.
 *
 * `maxPages` is a hard stop rather than a nicety. A `has_more` that stays true
 * with a cursor that stops advancing would otherwise spin forever inside a
 * single tool call, and the caller would see a timeout with no explanation.
 */
async function fetchVideos(
  client: TikTokClient,
  want: number,
  startCursor?: number,
): Promise<{ videos: Video[]; cursor: number | null; has_more: boolean }> {
  const out: Video[] = [];
  let cursor = startCursor;
  const maxPages = Math.ceil(want / PAGE_MAX) + 2;
  let hasMore = false;

  for (let page = 0; page < maxPages && out.length < want; page++) {
    const body: Record<string, unknown> = { max_count: Math.min(PAGE_MAX, want - out.length) };
    if (cursor) body.cursor = cursor;

    const data = (await client.request("POST", "/video/list/", {
      fields: VIDEO_FIELDS,
      body,
    })) as ListPage;

    const batch = data.videos ?? [];
    out.push(...batch.map(shapeVideo));
    hasMore = Boolean(data.has_more);

    if (!data.has_more || !data.cursor || batch.length === 0) {
      return { videos: out.slice(0, want), cursor: null, has_more: false };
    }
    if (data.cursor === cursor) {
      /* The cursor did not move. Treat it as the end rather than looping. */
      return { videos: out.slice(0, want), cursor: null, has_more: false };
    }
    cursor = data.cursor;
  }

  return { videos: out.slice(0, want), cursor: cursor ?? null, has_more: hasMore };
}

const listVideos = defineTool({
  name: "list_videos",
  title: "List your TikTok posts",
  description:
    "Your public TikTok posts, newest first, with views, likes, comments, shares and a computed engagement rate. Pages past TikTok's 20-per-page limit automatically. Only public posts appear: TikTok's API cannot see private or draft videos.",
  schema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("How many videos to return. Default 20. Each 20 is one API call, so keep it to what you need."),
    cursor: z
      .number()
      .optional()
      .describe(
        "Continue from a previous page, or pass your own Unix timestamp in MILLIseconds to start from a date. Note this is milliseconds while posted_at is derived from seconds.",
      ),
    ...accountArg,
  },
  risk: "read",
  handler: async ({ limit, cursor, account }, ctx) => {
    const want = clamp(limit, 20, 200);
    const result = await fetchVideos(ctx.client(account), want, cursor);
    return {
      count: result.videos.length,
      has_more: result.has_more,
      next_cursor: result.cursor,
      videos: result.videos,
    };
  },
});

const getVideos = defineTool({
  name: "get_videos",
  title: "Get specific videos by id",
  description:
    "Fetch up to 20 of your videos by id, with full stats. Also the way to refresh a cover_image_url: those links expire 6 hours after they are issued, so a cover that 404s needs this call rather than a cached URL.",
  schema: {
    video_ids: z.array(z.string()).min(1).max(20).describe("TikTok video ids. Maximum 20 per call."),
    ...accountArg,
  },
  risk: "read",
  handler: async ({ video_ids, account }, ctx) => {
    const data = (await ctx.client(account).request("POST", "/video/query/", {
      fields: VIDEO_FIELDS,
      body: { filters: { video_ids } },
    })) as { videos?: RawVideo[] };
    const videos = (data.videos ?? []).map(shapeVideo);

    /* Say which ids came back empty. TikTok silently drops an id that is not
       on this account, and a caller comparing lengths would otherwise guess. */
    const found = new Set(videos.map((v) => v.id));
    const missing = video_ids.filter((id) => !found.has(id));

    return { count: videos.length, videos, ...(missing.length ? { not_found: missing } : {}) };
  },
});

const topVideos = defineTool({
  name: "top_videos",
  title: "Rank your best-performing posts",
  description:
    "Your best posts, ranked. TikTok has no ranked endpoint, so this pages recent videos and sorts them locally: `scan` is how far back it looks, and anything older than that cannot win. Use this rather than calling list_videos and sorting in context, which spends the whole window on videos you discard.",
  schema: {
    metric: z
      .enum(["views", "likes", "comments", "shares", "engagement_rate"])
      .optional()
      .describe("What to rank by. Default views."),
    limit: z.number().int().min(1).max(50).optional().describe("How many to return. Default 10."),
    scan: z
      .number()
      .int()
      .min(20)
      .max(200)
      .optional()
      .describe("How many recent videos to look through before ranking. Default 60, maximum 200."),
    ...accountArg,
  },
  risk: "read",
  handler: async ({ metric, limit, scan, account }, ctx) => {
    const key = (metric ?? "views") as keyof Video;
    const want = clamp(scan, 60, 200);
    const { videos } = await fetchVideos(ctx.client(account), want);

    const ranked = [...videos]
      .sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0))
      .slice(0, clamp(limit, 10, 50));

    return { ranked_by: metric ?? "views", scanned: videos.length, videos: ranked };
  },
});

const searchMyVideos = defineTool({
  name: "search_my_videos",
  title: "Search your own captions",
  description:
    "Find your posts whose title or description matches a query. TikTok has no search over your own library, so this pages recent videos and filters locally. A miss means it is not in the last `scan` videos, not that it does not exist.",
  schema: {
    query: z.string().min(1).describe("Text to look for in the title or description. Case-insensitive."),
    scan: z
      .number()
      .int()
      .min(20)
      .max(200)
      .optional()
      .describe("How many recent videos to search. Default 100, maximum 200."),
    ...accountArg,
  },
  risk: "read",
  handler: async ({ query, scan, account }, ctx) => {
    const want = clamp(scan, 100, 200);
    const { videos } = await fetchVideos(ctx.client(account), want);
    const needle = query.toLowerCase();

    const matches = videos.filter((v) =>
      `${v.title ?? ""} ${v.description ?? ""}`.toLowerCase().includes(needle),
    );

    return {
      query,
      scanned: videos.length,
      matches: matches.length,
      exhaustive: videos.length < want,
      videos: matches,
    };
  },
});

const statsSummary = defineTool({
  name: "stats_summary",
  title: "Summarise performance across recent posts",
  description:
    "Aggregate stats over your recent posts: total and mean views, the median and 90th percentile, mean engagement rate, and how many days apart you post. Reach for this instead of listing videos and adding them up, and read the median rather than the mean: one viral post drags a mean far away from what a typical post of yours actually does.",
  schema: {
    scan: z
      .number()
      .int()
      .min(20)
      .max(200)
      .optional()
      .describe("How many recent videos to include. Default 60, maximum 200."),
    ...accountArg,
  },
  risk: "read",
  handler: async ({ scan, account }, ctx) => {
    const { videos } = await fetchVideos(ctx.client(account), clamp(scan, 60, 200));
    return summarise(videos);
  },
});

export const VIDEO_TOOLS: AnyToolSpec[] = [
  listVideos,
  getVideos,
  topVideos,
  searchMyVideos,
  statsSummary,
] as unknown as AnyToolSpec[];
