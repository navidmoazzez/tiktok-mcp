/**
 * TikTok's error envelope, turned into something a caller can act on.
 *
 * Two things make this necessary rather than decorative.
 *
 * TikTok answers HTTP 200 with `error.code` set to a failure for a whole class
 * of problems, so checking the status alone reports success on a call that did
 * nothing. And its codes are precise but opaque: `unaudited_client_can_only_
 * post_to_private_accounts` tells you exactly what happened only if you
 * already know what an audit is.
 */

export class TikTokError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly status: number,
    readonly logId?: string,
  ) {
    super(message);
    this.name = "TikTokError";
  }
}

/**
 * Every message here ends with the action that fixes it. A model handed
 * "rate_limit_exceeded" retries immediately; handed "wait a minute" it waits.
 */
const EXPLAIN: Record<string, string> = {
  scope_not_authorized:
    "This account did not grant the scope this tool needs. Publishing needs video.publish, drafts need video.upload. Add the Content Posting API product to your TikTok app, then re-run `tiktok-mcp auth` so the new scope is granted.",
  access_token_invalid:
    "The access token was rejected. Your refresh token has probably expired: they last 365 days. Run `tiktok-mcp auth` again to mint a new one.",
  unaudited_client_can_only_post_to_private_accounts:
    "TikTok blocks public posting from an app it has not audited. Either post with privacy_level SELF_ONLY, or apply for the Content Posting API audit in the TikTok developer portal.",
  url_ownership_unverified:
    "TikTok will only pull media from a domain you have proved you own. Add the domain under URL Properties in your TikTok app settings and verify it, then retry with a URL on that domain.",
  privacy_level_option_mismatch:
    "That privacy level is not available on this account. Call get_creator_info and pass one of the values it returns in privacy_level_options.",
  spam_risk_too_many_posts:
    "This account has hit TikTok's daily cap for posts made through the API. It resets on a rolling 24-hour window; posting from the app still works.",
  spam_risk_too_many_pending_share:
    "This account has more than 5 unpublished drafts from the API in the last 24 hours. Publish or discard some in the TikTok app first.",
  spam_risk_user_banned_from_posting:
    "TikTok has banned this account from new posts. Retrying will not help.",
  reached_active_user_cap:
    "Your TikTok app has hit its daily cap for distinct publishing users. It resets on a rolling 24-hour window.",
  rate_limit_exceeded:
    "Rate limited by TikTok. The posting endpoints allow 6 calls a minute per user, status checks 30. Wait a minute and retry.",
  invalid_publish_id: "No post with that publish_id. Check the value returned when the post was created.",
};

/**
 * Read TikTok's response and either return the payload or throw something
 * legible. `status` is passed in because the envelope alone cannot distinguish
 * a transport failure from a rejected call.
 */
export function unwrap(status: number, body: unknown): unknown {
  const envelope = body as {
    data?: unknown;
    error?: { code?: string; message?: string; log_id?: string };
  };
  const code = envelope?.error?.code;
  const logId = envelope?.error?.log_id;

  if (code && code !== "ok") {
    const explained = EXPLAIN[code];
    const raw = envelope?.error?.message?.trim();
    const message = explained ?? (raw ? `TikTok: ${raw}` : `TikTok rejected the call: ${code}`);
    throw new TikTokError(message, code, status, logId);
  }

  if (status < 200 || status >= 300) {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    throw new TikTokError(`TikTok returned HTTP ${status}: ${raw.slice(0, 300)}`, code, status, logId);
  }

  return envelope?.data ?? body;
}
