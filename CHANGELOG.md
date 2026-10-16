# Changelog

## Unreleased

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
