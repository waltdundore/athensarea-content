# athensarea.net

Single-page Athens, GA local-news aggregator. One `docker compose` stack serves:

- **Site** — static SPA (nginx, host port `:8888`): RSS news feed with source
  filters, NWS weather widget, SQLite classifieds board.
- **Proxy** — Node.js (`:3001`, internal): whitelist-only RSS proxy
  (`/api/rss`), classifieds API (`/api/listings`, `/api/config`), Cloudflare
  Turnstile verification.
- **Community** — self-hosted Lemmy at `social.athensarea.net`
  (lemmy-proxy `:10633`, Lemmy + UI + pictrs + Postgres).

## Prerequisites

Docker with Compose v2, `openssl`, and `envsubst` (part of GNU `gettext`).

## Setup

```sh
make env      # create .env from .env.example with random Lemmy secrets (chmod 600)
make config   # render .lemmy/config.hjson from .env (fails if secrets are empty)
make up       # config + docker compose up -d
make status   # compose ps
make logs     # compose logs -f --tail=100
make check    # static checks: JS syntax, compose config, index.html asset refs
```

`.env` and `.lemmy/` are git-ignored and blocked from the web root by
`nginx.conf`; `nginx.conf` also 404s the non-site repo paths (`/proxy/`,
`/lemmy/`, `nginx.conf`, `Makefile`, `docker-compose.yml`, `README.md`,
`LICENSE`, `SPEC.md`, `AUDIT.md`, dotfiles).

### Turnstile (classifieds anti-abuse)

Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` in `.env` **together** — never
one without the other:

- both empty → the form posts without a CAPTCHA;
- secret without site key → the widget cannot render and **every post is
  rejected** (the proxy logs a startup warning);
- site key without secret → `GET /api/config` reports Turnstile inactive, so
  **no widget is rendered and posts go through unverified** (fail-open).

After changing either key: `docker compose up -d proxy`. The client fetches
`GET /api/config` when the post modal opens and only loads
`challenges.cloudflare.com` when the server reports Turnstile active. Note the
board is open-posting even without Turnstile; keep the form unlisted until the
keys (O-4) are in place if that matters.

### Community first run

Lemmy reads no environment variables; its config is rendered by `make config`
before the containers start. On first run, open `http://<community host>/setup`
in a browser to set the site name and registration policy (O-6) — this is a
browser-only step, not scriptable from this repo.

## External dependencies

- **Reddit r/Athens feed** is fetched **client-side** (`js/feed.js`): every
  visitor hits reddit.com from *their* IP, not the server's. A 403 seen from a
  datacenter/inspection IP is expected; the page degrades to the empty state.
- NWS weather API, Google Fonts, Cloudflare Turnstile (only when enabled).

## Deploy

**Automated** — `.github/workflows/deploy.yml` runs on push to `production`:
writes `.env` from GitHub Secrets, renders the Lemmy config (`make config`
before `up`, so Docker can't create a directory at the bind-mount path), ships
both to the host over SSH (pinned `known_hosts`), `git pull --ff-only`,
`docker compose up -d --remove-orphans`, `restart proxy` (unchanged containers
are not recreated by `up -d`), then smoke-tests `localhost:8888/` and the
proxy `/health`. Required secrets: `DEPLOY_USER`, `DEPLOY_HOST`, `DEPLOY_PATH`,
`DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, plus the `.env` values
(`LEMMY_DOMAIN`, `LEMMY_HTTP_PORT`, `LEMMY_UI_HTTPS`, `LEMMY_DB_PASSWORD`,
`LEMMY_PICTRS_API_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`).

**Manual** — on the host: `git pull --ff-only origin production`, then
`make up` (or `docker compose up -d --remove-orphans && docker compose restart
proxy`).

**Git push is operator-owned** (fleet identity policy): the `production` branch
on `github.com/waltdundore/athensarea-content` is updated by the operator only.

### Operator-owned prerequisites

- **O-1** Host running the stack + TLS front for athensarea.net and
  social.athensarea.net (`:80`/`:443` → site `:8888`; `:443` → `127.0.0.1:10633`
  with Host preserved, `proxy_http_version 1.1` + `Upgrade`/`Connection` for
  WebSocket, `client_max_body_size 20M`).
- **O-2** DNS for athensarea.net and social.athensarea.net.
- **O-3** Deploy mechanism choice: GitHub Actions (secrets above) or manual.
- **O-4** Cloudflare Turnstile site key + secret.
- **O-5** Git push to `origin production`.
- **O-6** Lemmy registration policy, set at first-run `/setup`.

`LEMMY_DOMAIN` must equal the exact public host (no port); federation identity
cannot change casually. Set `LEMMY_UI_HTTPS=true` under TLS.
=======
# athensarea-content

## Ahab tier-1 relationship — expected vs. actual

Contract: `ahab@prod` `BLUEPRINT.md` § Portability Contract — a tier-2 module
contributes ONLY inventory + role assignment (+ vars) + vault references; all
machinery lives once in ahab; a module carrying its own copy of a
role/script/template/Makefile is a defect.

| Expected per contract | Actual (measured 2026-09-21) | Closed by |
|---|---|---|
| A tier-2 `athensarea` module repo (inventory + manifest + vault refs) plus tier-3 content — ahab BLUEPRINT L43: "ahab + athensarea = athensarea.net" | **no tier-2 module repo exists** (measured 2026-09-21, `gh repo list` waltdundore: only `athensarea-content`). This repo is tier-3 content (static site: html/css/js + nginx + docker-compose); zero ahab references; no `.ahab/` deploy manifest | M5 (not started) |
