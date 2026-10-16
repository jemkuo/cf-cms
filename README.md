# CF CMS

**CF CMS** is an open-source multilingual blog and CMS on Cloudflare’s free tier. 免费套餐即可上线：一条脚本部署，一句话把 Agent 接上。

The sample site shipped in this folder is named Field Notes. The product is CF CMS (`cf-cms`).

## Why CF CMS

1. **Zero cost on the Cloudflare free tier.** Pages serves the site, D1 stores posts, R2 stores images, and Workers AI translates on publish. No server to rent.
2. **One script to deploy.** Bring a domain and a Cloudflare API token. `npm install && ./scripts/setup.sh` creates the Pages project, D1 database, R2 bucket, secrets, and the first deployment.
3. **Agent-friendly.** A native MCP server, plus one sentence you paste into Cursor, Claude, or another client.
4. **Prefab themes.** Two original layouts each for a personal tech blog, a lifestyle journal, a traditional business homepage, and a tech-company homepage.
5. **One-click visual kit.** Generate a logo SVG, favicon, and theme color that match the active template. Regenerate or edit them afterward.

Also included: multilingual SEO and GEO (Chinese, English, Japanese, Spanish, and Arabic, with Arabic right-to-left), an admin path hidden behind a secret safepath, and CMS screens for template, brand, layout, channels, meta, tags, and share links.

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
CF CMS (package cf-cms) is an open-source multilingual blog and CMS on the Cloudflare free tier — Pages Functions, D1, R2, and Workers AI — with public routes for zh, en, ja, es, and ar (Arabic is RTL); the admin UI and admin APIs are only at /<ADMIN_SAFEPATH>/admin/ (ADMIN_SAFEPATH is a random secret created by setup, plain /admin returns 404, and the login session is still required on that path); connect its MCP server by posting JSON-RPC to /mcp with header Authorization: Bearer $ADMIN_API_TOKEN (local stdio proxy: npm run mcp with CF_CMS_URL) and use tools project_info, list_posts, get_post, create_post, update_post, publish_post, unpublish_post, delete_post, list_tags, upsert_tag, delete_tag, list_channels, upsert_channel, delete_channel, get_settings, update_template, update_layout, update_meta, update_share, update_brand, upload_logo, generate_visual_kit, list_media, upload_media, and delete_media to read the project and manage drafts, published posts, tags, channels, site and per-post meta, template, layout, share links, logo, favicon, theme color, visual kits, and R2 media.
```

中文:

```
CF CMS（包名 cf-cms）是跑在 Cloudflare 免费套餐上的开源多语言博客与 CMS，使用 Pages Functions、D1、R2 和 Workers AI，公开路由为 zh、en、ja、es、ar（阿拉伯语从右到左）；后台页面和后台接口只在 /<ADMIN_SAFEPATH>/admin/（ADMIN_SAFEPATH 由安装脚本随机生成，直接访问 /admin 会返回 404，到达该路径后仍要登录会话）；把 MCP 连到 /mcp，请求头使用 Authorization: Bearer $ADMIN_API_TOKEN（本地 stdio 代理是设置 CF_CMS_URL 后执行 npm run mcp），并用 project_info、list_posts、get_post、create_post、update_post、publish_post、unpublish_post、delete_post、list_tags、upsert_tag、delete_tag、list_channels、upsert_channel、delete_channel、get_settings、update_template、update_layout、update_meta、update_share、update_brand、upload_logo、generate_visual_kit、list_media、upload_media、delete_media 阅读站点并管理草稿、发布、标签、栏目、站点与文章 meta、模板、版式、分享链接、标志、favicon、主题色、视觉套件和 R2 媒体。
```

Cursor stdio config (token stays in your environment, not in git):

```json
{
  "mcpServers": {
    "cf-cms": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": {
        "CF_CMS_URL": "http://127.0.0.1:8791",
        "ADMIN_API_TOKEN": "paste-your-token"
      }
    }
  }
}
```

`GET /mcp` returns the same sentences and does not require the token. `POST /mcp` is JSON-RPC (`initialize`, `tools/list`, `tools/call`) and requires `Authorization: Bearer <ADMIN_API_TOKEN>`. The token must be at least 16 characters. It only authorizes content tools. It cannot deploy, read your Cloudflare account, or change Pages secrets.

Example prompts after the client connects:

- Call `project_info`, then summarize the drafts.
- Create a draft in Chinese with slug `edge-notes`, channel `notes`, and translate it.
- Set the template to `launch`, then generate a visual kit.

`translate: true` on `create_post` or `update_post` calls Workers AI. Locally that binding is remote, so a machine that is not logged in to Cloudflare stores an unpublished fallback instead of a public translation.

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
| Missing permission, error 9109 | The checklist names the probe that failed. Add Account Settings Read, Pages Edit, D1 Edit, and Workers R2 Storage Edit. Add Zone Read and DNS Edit when you use a domain. |
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

## Day-2

- Admin URL pattern: `/<ADMIN_SAFEPATH>/admin/`. Setup writes a random `ADMIN_SAFEPATH` Pages secret and prints the URL once. `/admin` and `/admin/login` return 404. After the secret path, the password or Cloudflare Access session is still required. Template, brand, layout, channels, meta, tags, and share links are separate screens. Per-post meta (noindex, canonical, keywords, Open Graph image) is on the post form.
- Rotate secrets with `npx wrangler pages secret put <NAME> --project-name <project>`.
- Re-running `seed/seed.sql` deletes posts and translations. It does not remove your settings rows if you skip the settings tables; the shipped seed deletes posts, tags, and translations only.
- Workers AI quota resets daily. Translation runs when you save or when an agent sets `translate: true`, not on every page view.

## 中文说明

CF CMS 是可独立开源发布的多语言博客与 CMS，包名 `cf-cms`。

1. Cloudflare 免费套餐：Pages、D1、R2、Workers AI，不必另租服务器。
2. 一条脚本部署：准备域名和 Cloudflare API token，执行 `./scripts/setup.sh`。Token 只能看到一个账号时会自动填入 account id。R2 需先在仪表盘开通。已有的 D1、R2、Pages 会复用。未提供管理员密码时，随机密码写入 `.dev.vars`，不会打印出来。
3. 给 Agent 用：原生 MCP，把上面的中文句子贴进客户端即可。
4. 预制主题：个人技术博客、生活方式、传统企业首页、科技公司首页，各两套。
5. 一键视觉套件：按当前模板生成配套标志和主题色。

另外包含五种语言的 SEO / GEO（阿拉伯语从右到左）、隐藏的后台入口 `/<ADMIN_SAFEPATH>/admin/`（直接访问 `/admin` 为 404），以及模板、标志、版式、栏目、meta、标签和分享链接设置。示例站点名是 Field Notes。本地是 `npm run db:setup && npm run dev`，地址 `http://127.0.0.1:8791`。不要把 `.dev.vars` 或 Cloudflare API token 提交进仓库。

### 故障排查

安装脚本会先打印预检清单（`✓` / `✗`）。有 `✗` 时不会创建资源。失败说明同时给出中文和 English：哪一步、原因、带 account id 的仪表盘链接、处理办法，以及重跑命令。Token 放在环境变量 `CLOUDFLARE_API_TOKEN` 里，不会出现在命令或输出中。加 `--debug` 才会打印去掉密钥后的堆栈。进度写在被 git 忽略的 `.cf-cms-setup.json`，重跑会接着做。

- **R2 未开通（错误 10042）。** 打开 `https://dash.cloudflare.com/<account-id>/r2/overview` 开通 R2。有的账号要先添加付款方式，开通后仍可走免费额度。然后重跑。
- **Token 无效（错误 10000）或权限不足（错误 9109）。** 按上面的权限表补齐：Account Settings 读取、Pages 编辑、D1 编辑、R2 编辑。要绑域名时再加上 Zone 读取和 DNS 编辑。
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
