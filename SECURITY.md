# Security

Report vulnerabilities through a private GitHub security advisory on this repository:

`https://github.com/jemkuo/cf-cms/security/advisories/new`

Do not open a public issue for a security report. Do not include API tokens, admin passwords, session secrets, or the contents of `.dev.vars`. A short description, the affected version, and a proof of concept that uses placeholders are enough.

`ADMIN_SAFEPATH` is the unlisted prefix for `/<ADMIN_SAFEPATH>/admin/`. Do not put it in public issues, robots.txt, or screenshots of a production site. `ADMIN_API_TOKEN` only authorizes the `/mcp` content API. It is not a Cloudflare API token. The Cloudflare token used by `scripts/setup.sh` can create Pages, D1, and R2 resources; keep that token out of the agent and out of git. Rotate both tokens if they leak.
