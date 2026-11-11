# Fera Learn — LMS SaaS

Multi-tenant Learning Management System for schools, course academies and companies.
Laravel 13 API + React SPA, deployed to `lms.ferasolution.com`.

## How tenancy works

- One database. Every tenant-owned table has a `tenant_id`, and the `BelongsToTenant`
  trait scopes all queries to the current institute automatically.
- The current institute is resolved by `ResolveTenant` from, in order:
  1. a subdomain of `TENANCY_CENTRAL_DOMAIN` (`acme.lms.ferasolution.com`, needs wildcard DNS)
  2. a tenant's `custom_domain`
  3. the `X-Tenant` header (what the SPA uses today: `lms.ferasolution.com/acme`)
- Tenant resolution runs before authentication and route-model binding, so tokens and
  `{course}` / `{user}` lookups can never cross institutes. `tests/Feature/TenancyTest.php`
  covers this.

## Roles

`super_admin` (platform owner, no tenant) · `admin` · `instructor` · `student` · `parent` · `manager`

## API (so far)

| Method | Path | Who |
|---|---|---|
| POST | `/api/register-institute` | public |
| POST | `/api/platform/login` | super admin |
| GET / PATCH | `/api/platform/tenants[/{id}]` | super admin |
| POST | `/api/auth/login` | tenant users |
| GET | `/api/auth/me` · POST `/api/auth/logout` | signed in |
| GET | `/api/courses[/{id}]` | signed in (students see published only) |
| POST / PATCH / DELETE | `/api/courses[/{id}]` | admin, instructor (own courses) |
| GET / POST / PATCH | `/api/users[/{id}]` | admin |

Tenant routes need the `X-Tenant: <slug>` header and `Authorization: Bearer <token>`.

## Local development

```bash
composer install
npm install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
php artisan lms:super-admin you@example.com
npm run dev   # in one terminal
php artisan serve
```

## Deployment (GitHub Actions → Bluehost)

Every push to `main` runs the tests, then deploys over SSH.

**One-time server setup**

1. PHP **8.3+** for the subdomain (cPanel → MultiPHP Manager) and on the command line.
2. Document root of `lms.ferasolution.com` points to `<DEPLOY_PATH>/public`.
3. Create `<DEPLOY_PATH>/.env` on the server from `.env.example` with:
   `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://lms.ferasolution.com`,
   `TENANCY_CENTRAL_DOMAIN=lms.ferasolution.com`, the MySQL `DB_*` values, and an `APP_KEY`
   (generate one with `php artisan key:generate --show`).
4. After the first deploy: `php artisan lms:super-admin you@example.com`.

**GitHub → Settings → Secrets and variables → Actions**

| Secret | Example |
|---|---|
| `SSH_HOST` | `ferasolution.com` |
| `SSH_USER` | cPanel username |
| `SSH_PRIVATE_KEY` | private key whose public key is authorised in cPanel → SSH Access |
| `DEPLOY_PATH` | `/home2/<user>/lms.ferasolution.com` |
| `SSH_PORT` | optional, default `22` |
| `PHP_BIN` | optional, e.g. `/opt/cpanel/ea-php83/root/usr/bin/php` if `php` is older |

Until the secrets exist, the deploy job is skipped and only tests run.

## Roadmap

- **Phase 1 (in progress):** institutes, roles, courses ✔ · sections & lessons · video (Bunny Stream) ·
  quizzes · enrolment & progress · Stripe / JazzCash / Easypaisa · certificates · SaaS billing
- **Phase 2:** school mode — classes, attendance, timetable, exams, report cards, parent portal, fees
- **Phase 3:** corporate mode, live classes, analytics, custom domains
- **Phase 4:** mobile app (React Native, same API)
