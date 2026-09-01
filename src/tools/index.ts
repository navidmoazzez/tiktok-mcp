import { ACCOUNT_TOOLS } from "./accounts.js";
import { PUBLISH_TOOLS } from "./publish.js";
import { VIDEO_TOOLS } from "./videos.js";
import type { AnyToolSpec } from "./kit.js";

/**
 * Grouped by what they reach, not by which endpoint they call. The reader's
 * question is "what can this see", never "which URL is behind it".
 */
export const ALL_TOOLS: AnyToolSpec[] = [...ACCOUNT_TOOLS, ...VIDEO_TOOLS, ...PUBLISH_TOOLS];
