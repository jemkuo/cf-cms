# Changelog

## Unreleased

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
