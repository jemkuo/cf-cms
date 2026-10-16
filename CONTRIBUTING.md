# Contributing

Issues and pull requests are welcome.

## Local loop

```bash
npm install
cp .dev.vars.example .dev.vars
# fill ADMIN_PASSWORD, SESSION_SECRET (16+ characters), ADMIN_API_TOKEN (16+ characters),
# and ADMIN_SAFEPATH (openssl rand -hex 16). The CMS is /<ADMIN_SAFEPATH>/admin/
npm run db:setup
npm run dev
```

The site listens on `http://127.0.0.1:8791`. `npm run check` typechecks and runs the release checks.

Do not commit `.dev.vars`, `.env`, `.wrangler/`, or any API token. Sample posts live in `seed/content.mjs`; regenerate SQL with `npm run seed:file`.

## MCP

With the dev server running, `npm run mcp` speaks MCP on stdio and forwards to `CF_CMS_URL` (default `http://127.0.0.1:8791`). `CF_BLOGGER_URL` is still accepted. Set `ADMIN_API_TOKEN` in the environment of that process. It must match `.dev.vars`.

## Scope

Keep the kit generic. Site name, domain, author, and share links come from env or the CMS, not from hard-coded brands.

## Publish rule

Public copy uses a product or site name only. The product is CF CMS. The sample site name is Field Notes. Do not put personal names, street addresses, phone numbers, or email addresses in the footer, About page, JSON-LD, share cards, seed posts, or README examples. The footer is `© <year> <SITE_NAME>`. Article structured data names the site as an Organization. The sample author is `Field Notes`.
