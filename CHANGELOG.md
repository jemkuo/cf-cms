# Changelog

## Unreleased

- A post can stay unpublished until a future `published_at`. Publish now is still the default and goes live immediately. Until the go-live minute the post is absent from the post page (404), lists, channels, tags, RSS, the sitemap, Article JSON-LD, that post's Open Graph tags, `llms.txt`, and `llms-full.txt`. The check is `published_at <= now` on each read, so it does not need a cron and works on the Cloudflare free tier. Pages Functions cannot run a scheduled Worker. When a post is waiting, `Cache-Control` and `CDN-Cache-Control` expire at the next go-live (no stale-while-revalidate); otherwise list HTML stays at 60 seconds and feeds, the sitemap, and `llms.txt` stay at 300 seconds. A not-yet-live URL is `no-store`.
- The editor offers Publish now (default) or Schedule. Times are entered in the site timezone. New settings key `timezone` (IANA name, default `UTC`; a missing or invalid value is `UTC`) is on the Meta screen and on MCP `update_meta` / `get_settings`. The post list shows Scheduled and the go-live time. Unschedule, reschedule, and publish now are all available. Scheduling uses the same `require_all_languages` gate as publishing, and every language goes live together.
- `create_post`, `update_post`, and `publish_post` take optional `publish_at` (ISO 8601 with an offset or `Z`). `list_posts` accepts `status: "scheduled"`. `published` still includes scheduled rows. `list_posts`, `get_post`, `publish_post`, and `translation_status` report `visibility`, `scheduled`, and `publishAt`. No new migration: `posts.published_at` already exists, and existing published posts stay live.
- Posts publish as one final version across zh, en, ja, es, and ar. `create_post`, `update_post`, and `upsert_translations` save a `translations` map in one write. `publish_post` refuses, in Chinese and English, while any language is missing or not ready. The setting `require_all_languages` defaults to true; a missing key means true. Turn it off on the Meta screen.
- `translate_post` queues chunked Workers AI translation and records a per-language error instead of storing the source text as a fallback. `translation_status` and `get_post` show the job. `get_post` also returns the cover.
- Saving a post attaches tags by slug and does not rename them. Keywords and the Open Graph image can be set per language and fall back to the post. Public pages emit them with hreflang.
- Head tags (头部 Meta) inject site-verification meta into every public page. `impact-site-verification` uses the `value` attribute. `update_head_meta` stores the list. A missing `head_meta` setting is empty.
- Upgrade an existing D1 database with `npx wrangler d1 migrations apply <database-name> --remote` before deploying this version. The new file is `migrations/0002_content_ops.sql`.
- Public pages add a muted footer line, Powered by CF CMS, after the copyright. It uses the same English wording in every language, stays off admin screens and out of JSON-LD, and follows layout setting `show_powered_by` (missing means on). Toggle it on the Layout screen or with MCP `update_layout`.
- Pages preflight calls `GET /accounts/{account}/pages/projects` with no query string, and detects an existing project with `GET /accounts/{account}/pages/projects/{name}`. HTTP 404 and error 8000007 mean the project is absent. Error 8000024 stays an API error and prints Cloudflare's message. Only 9109, 10000, and HTTP 403 are treated as permission failures.
- Setup preflight checks the API token, account, Pages, D1, R2, and the custom-domain zone before it creates anything. Reruns reuse an existing D1 database, R2 bucket, and Pages project. Sample posts load only for a new database unless `--seed` is set. Conflicting DNS records are shown and replaced only with `--replace-dns` or a `y` confirmation. Failures print bilingual guidance instead of a stack trace.
- The product name is CF CMS. The npm package is `cf-cms`. The sample site stays Field Notes.
- Stylesheet URL includes the active template and brand so a refresh loads new CSS. A visual kit no longer replaces the site description or title suffix. Saving a theme color recolors a generated kit logo. Sans and mono templates set heading type.
- Sample posts, the default author, and Article JSON-LD use the product name. The footer stays `© <year> <SITE_NAME>`.
- Admin UI and admin APIs require `/<ADMIN_SAFEPATH>/admin/`. Setup generates `ADMIN_SAFEPATH`. `/admin` returns 404.
- Brand screen for a site mark, theme color, SVG or PNG logo, and favicon. Generate a visual kit (logo SVG included) from the active template.
- Prefab templates for a personal tech blog, lifestyle journal, traditional business homepage, and tech-company homepage. MCP tools: `update_brand`, `upload_logo`, `generate_visual_kit`.

## 0.1.0

- Multilingual blog (zh, en, ja, es, ar, with Arabic right-to-left) on Cloudflare Pages Functions, D1, R2, and Workers AI.
- CMS for posts, per-post meta, template, layout, channels, tags, share links, and media.
- MCP server at `/mcp` plus a stdio proxy, with one onboarding sentence for agents.
- Setup script for a Cloudflare account the operator provides. No bundled secrets.
