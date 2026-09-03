# Versions

| Component | Version |
|---|---|
| `@modelcontextprotocol/sdk` | ^1.30.0 |
| TikTok Display API | v2 |
| TikTok Content Posting API | v2 |
| Node | >= 20 |

## Unreleased

A second surface. The same 14 tools now run as `tiktok-cli` shell commands,
generated from the one `ALL_TOOLS` array through the same handlers and the same
`WriteGuard`, so the two surfaces cannot drift. `--agent` and `--select` make a
long video list affordable to an agent, and exit codes let a script branch
without parsing a message.

A refusal now names the syntax of the surface it happened on: `--confirm` in a
terminal, `confirm: true` in a tool call.

Fixed: a missing credential exited 4, the code for a rejected token, because
the message mentions a refresh token. It exits 10 now, and the three
`TIKTOK_HTTP_*` variables reached neither `--help` nor the README.

The long-form auth walkthrough moved from `references/setup.md` to `INSTALL.md`.
Nothing under `references/` was in `files`, so it shipped to nobody.

## 1.0.0

First release. 14 tools over TikTok's official Login Kit, Display API and
Content Posting API, for accounts you connect yourself.

Reading covers the profile and audience, every public video with views, likes,
comments, shares and a computed engagement rate, local ranking and search across
a scanned window, and an aggregate summary that reports a median alongside the
mean so one viral post cannot stand in for a typical one.

Publishing covers videos and photo carousels, plus a drafts path that needs only
`video.upload` and therefore works before TikTok has audited the app.

Two things drove the design. TikTok access tokens expire in 24 hours, so the
client refreshes on its own and keeps the rotated refresh token, which is the
difference between a server that works for a year and one that works for a day.
And TikTok's desktop OAuth flow wants a hex-encoded PKCE challenge rather than
the base64url that its own web flow uses, so `auth` implements the desktop
variant and a loopback listener rather than asking anyone to paste a code.
