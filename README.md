# CF CMS

**CF CMS** is an open-source multilingual blog and CMS on Cloudflare’s free tier. 免费套餐即可上线：一条脚本部署，一句话把 Agent 接上。

**Live demo / 示例站点:** [jemai.cc](https://jemai.cc), a production blog running CF CMS on the Cloudflare free tier in all five languages.

The sample site shipped in this folder is named Field Notes. Field Notes is the seed content in this repo. [jemai.cc](https://jemai.cc) is a real deployment, not that seed. The product is CF CMS (`cf-cms`).

## Why CF CMS

1. **Zero cost on the Cloudflare free tier.** Pages serves the site, D1 stores posts, R2 stores images, and Workers AI translates on publish. No server to rent.
2. **One script to deploy.** Bring a domain and a Cloudflare API token. `npm install && ./scripts/setup.sh` creates the Pages project, D1 database, R2 bucket, secrets, and the first deployment.
3. **Agent-friendly.** A native MCP server, plus one sentence you paste into Cursor, Claude, or another client.
4. **Prefab themes.** Two original layouts each for a personal tech blog, a lifestyle journal, a traditional business homepage, and a tech-company homepage.
5. **One-click visual kit.** Generate a logo SVG, favicon, and theme color that match the active template. Regenerate or edit them afterward.

Also included: multilingual SEO and GEO (Chinese, English, Japanese, Spanish, and Arabic, with Arabic right-to-left), an admin path hidden behind a secret safepath, and CMS screens for template, brand, layout, channels, meta, site copy, tags, and share links.

```
Browser
  |
  v
Cloudflare Pages Functions  (SSR, /zh /en /ja /es /ar)
  |-- D1      posts, translations, tags, channels, settings
  |-- R2      images
  |-- Workers AI   optional translate on save
  |
  +-- /<ADMIN_SAFEPATH>/admin  secret path, then password or Cloudflare Access
  +-- /mcp    JSON-RPC for agents (Bearer ADMIN_API_TOKEN)
```

## Quickstart

```bash
npm install && ./scripts/setup.sh
```

The script reads `CLOUDFLARE_API_TOKEN` from the environment. When that token can see one account, the account id is filled in for you; with several accounts, pass `--account-id`. Before it creates anything, it prints a preflight checklist (token, Pages, D1, R2, and the zone when you set a domain). R2 must already be enabled. A rerun reuses the same D1 database, R2 bucket, and Pages project. Sample posts are loaded only into a new database. If you omit the admin password, a random one is written to `.dev.vars` and is not printed. Add `--dry-run` to see the checklist and the plan without creating resources.

Local preview, no Cloudflare login:

```bash
cp .dev.vars.example .dev.vars
# set ADMIN_PASSWORD, SESSION_SECRET (16+ chars), ADMIN_API_TOKEN (16+ chars)
npm run db:setup
npm run dev
```

Open `http://127.0.0.1:8791/en/`. The CMS is `http://127.0.0.1:8791/<ADMIN_SAFEPATH>/admin/`. Set `ADMIN_SAFEPATH` in `.dev.vars` (`openssl rand -hex 16`). A request to `/admin` is a 404 and does not show the login form.

## Agent onboarding

Paste one sentence into Cursor, Claude, or another MCP client. Replace `$ADMIN_API_TOKEN` with the secret from `.dev.vars` or the Pages secret, and point the client at this repo.

English:

```
CF CMS (package cf-cms) is an open-source multilingual blog and CMS on the Cloudflare free tier — Pages Functions, D1, R2, and Workers AI — with public routes for zh, en, ja, es, and ar (Arabic is RTL); the admin UI and admin APIs are only at /<ADMIN_SAFEPATH>/admin/ (ADMIN_SAFEPATH is a random secret created by setup, plain /admin returns 404, and the login session is still required on that path); connect its MCP server by posting JSON-RPC to /mcp with header Authorization: Bearer $ADMIN_API_TOKEN (local stdio proxy: npm run mcp with CF_CMS_URL) and use tools project_info, list_posts, get_post, create_post, update_post, publish_post, unpublish_post, delete_post, list_tags, upsert_tag, delete_tag, list_channels, upsert_channel, delete_channel, get_settings, get_site_copy, update_site_copy, update_template, update_layout, update_meta, update_share, update_brand, upload_logo, generate_visual_kit, list_media, upload_media, and delete_media to read the project and manage drafts, published posts, tags, channels, site and per-post meta, per-language site copy (homepage headline, footer line, About page), template, layout, share links, logo, favicon, theme color, visual kits, and R2 media.
```

中文:

```
CF CMS（包名 cf-cms）是跑在 Cloudflare 免费套餐上的开源多语言博客与 CMS，使用 Pages Functions、D1、R2 和 Workers AI，公开路由为 zh、en、ja、es、ar（阿拉伯语从右到左）；后台页面和后台接口只在 /<ADMIN_SAFEPATH>/admin/（ADMIN_SAFEPATH 由安装脚本随机生成，直接访问 /admin 会返回 404，到达该路径后仍要登录会话）；把 MCP 连到 /mcp，请求头使用 Authorization: Bearer $ADMIN_API_TOKEN（本地 stdio 代理是设置 CF_CMS_URL 后执行 npm run mcp），并用 project_info、list_posts、get_post、create_post、update_post、publish_post、unpublish_post、delete_post、list_tags、upsert_tag、delete_tag、list_channels、upsert_channel、delete_channel、get_settings、get_site_copy、update_site_copy、update_template、update_layout、update_meta、update_share、update_brand、upload_logo、generate_visual_kit、list_media、upload_media、delete_media 阅读站点并管理草稿、发布、标签、栏目、站点与文章 meta、分语言站点文案（首页标题、页脚、关于页）、模板、版式、分享链接、标志、favicon、主题色、视觉套件和 R2 媒体。
```

Cursor, remote server (recommended; the token stays in your environment, not in git). Put this in `~/.cursor/mcp.json` or `.cursor/mcp.json`, then export `CFCMS_TOKEN` before you start Cursor:

```json
{
  "mcpServers": {
    "cf-cms": {
      "url": "https://your.site/mcp",
      "headers": {
        "Authorization": "Bearer ${env:CFCMS_TOKEN}"
      }
    }
  }
}
```

`/mcp` answers JSON-RPC over HTTP POST, so any MCP client with a Streamable HTTP transport and a custom header can connect. Use `http://127.0.0.1:8791/mcp` for the local preview.

Cursor, local stdio proxy (for clients that only run commands). Run it from this repo:

```json
{
  "mcpServers": {
    "cf-cms": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "env": {
        "CF_CMS_URL": "https://your.site",
        "ADMIN_API_TOKEN": "${env:CFCMS_TOKEN}"
      }
    }
  }
}
```

The proxy speaks standard MCP stdio: one JSON-RPC message per line on stdin and stdout. Clients that still send `Content-Length` headers are answered in the same framing. `--silent` keeps npm's banner off stdout.

`GET /mcp` returns the same sentences and does not require the token. `POST /mcp` is JSON-RPC (`initialize`, `tools/list`, `tools/call`) and requires `Authorization: Bearer <ADMIN_API_TOKEN>`. The token must be at least 16 characters. It only authorizes content tools. It cannot deploy, read your Cloudflare account, or change Pages secrets.

Example prompts after the client connects:

- Call `project_info`, then summarize the drafts.
- Create a draft in Chinese with slug `edge-notes`, channel `notes`, and translate it.
- Set the template to `launch`, then generate a visual kit.
- Set the homepage headline, footer line, and About page in all five languages with `update_site_copy`.

`translate: true` on `create_post` or `update_post` queues Workers AI. It does not copy the source text into a language that failed. See [Five languages on every publish](#five-languages-on-every-publish).

## Free-tier resources

Confirm current numbers in the Cloudflare dashboard. Typical free allotments:

| Resource | What CF CMS uses | Typical free allotment |
| --- | --- | --- |
| Pages | Site and Functions | 500 builds/month, 100,000 Function requests/day |
| D1 | Posts, settings | 5 GB, daily row read/write limits |
| R2 | Uploaded images | 10 GB, limited Class A/B operations |
| Workers AI | Translation on save | 10,000 Neurons/day |

## API token scopes

Create a custom token for setup only. Do not give it to the writing agent.

Required:

- Account · Cloudflare Pages · Edit
- Account · D1 · Edit
- Account · Workers R2 Storage · Edit
- Account · Account Settings · Read

Custom domain on a zone in the same account:

- Zone · Zone · Read
- Zone · DNS · Edit

Workers AI does not need a token scope. The Pages project uses the `AI` binding at runtime.

Least privilege for the agent: generate `ADMIN_API_TOKEN` with `openssl rand -hex 32`, store it as a Pages secret, and keep the Cloudflare API token off the agent. Rotate the API token after setup if you want deploys to be a separate step.

## Custom domain

1. Keep the zone on the same Cloudflare account. Setup looks the zone up with the API token.
2. Run setup with `--domain example.com`.
3. When that hostname has no A, AAAA, or CNAME, setup creates a proxied CNAME to `<project>.pages.dev`.
4. When those records already exist, setup prints them and leaves them alone. Pass `--replace-dns`, or answer `y` at the prompt, to delete them and write the CNAME. `--yes` does not delete DNS by itself. An old proxied A record on the apex keeps the Pages domain `pending` until it is replaced.
5. Setup then attaches the hostname, retries validation, and prints `active` or `pending`. Certificate issuance and DNS propagation can take several minutes.
6. `SITE_URL` in `wrangler.toml` is set to `https://your.domain` before the first deploy.

## Troubleshooting

Setup stops with a checklist and a bilingual note when a check fails. The note names the step, a dashboard link that includes the account id, what to change, and the rerun command. The API token stays in `CLOUDFLARE_API_TOKEN` and is never printed. Add `--debug` for a redacted stack trace. Progress is stored in gitignored `.cf-cms-setup.json`, so a rerun continues.

| What you see | What to do |
| --- | --- |
| `✗` R2 is not enabled, error 10042 | Open `https://dash.cloudflare.com/<account-id>/r2/overview` and enable R2. Some accounts need a payment method on file first. The free tier still applies afterward. Rerun the printed command. |
| Token rejected, error 10000 | Create a new token with the scopes in [API token scopes](#api-token-scopes). Export `CLOUDFLARE_API_TOKEN` and rerun. |
| Missing permission, error 9109, 10000, or HTTP 403 | The checklist names the probe that failed. Add Account Settings Read, Pages Edit, D1 Edit, and Workers R2 Storage Edit. Add Zone Read and DNS Edit when you use a domain. |
| Any other Cloudflare code, including 8000024 | Read the code and the Cloudflare message in the bilingual note. 8000024 means that request was rejected. It does not mean the Pages token permission is missing. Setup lists Pages with `GET /accounts/<account-id>/pages/projects` and looks up one project with `GET /accounts/<account-id>/pages/projects/<name>`. HTTP 404 or error 8000007 means that project is absent and setup will create it. |
| D1, R2, or Pages already exists | Rerun. The same names are reused. Pass `--database-id <uuid>` only when you want a specific database. |
| D1 database limit | Delete an unused database at `https://dash.cloudflare.com/<account-id>/workers/d1`, then rerun. |
| Pages project name taken | Choose another `--project` value. The name is already used somewhere this token cannot reuse. |
| Several accounts | Copy an id from the printed list and rerun with `--account-id`. |
| Zone missing | Add the site to this account, or rerun with `--skip-domain` to stay on `<project>.pages.dev`. |
| Domain stays `pending` | Read the printed A, AAAA, and CNAME records. Rerun with `--replace-dns` only after you accept replacing them with a proxied CNAME to `<project>.pages.dev`. SSL can still take several minutes once DNS is right. |
| Network error | Check connectivity to `api.cloudflare.com` and rerun. Finished steps are skipped. |
| Sample posts | A new database is seeded once. Later reruns leave posts in place. `--seed` loads the sample again and deletes existing posts, tags, and translations. `--skip-seed` leaves a new database empty. |

```bash
export CLOUDFLARE_API_TOKEN=...
./scripts/setup.sh --yes --project cf-cms --domain blog.example.com --account-id <account-id>
```

## Prefab templates

These are original layouts. The WordPress themes named below were popular references in the last year (install-share lists and 2026 roundups). Nothing is copied from them: no markup, CSS, images, or names used as our own.

| Niche | Templates | Visual references only |
| --- | --- | --- |
| Personal tech blog | Dispatch, Signal | [GeneratePress](https://generatepress.com/) reading columns, still among the most installed themes; [Color Blog Dark](https://www.fs-code.com/blog/best-wordpress-technology-themes) for developer journals |
| Personal lifestyle blog | Atelier, Hearth | Blocksy lifestyle starters (a rising theme in 2026 install data) and airy personal journals such as Ashe; magazine rhythm associated with Soledad |
| Traditional business homepage | Practice, Civic | Astra and Sydney business homepages, plus OceanWP and Kadence business starters |
| Tech company homepage | Launch, Orbit | Kadence SaaS starters and Saasland product homepages; Astra SaaS and Blocksy technology layouts |

Paper, Ink, and Terminal are the original CF CMS layouts. In Template settings, picking another name applies its accent, type, and layout. **Generate visual kit** (on that screen or on Brand) writes an SVG logo and favicon, theme color, and layout for the active template. It does not replace the site description or title suffix, so the homepage keeps the language-specific line. Saving a new theme color recolors a generated kit logo. Replace the logo with your own SVG or a PNG. PNG files go to R2. SVG stays in D1 settings. The stylesheet link includes the active template and brand, so a normal refresh picks up a template change.

## Five languages on every publish

A post goes live as one final version. zh, en, ja, es, and ar are saved together and published together. `require_all_languages` defaults to true. A missing settings key means the same thing. Turn it off on **Meta** (`/<ADMIN_SAFEPATH>/admin/meta`) only when a partial post is intentional.

Save every language in one call. `excerpt` is an alias of `description`. Keywords and `og_image` are optional and fall back to the post-level meta. Tags are slugs. Saving a post never renames a tag; `upsert_tag` is the rename tool.

```json
{
  "slug": "edge-notes",
  "lang": "zh",
  "channel": "notes",
  "tags": ["workers"],
  "translations": {
    "zh": { "title": "边缘笔记", "body": "正文", "keywords": "边缘, Workers" },
    "en": { "title": "Edge notes", "body": "Body", "keywords": "edge, workers" },
    "ja": { "title": "エッジノート", "body": "本文" },
    "es": { "title": "Notas del borde", "body": "Cuerpo" },
    "ar": { "title": "ملاحظات الحافة", "body": "متن" }
  }
}
```

Call `create_post` with that object, then `publish_post`. `publish_post` accepts `all_languages` (default from the setting). When the gate is on, a missing or not-ready language is refused in Chinese and English, and nothing is published. When it passes, every ready language becomes public together. `upsert_translations` writes the same map onto an existing post without changing status or tag names.

The post editor uses a tab per language, a readiness badge for each of the five, and Publish now / Schedule buttons that stay disabled until each language has a title, a body, and the public checkbox. Schedule uses that same gate, and every language goes live together. Per-language keywords and Open Graph image fields fall back to the post fields. The public page emits `hreflang`, `meta name="keywords"`, and `og:image` from the language you are reading.

`translate_post` queues the empty languages (`langs` defaults to all except the source). Long Markdown is split on headings and paragraphs. Code fences, tables, image markup, and command lines stay as written. The work continues in the background and on later requests, so a long post does not have to finish inside one request. `translation_status`, `get_post`, and `GET /<ADMIN_SAFEPATH>/admin/posts/<id>/translation-status` show the job. A failed language stores an error and an empty body. It does not store a hidden copy of the source. `get_post` also returns `coverKey` and `cover`.

## Scheduled publishing

Publishing still goes live immediately. That is the default for the **Publish now** button and for `publish_post` or `create_post` / `update_post` with `status: "published"` and no `publish_at`.

To hold a post, set a go-live time. In the editor choose **Schedule**, enter the time, and submit. `publish_at` on `create_post`, `update_post`, or `publish_post` does the same. The value is ISO 8601 **with an offset or `Z`**, for example `2026-10-18T09:30:00+08:00`. A time with no offset is rejected. The time is stored as UTC. It must be in the future. Until that minute the post is not public: the post URL is a 404, and it is left out of lists, channels, tags, RSS, the sitemap, Article JSON-LD, Open Graph for that post, `llms.txt`, and `llms-full.txt`. There is no separate search index; those lists are the discovery surfaces and use the same rule. After the timestamp the post appears on the next request. Nothing is republished and no cron runs.

The rule is `published_at <= now` at read time. A published row with an empty `published_at` stays live, so existing posts do not move. Drafts stay hidden. `require_all_languages` applies to scheduling the same way it applies to publishing. One `published_at` covers every language.

Times in the editor are the site timezone. The setting key is `timezone` (IANA name, default `UTC`, missing or invalid means `UTC`). It is on **Meta** (`/<ADMIN_SAFEPATH>/admin/meta`) and on MCP `update_meta` / `get_settings`. The field shows the zone label, for example `Asia/Shanghai (GMT+8)`. The post list shows **Scheduled** and that go-live time. Unschedule returns the post to draft. Reschedule picks a new time. Publish now clears the wait and goes live.

Pages Functions cannot run a scheduled Worker, so nothing depends on cron. List HTML is cached for 60 seconds with `stale-while-revalidate` only when nothing is waiting. RSS, the sitemap, and `llms.txt` stay at 300 seconds in that same case. When a post is scheduled, `Cache-Control` and `CDN-Cache-Control` use the shorter of that cap and the seconds until the next go-live, with `must-revalidate` and no stale window, so a cached page cannot outlive the minute it should appear. A not-yet-live URL is `no-store`. No new D1 migration: `posts.published_at` already exists.

`list_posts` accepts `status` `draft`, `published`, `scheduled`, or `any`. `published` still includes scheduled rows. Each row, `get_post`, `publish_post`, and `translation_status` report `visibility` (`draft`, `scheduled`, or `live`), `scheduled`, and `publishAt`. Omitting `publish_at` on `update_post` keeps a go-live time that is already stored. `publish_post` without `publish_at` goes live now.

## Head tags

**Head** (`/<ADMIN_SAFEPATH>/admin/head`, 头部 Meta) adds verification tags to every public page. Admin screens do not get them. Presets: `google-site-verification`, `msvalidate.01` (Bing), `baidu-site-verification`, `yandex-verification`, `p:domain_verify` (Pinterest), `facebook-domain-verification`, and `impact-site-verification`. Impact uses the `value` attribute:

```html
<meta name="impact-site-verification" value="...">
```

The other presets use `content`. An optional raw snippet may contain only `<meta>` and `<link>` tags. Scripts, event handlers, and `javascript:` URLs are removed or rejected. Names that duplicate built-in tags are rejected: charset, viewport, description, robots, canonical, and `og:*`. `get_settings` returns `head_meta` (missing means no extra tags). `update_head_meta` sets `entries` and `raw`.

## Site copy

**Copy** (`/<ADMIN_SAFEPATH>/admin/copy`) edits the public text that used to be fixed in `src/i18n.ts`, per language: the homepage headline (`tagline`), the eyebrow label above it (`kicker`), the line under the headline (`description`), the footer line (`footer`), and the About page (`aboutTitle`, `aboutBody` paragraphs). Every field is optional. An empty field shows the built-in text, so a site that never saves this screen looks exactly as before. `description` falls back to the Meta description, then to the built-in line. The footer copyright still uses `SITE_NAME`.

The settings key is `site_copy`, stored in D1 like the other settings. No migration. `llms.txt` and RSS use a saved tagline or description when there is one.

MCP: `get_site_copy` returns `stored` (saved overrides) and `effective` (what each page shows). `update_site_copy` patches fields; omitted fields stay, `""` or `null` clears a field, a language set to `null` clears that language, and `replace: true` starts from empty. Limits: tagline 160, kicker 80, description 400, footer 200, aboutTitle 120 characters, aboutBody up to 12 paragraphs of 2,000 characters.

```json
{
  "copy": {
    "en": { "tagline": "Cloud launches for small teams", "kicker": "CLOUD · AI · DATA", "footer": "Built on the edge.", "aboutBody": ["We move sites and tools to the edge.", "Based anywhere."] },
    "zh": { "tagline": "帮小团队把业务搬上云", "footer": "生于边缘。" }
  }
}
```

## Footer credit

Every public page, in every template and language, ends the footer with a small muted line: Powered by [CF CMS](https://github.com/jemkuo/cf-cms). The wording stays English, including on Arabic pages. Admin screens do not show it, and it is not part of Article JSON-LD. It is on unless the layout setting `show_powered_by` is false. A saved layout that has no such field stays on. Turn it off under **Layout** (`/<ADMIN_SAFEPATH>/admin/layout`), or with MCP `update_layout` `{ "show_powered_by": false }`. `get_settings` returns the field on the `layout` section.

## Day-2

- Admin URL pattern: `/<ADMIN_SAFEPATH>/admin/`. Setup writes a random `ADMIN_SAFEPATH` Pages secret and prints the URL once. `/admin` and `/admin/login` return 404. After the secret path, the password or Cloudflare Access session is still required. Template, brand, layout, channels, meta, head, site copy, tags, and share links are separate screens. Per-post meta (noindex, canonical, keywords, Open Graph image) is on the post form.
- Rotate secrets with `npx wrangler pages secret put <NAME> --project-name <project>`.
- Re-running `seed/seed.sql` deletes posts and translations. It does not remove your settings rows if you skip the settings tables; the shipped seed deletes posts, tags, and translations only.
- Workers AI quota resets daily. `translate_post` queues translation in the background. It does not run on page views.

## Upgrade

Existing sites pick up the new columns and the translation job table with an additive migration. From this directory, after you pull:

```bash
npx wrangler d1 migrations apply <database-name> --remote
npx wrangler pages deploy public --project-name <project>
```

`<database-name>` is the D1 database created for that site (the setup script uses `<project>-db`). The local preview database in this repo stays `cf-blogger-db` (`npm run db:migrate`). Apply the remote migration before the new code serves traffic. The migration is `migrations/0002_content_ops.sql`. It adds `translations.keywords`, `translations.og_image`, `translations.error`, and `translation_jobs`. Settings keys `require_all_languages` and `head_meta` appear when you save them; a missing key already means “require all five languages” and “no extra head tags”. Scheduled publishing does not add a migration. `posts.published_at` is already there. The new settings key is `timezone` (default `UTC`).

## 中文说明

CF CMS 是可独立开源发布的多语言博客与 CMS，包名 `cf-cms`。

示例站点：[jemai.cc](https://jemai.cc)，用 CF CMS 跑在 Cloudflare 免费套餐上的正式博客，五种语言都有。

1. Cloudflare 免费套餐：Pages、D1、R2、Workers AI，不必另租服务器。
2. 一条脚本部署：准备域名和 Cloudflare API token，执行 `./scripts/setup.sh`。Token 只能看到一个账号时会自动填入 account id。R2 需先在仪表盘开通。已有的 D1、R2、Pages 会复用。未提供管理员密码时，随机密码写入 `.dev.vars`，不会打印出来。
3. 给 Agent 用：原生 MCP，把上面的中文句子贴进客户端即可。
4. 预制主题：个人技术博客、生活方式、传统企业首页、科技公司首页，各两套。
5. 一键视觉套件：按当前模板生成配套标志和主题色。

另外包含五种语言的 SEO / GEO（阿拉伯语从右到左）、隐藏的后台入口 `/<ADMIN_SAFEPATH>/admin/`（直接访问 `/admin` 为 404），以及模板、标志、版式、栏目、meta、站点文案、标签和分享链接设置。示例站点名是 Field Notes。Field Notes 是仓库附带的种子内容，不是线上的 jemai.cc。本地是 `npm run db:setup && npm run dev`，地址 `http://127.0.0.1:8791`。不要把 `.dev.vars` 或 Cloudflare API token 提交进仓库。

公开页脚最后一行是较小、较淡的 “Powered by CF CMS”（各语言都用这句英文，CF CMS 链到 GitHub 仓库）。后台页面不显示，也不会写进 JSON-LD。默认开启。版式里没有 `show_powered_by` 时仍视为开启。在 **Layout**（`/<ADMIN_SAFEPATH>/admin/layout`）取消勾选，或用 MCP `update_layout` 传入 `{ "show_powered_by": false }` 即可关掉。`get_settings` 的 `layout` 段会返回这个字段。

**站点文案**（`/<ADMIN_SAFEPATH>/admin/copy`，Copy）按语言修改原来写死在 `src/i18n.ts` 里的公开文字：首页大标题 `tagline`、标题上方的眉题 `kicker`、标题下的一句话 `description`、页脚那句 `footer`，以及关于页的标题 `aboutTitle` 和段落 `aboutBody`。每项都可以留空，留空就显示内置文字，所以从没保存过这一页的站点和以前完全一样。`description` 先回落到 Meta 描述，再回落到内置文字。页脚版权仍然用 `SITE_NAME`。设置键是 `site_copy`，和其他设置一样存在 D1，不需要迁移。保存了标题或描述时，`llms.txt` 和 RSS 也会用它。MCP 用 `get_site_copy` 读取（`stored` 是已保存的覆盖，`effective` 是页面实际显示的内容），用 `update_site_copy` 按字段修改：没写的字段保持不变，`""` 或 `null` 清空该字段，某种语言设为 `null` 清空该语言，`replace: true` 先全部清空。长度上限：tagline 160、kicker 80、description 400、footer 200、aboutTitle 120 个字符，aboutBody 最多 12 段、每段 2000 字符。

Cursor 推荐用远程方式连接：在 `mcp.json` 里写 `"url": "https://你的站点/mcp"` 和 `"headers": { "Authorization": "Bearer ${env:CFCMS_TOKEN}" }`，令牌放在环境变量里。本地 stdio 代理（`npm run --silent mcp`，设置 `CF_CMS_URL` 和 `ADMIN_API_TOKEN`）使用标准 MCP stdio：标准输入输出每行一条 JSON-RPC 消息；仍发送 `Content-Length` 头的旧客户端也能用，回复会用同样的格式。

定时发布：默认仍是立即公开。编辑器里选 **Publish now**，或调用 `publish_post`、以及 `status` 为 `published` 且不带 `publish_at` 的 `create_post` / `update_post`，文章马上上线。要等到某个时刻，就选 **Schedule**，或传入 `publish_at`。它必须是带时区偏移或 `Z` 的 ISO 8601，例如 `2026-10-18T09:30:00+08:00`，没有偏移会被拒绝，并且必须是将来的时间。库里存 UTC。到这一分钟之前，文章页是 404，列表、栏目、标签、RSS、sitemap、文章 JSON-LD、该文的 Open Graph、`llms.txt` 和 `llms-full.txt` 都不会出现它。没有单独的搜索索引，上面的列表就是发现入口，用的是同一条规则。时间一到，下一次请求就会看到，不用重新部署，也不用 cron。判断是读取时的 `published_at <= now`。已经发布且 `published_at` 为空的旧文章保持公开。`require_all_languages` 对定时和立即发布一样，五种语言同一个时间上线。

后台时间用站点时区。设置键是 `timezone`（IANA 名称，默认 `UTC`，缺少或无效也是 `UTC`），在 **Meta**（`/<ADMIN_SAFEPATH>/admin/meta`），MCP 用 `update_meta` / `get_settings`。输入框旁显示时区标签，例如 `Asia/Shanghai (GMT+8)`。文章列表对未到点的文章显示 **Scheduled** 和上线时间。可以取消定时、改时间，或立即发布。Pages Functions 不能跑定时任务，所以不依赖 cron。没有待发文章时，列表 HTML 仍缓存 60 秒（含 `stale-while-revalidate`），RSS、sitemap 和 `llms.txt` 仍是 300 秒。一旦有定时文章，`Cache-Control` 和 `CDN-Cache-Control` 取该上限和距离下一次上线的秒数中较短的那个，并带 `must-revalidate`、不再使用陈旧缓存，避免列表或 sitemap 把文章拖过上线那一分钟。未到点的文章地址是 `no-store`。这次没有新的 D1 迁移。

`list_posts` 的 `status` 可以是 `draft`、`published`、`scheduled` 或 `any`。`published` 仍包含已定时、尚未公开的文章。`list_posts`、`get_post`、`publish_post` 和 `translation_status` 会返回 `visibility`（`draft`、`scheduled` 或 `live`）、`scheduled` 和 `publishAt`。`update_post` 不传 `publish_at` 会保留已有的上线时间。不带 `publish_at` 的 `publish_post` 会立刻公开。

每篇文章以最终版本发布：zh、en、ja、es、ar 一次写好，一起公开。`create_post` 或 `update_post` 接受 `translations`，五种语言在同一次写入里保存。`excerpt` 等同 `description`。关键词和 `og_image` 可按语言填写，留空则用文章级字段。标签只按 slug 关联，保存文章不会改标签名，改名用 `upsert_tag`。写完后调用 `publish_post`。站点设置 `require_all_languages` 默认开启，缺少该键也视为开启；未就绪的语言会用中文和 English 一起拒绝，并且不会发布。关闭开关在 **Meta**（`/<ADMIN_SAFEPATH>/admin/meta`）。`upsert_translations` 只更新译文。`translate_post` 把还没有译文的语言放进后台队列，长文按标题和段落分段翻译，代码块、表格、图片和命令行保持原样；失败的语言记下错误，不会把原文伪装成译文。进度看 `translation_status` 或 `get_post`。`get_post` 同时返回封面 `coverKey` 和 `cover`。

**Head**（`/<ADMIN_SAFEPATH>/admin/head`，头部 Meta）给每个公开页的 `<head>` 加站点验证标签，后台页面不加。预设包含 Google、Bing（`msvalidate.01`）、百度、Yandex、Pinterest（`p:domain_verify`）、Facebook，以及 Impact。Impact 必须是 `value` 属性：`<meta name="impact-site-verification" value="...">`。可选的原始片段只允许 `<meta>` 和 `<link>`。`get_settings` 返回 `head_meta`，缺少则为空。`update_head_meta` 写入它。

### 升级

已有站点在仓库目录执行（先迁移，再部署）：

```bash
npx wrangler d1 migrations apply <database-name> --remote
npx wrangler pages deploy public --project-name <project>
```

`<database-name>` 是该站点的 D1 名称，安装脚本默认是 `<project>-db`。迁移文件是 `migrations/0002_content_ops.sql`，只增加译文列和 `translation_jobs` 表。本地预览库名仍是 `cf-blogger-db`。定时发布不新增迁移。新的设置键是 `timezone`，默认 `UTC`。

### 故障排查

安装脚本会先打印预检清单（`✓` / `✗`）。有 `✗` 时不会创建资源。失败说明同时给出中文和 English：哪一步、原因、带 account id 的仪表盘链接、处理办法，以及重跑命令。Token 放在环境变量 `CLOUDFLARE_API_TOKEN` 里，不会出现在命令或输出中。加 `--debug` 才会打印去掉密钥后的堆栈。进度写在被 git 忽略的 `.cf-cms-setup.json`，重跑会接着做。

- **R2 未开通（错误 10042）。** 打开 `https://dash.cloudflare.com/<account-id>/r2/overview` 开通 R2。有的账号要先添加付款方式，开通后仍可走免费额度。然后重跑。
- **Token 无效（错误 10000）或权限不足（错误 9109、HTTP 403）。** 按上面的权限表补齐：Account Settings 读取、Pages 编辑、D1 编辑、R2 编辑。要绑域名时再加上 Zone 读取和 DNS 编辑。
- **其他错误码（例如 8000024）。** 看说明里的错误码和 Cloudflare 原文。8000024 表示这次请求不被接受，并不是 Pages 权限缺失。预检列出项目用 `GET /accounts/<account-id>/pages/projects`（不带分页参数），确认某个项目用 `GET /accounts/<account-id>/pages/projects/<name>`。HTTP 404 或错误 8000007 表示项目还不存在，安装会去创建。
- **同名资源已存在。** 直接重跑。同名 D1、R2、Pages 会复用，迁移可以重复执行。
- **D1 数量到上限。** 在 `https://dash.cloudflare.com/<account-id>/workers/d1` 删掉不用的库，再重跑。
- **Pages 项目名被占用。** 换一个 `--project`。
- **多个账号。** 从清单里选一个 id，用 `--account-id` 重跑。
- **域名一直 pending。** 主机名上如果还有旧的 A、AAAA 或 CNAME，脚本会列出来并且默认不删除。确认可以改指向后，加 `--replace-dns` 重跑（交互模式下回答 `y` 也可以）。它会写成指向 `<project>.pages.dev` 的橙色云 CNAME，然后重试验证。证书和解析可能还要几分钟。`--yes` 本身不会改 DNS。
- **网络错误。** 确认能访问 Cloudflare API 后重跑。
- **示例文章。** 只有新建的数据库会写入示例文章。之后重跑不会再写。`--seed` 会删除已有文章、标签和译文并重新写入。`--skip-seed` 则连新库也不写入。

```bash
export CLOUDFLARE_API_TOKEN=...
./scripts/setup.sh --yes --project cf-cms --domain blog.example.com --account-id <account-id>
```

## Publishing this folder

This directory is the public repository root for CF CMS. The npm package name is `cf-cms`. The public repository is [github.com/jemkuo/cf-cms](https://github.com/jemkuo/cf-cms).

Public pages, the footer, About, JSON-LD, share cards, seed posts, and the examples in this file use a product or site name only (`© <year> Field Notes` on the sample site, CF CMS for the kit). Do not add a personal name, address, phone number, or email.
