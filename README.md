<img src="https://cdn.navid.media/connectors/tiktok-icon.png" alt="TikTok" width="88">

# TikTok MCP

[![npm](https://img.shields.io/npm/v/@thenavidm/tiktok-mcp?color=orange&label=npm)](https://www.npmjs.com/package/@thenavidm/tiktok-mcp)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/navidmoazzez/tiktok-mcp/ci.yml?branch=main&label=CI)](https://github.com/navidmoazzez/tiktok-mcp/actions)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)

TikTok MCP server for Claude Code and AI agents. Profile, video stats, top posts, publishing, drafts and post status for your own account.

It reads your real numbers. Views, likes, comments and shares per post, straight from TikTok rather than a scraper's guess.

It publishes too: a video or a photo carousel, or a draft into your TikTok inbox that you finish in the app.

14 tools, and everything is scoped to accounts you connect yourself.

Built and maintained by [Navid Moazzez](https://navid.me?utm_source=github&utm_medium=readme&utm_campaign=tiktok-mcp).

```
You:    Which of my TikToks beat my median view count this year, and what do they share?

Claude: [stats_summary → top_videos]
        Median is 4,180 views across your last 60. Eleven beat it.

        Nine of the eleven open on a face with no text overlay. Your
        median post opens on a title card. The two exceptions are both
        under 12 seconds.

        Your best is 214k, which is why your mean reads 21,600 and is
        not a number any other post of yours has come close to.
```

## Contents

| | Section | |
|---|---|---|
| 1 | [What you can ask it](#1-what-you-can-ask-it-) | Real prompts, not features |
| 2 | [Quick install](#2-quick-install-) | The package, no account needed |
| 3 | [Set up your TikTok app](#3-set-up-your-tiktok-app-) | Every click |
| 4 | [Connect your client](#4-connect-your-client-) | Claude Code, Desktop, Cursor |
| 5 | [Check it worked](#5-check-it-worked-) | `doctor` |
| 6 | [Tools](#6-tools-) | All 14, by what they reach |
| 7 | [Writing safely](#7-writing-safely-) | What is guarded and what is not |
| 8 | [Notes and gotchas](#8-notes-and-gotchas-) | The platform's real behaviour |
| 9 | [Troubleshooting](#9-troubleshooting-) | Symptom to cause |
| 10 | [FAQ](#10-faq-) | Including what an MCP server is |

## 1. What you can ask it 💬

- Which of my TikToks beat my median view count, and what do they have in common?
- What is my actual engagement rate per post, not the number the app shows me?
- How often am I posting, and has that changed over the last 60 videos?
- Find every video where I mentioned the AI OS and tell me how they performed.
- Rank my last 200 posts by shares rather than views. Shares are the ones that travel.
- Draft a TikTok from this MP4 and put it in my inbox so I can review it on my phone.
- Publish this photo carousel with the first image as the cover, comments off.
- Did the video I posted twenty minutes ago clear moderation yet?
- My follower count and total likes, then work out my average views per follower.

The thing you cannot do anywhere else: **rank your own catalogue by a metric TikTok's app will not sort by.** The app shows you a grid ordered by date. Asking "which posts actually travelled, by shares, across two hundred videos" has no answer inside TikTok, and it is one call here.

## 2. Quick install ⚡

Node 20 or newer. Nothing else.

    npx -y @thenavidm/tiktok-mcp --version

That is the whole install. `npx` fetches it on demand, so there is nothing to update later.

Installing the package needs no TikTok account. Only the next section does.

## 3. Set up your TikTok app 🔑

TikTok has no personal access tokens. Every integration goes through an app you create, which is more work than most services and is the same for everybody.

> [!TIP]
> Use **Sandbox** mode while you set this up. A sandbox app works immediately with no review, against TikTok accounts you add to it yourself. Only switch to Production when you want other people to use it.

### Before you start

| You need | Check with | If missing |
|---|---|---|
| Node 20 or newer | `node -v` | [nodejs.org](https://nodejs.org) |
| A TikTok developer account | [developers.tiktok.com](https://developers.tiktok.com) | Sign up with your email, it is free |
| The TikTok account you want to connect | | Any account, personal or business |

### Step 1: Create the app

1. Log in at [developers.tiktok.com](https://developers.tiktok.com/login/), click the profile icon in the navigation bar, then **Manage apps**.
2. Click **Connect an app**.
3. When asked to **Select the app owner**, pick an organization if you have one, or your individual developer account.
4. Fill in the app name, icon and description. TikTok shows the description on the screen where you approve access, so write it for yourself.
5. Under **Platforms**, select **Desktop**. This server runs on your machine, which is what that platform means.

### Step 2: Add Login Kit and set the redirect URI

1. In the **Products** section click **Add products**, and add **Login Kit**.
2. In the Login Kit settings, set the **Redirect URI** to exactly:

       http://127.0.0.1:8481/callback/

TikTok allows loopback redirect URIs for desktop apps, which is what lets the next step happen entirely in your terminal. The trailing slash is part of the URI.

### Step 3: Add the scopes

In the **Scopes** section, add these four:

    user.info.basic
    user.info.profile
    user.info.stats
    video.list

Add these two as well, but only if you want to publish. They need the **Content Posting API** product added too:

    video.upload
    video.publish

> [!IMPORTANT]
> Only ask for scopes your app actually has. Sending an unapproved scope to TikTok's authorize URL fails the whole sign-in, not just that one permission.

### Step 4: Get your refresh token

Copy the **Client key** and **Client secret** from the **Credentials** section of the app page, then:

```bash
export TIKTOK_CLIENT_KEY=your_client_key
export TIKTOK_CLIENT_SECRET=your_client_secret

npx -y @thenavidm/tiktok-mcp auth
```

It prints a URL. Open it, approve the access, and the terminal prints a refresh token valid for about 365 days. Add `--publish` if you added the publishing scopes.

### Step 5: Verify a domain, only if you will publish

TikTok downloads media from a URL rather than accepting an upload, and it will only pull from a domain you have proved you own.

1. Click **URL properties** at the top of the app page.
2. Click **Verify properties**.
3. Verify by **Domain** or by **URL prefix**, and follow the instructions shown.

Skip this if you are only reading, and skip it if you only use the drafts tools.

### Revoking access later

Call the `revoke_access` tool, or remove the app from **Settings**, **Security and permissions**, **Manage app permissions** in the TikTok app.

## 4. Connect your client 🔌

### Claude Code

```bash
claude mcp add tiktok \
  -e TIKTOK_CLIENT_KEY=your_client_key \
  -e TIKTOK_CLIENT_SECRET=your_client_secret \
  -e TIKTOK_REFRESH_TOKEN=your_refresh_token \
  -- npx -y @thenavidm/tiktok-mcp@latest
```

Add `--scope user` to make it available in every project rather than the current one.

### Claude Desktop

| Platform | Config file |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "tiktok": {
      "command": "npx",
      "args": ["-y", "@thenavidm/tiktok-mcp@latest"],
      "env": {
        "TIKTOK_CLIENT_KEY": "your_client_key",
        "TIKTOK_CLIENT_SECRET": "your_client_secret",
        "TIKTOK_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

> [!TIP]
> Claude Desktop does not inherit your shell PATH, so a bare `npx` can fail silently. Use the absolute path from `which npx`. Then quit the app completely rather than closing the window.

### Cursor

`.cursor/mcp.json`, same shape as Claude Desktop, key `mcpServers`.

### Windsurf

`~/.codeium/windsurf/mcp_config.json`, key `mcpServers`.

### VS Code

`.vscode/mcp.json`. The key is `servers`, not `mcpServers`, and each entry takes `"type": "stdio"`.

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.tiktok]
command = "npx"
args = ["-y", "@thenavidm/tiktok-mcp@latest"]

[mcp_servers.tiktok.env]
TIKTOK_CLIENT_KEY = "your_client_key"
TIKTOK_CLIENT_SECRET = "your_client_secret"
TIKTOK_REFRESH_TOKEN = "your_refresh_token"
```

### Gemini CLI

`~/.gemini/settings.json`, key `mcpServers`.

### Everything else

Any stdio MCP client takes the same three things: the command `npx`, the args above, and the env block.

### Self-hosted over HTTP

```bash
npx -y @thenavidm/tiktok-mcp@latest --http --port 8000
```

It binds `127.0.0.1` and refuses any other host without `TIKTOK_HTTP_TOKEN` set, because anything that can reach the port can publish to the connected account.

### More than one account

```
TIKTOK_ACCOUNTS=personal:refresh_token_one,brand:refresh_token_two
```

Then pass `account: "brand"` on any tool. Run `auth` once per account to get each token.

## 5. Check it worked 🩺

    npx -y @thenavidm/tiktok-mcp@latest doctor

It tests every configured account, names which scopes were granted, and says which tools are unavailable and why.

The two failures that actually happen:

| It says | Do this |
|---|---|
| `token rejected` | Your refresh token expired or was revoked. Run `auth` again. |
| `publishing unavailable` | The account never granted `video.publish`. Add the Content Posting API product, then `auth --publish`. |

## 6. Tools 🛠️

**Your account**

| Tool | |
|---|---|
| `list_accounts` | Every account configured, and the name to target it by |
| `get_profile` | Username, bio, verified flag, followers, total likes, video count |
| `revoke_access` | Hand the token back to TikTok. Needs `confirm` |

**Your videos**

| Tool | |
|---|---|
| `list_videos` | Your posts newest first, with views, likes, comments, shares and engagement rate. Pages automatically |
| `get_videos` | Up to 20 by id, and the way to refresh an expired cover image URL |
| `top_videos` | Rank by views, likes, comments, shares or engagement rate |
| `search_my_videos` | Find your posts by text in the title or description |
| `stats_summary` | Totals, mean, median, 90th percentile and posting cadence |

**Publishing** — needs `video.publish` or `video.upload`

| Tool | |
|---|---|
| `get_creator_info` | Which privacy levels this account can post at. Call it first |
| `post_video` | Publish a video from a public URL. Needs `confirm` |
| `post_photos` | Publish a carousel of up to 35 images. Needs `confirm` |
| `send_video_to_drafts` | Send a video to your TikTok inbox to finish in the app |
| `send_photos_to_drafts` | Send photos to your inbox |
| `get_post_status` | Track a post through download, moderation and publication |

## 7. Writing safely 🛟

Writes work by default. Publishing is the point of the tool.

The three actions that cannot be undone from a chat window take `confirm: true`: `post_video`, `post_photos` and `revoke_access`. Drafts do not, because they land in your own inbox and go nowhere until you finish them.

| Variable | Effect |
|---|---|
| `TIKTOK_READ_ONLY=1` | Removes all six write tools from the list entirely |
| `TIKTOK_ALLOW_DESTRUCTIVE=0` | Keeps drafts, removes publishing |
| `TIKTOK_AUDIT_LOG=<path>` | One JSON line per attempted write, allowed and blocked |

Captions and bios reach the model fenced and labelled as somebody else's words. That framing helps and it is not a guarantee. For an agent working unattended, `TIKTOK_READ_ONLY=1` is the real defence.

## 8. Notes and gotchas ⚠️

- **It can only see your own account.** TikTok's official API has no endpoint for anybody else's profile, videos, comments, followers, hashtags or search. Nothing here answers a question about a competitor or a trend, and no API key changes that.
- **There is no comments API.** You cannot read or reply to comments on your own posts through TikTok's official API.
- **Access tokens live 24 hours.** The server refreshes them for you. The refresh token behind it lasts 365 days, and rotates each time it is used.
- **An unaudited app posts privately.** Until TikTok audits your app, every post lands private whatever privacy level you pass. Sandbox apps cannot post publicly at all.
- **A public URL is not enough to publish from.** TikTok pulls media only from a domain verified under URL properties. An unverified domain fails with `url_ownership_unverified` however reachable the file is.
- **`privacy_level` must come from `get_creator_info`.** TikTok rejects a value that is not in that account's current list rather than falling back to something safe.
- **Publishing returns a job, not a post.** Poll `get_post_status`. A public post reports no post id until moderation clears it, usually a minute and sometimes hours.
- **Cover image URLs expire after 6 hours.** Re-fetch with `get_videos` rather than storing the link.
- **Five pending drafts per 24 hours.** TikTok caps unpublished API drafts per account.
- **A photo post's title caps at 90 characters**, far shorter than a video caption's 2200. The long text belongs in `description`.
- **Rate limits are per account:** six posting calls a minute, thirty status checks, twenty creator-info queries.
- **Only public videos are visible.** Private and draft videos do not appear in `list_videos`.

## 9. Troubleshooting 🔧

Run `doctor` first. It checks every account and names what is unavailable.

| Symptom | Cause |
|---|---|
| `scope_not_authorized` | The account never granted that scope. Re-run `auth`, with `--publish` if you need posting |
| Token rejected on every call | The refresh token expired after 365 days, or you revoked the app |
| `redirect_uri` error during `auth` | The URI in your app is not byte-identical to `http://127.0.0.1:8481/callback/`, usually the trailing slash |
| `auth` hangs, never returns | Port 8481 is taken. Run `auth --port 9000` and register that URI too |
| `url_ownership_unverified` | The media domain is not verified under URL properties |
| `privacy_level_option_mismatch` | You passed a level not in `get_creator_info`, often after the account went private |
| Post says complete, has no post id | Normal. Moderation has not cleared it yet |
| `unaudited_client_can_only_post_to_private_accounts` | Expected on a sandbox or unaudited app. Post `SELF_ONLY`, or apply for the audit |
| Only nine tools appear | `TIKTOK_READ_ONLY=1` is set |
| Nothing appears in Claude Desktop | It does not inherit your PATH. Use the absolute `npx` path and fully quit the app |

## 10. FAQ ❓

<details>
<summary><b>What is an MCP server?</b></summary>

An MCP server is a standard way to give an AI assistant real access to a tool, so it can act rather than guess. You install it once, your assistant gains the tools, and it works in Claude, Cursor, ChatGPT and anything else that speaks MCP.

</details>

<details>
<summary><b>What is TikTok's API, and why do I need my own app?</b></summary>

TikTok's API is the official way software reads and posts to a TikTok account. Unlike most services it issues no personal access tokens, so every integration goes through an app you register. That is more setup than usual and it is the same for everyone.

</details>

<details>
<summary><b>Do I need to be technical?</b></summary>

You need to be comfortable pasting commands into a terminal and filling in a web form. The developer-app registration is the fiddly part, and section 3 covers every click.

</details>

<details>
<summary><b>Can it see other people's TikToks?</b></summary>

It cannot. TikTok's official API only reaches the account that authorised your app. There is no endpoint for another profile, for search, for hashtags or for trends, so competitor research is not something this can do at any price.

</details>

<details>
<summary><b>Is my data sent anywhere?</b></summary>

Your credentials stay in your own client's config and the server runs on your machine. It talks to TikTok and to nothing else. There is no telemetry and no intermediate service.

</details>

<details>
<summary><b>Can it post something by accident?</b></summary>

It is unlikely to. Publishing requires `confirm: true`, which the model has to set deliberately after reading a description saying why. Setting `TIKTOK_READ_ONLY=1` removes every write tool, and `TIKTOK_ALLOW_DESTRUCTIVE=0` keeps drafts while removing publishing.

</details>

<details>
<summary><b>Does it cost anything?</b></summary>

It costs nothing. The server is MIT licensed and TikTok's Display and Content Posting APIs are free.

</details>

<details>
<summary><b>Why does everything post privately?</b></summary>

TikTok restricts unaudited apps to private posts, whatever privacy level you request. Apply for the Content Posting API audit in the developer portal to lift it, or keep using the drafts tools and publish from the app.

</details>

<details>
<summary><b>Can I connect more than one account?</b></summary>

You can. Run `auth` once per account and list them in `TIKTOK_ACCOUNTS` as `name:token` pairs, then pass `account` on any tool. Each account is refreshed independently, so one expired token does not hide the others.

</details>

<details>
<summary><b>What happens when my token expires?</b></summary>

Access tokens expire every 24 hours and the server refreshes them silently. The refresh token behind them lasts 365 days, after which `doctor` reports the account as rejected and you run `auth` again.

</details>

<details>
<summary><b>Does it work with ChatGPT and Cursor?</b></summary>

It works with Cursor, Windsurf, VS Code, Codex CLI, Gemini CLI and anything else speaking MCP over stdio, all covered in section 4. For a hosted client that needs a URL, run it with `--http` behind your own HTTPS endpoint.

</details>

<details>
<summary><b>How do I disconnect it?</b></summary>

Call `revoke_access`, or open the TikTok app and remove the app under Settings, Security and permissions, Manage app permissions. Then delete the entry from your client's config.

</details>

## Questions

Run into a problem or have a question? [Open an issue](https://github.com/navidmoazzez/tiktok-mcp/issues) and I will help.

## About the author 👋

Navid Moazzez is a leading AI business strategist, and the host of the AI Creator Summit, watched by 100,000+ creators. He helps creators and founders master AI and build their own AI Operating System (AI OS) to automate their business and life. This TikTok MCP server is one piece of that system.

**Links**

- Personal website: [navid.me](https://navid.me)
- Store: [navid.bio](https://navid.bio)
- Navid Media: [navid.media](https://navid.media)
- YouTube: [@thenavidm](https://youtube.com/@thenavidm?sub_confirmation=1) and [@thenavidai](https://youtube.com/@thenavidai?sub_confirmation=1)
- X: [@thenavidm](https://x.com/thenavidm)
- Instagram: [@thenavidm](https://instagram.com/thenavidm)
- LinkedIn: [thenavidm](https://linkedin.com/in/thenavidm)

## Dependencies

| Library | Licence | What it does |
|---|---|---|
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | The MCP protocol, stdio and streamable HTTP transports |
| [zod](https://github.com/colinhacks/zod) | MIT | Tool input schemas, and the validation behind them |

## License

[MIT](./LICENSE). Free to use, modify, and share.

Not affiliated with, endorsed by, or sponsored by TikTok. TikTok is a trademark of ByteDance Ltd.

---

© 2026 [NM Media](https://navid.media). Made with ❤️ by [Navid Moazzez](https://navid.me).
