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

## Deployment (GitHub Actions → Bluehost over FTPS)

Every push to `main` runs the tests, uploads the built app over FTPS (only changed files after
the first time), then calls `POST /api/_deploy` with the `DEPLOY_TOKEN`, which runs migrations,
seeds the plans and rebuilds Laravel's caches. No SSH or cPanel access is needed.

**One-time server setup**

1. PHP **8.3+** for the subdomain (cPanel → MultiPHP Manager).
2. Document root of `lms.ferasolution.com` points to its `public` folder.
3. An FTP account whose home folder is the subdomain folder (the one that contains `public`).
4. Upload a `.env` to that folder (see `.env.example`) with `APP_ENV=production`, `APP_DEBUG=false`,
   `APP_URL`, `TENANCY_CENTRAL_DOMAIN=lms.ferasolution.com`, the MySQL `DB_*` values,
   `APP_KEY` and `DEPLOY_TOKEN`.
5. After the first deploy, open `https://lms.ferasolution.com/platform/setup` once to create the
   platform owner. The page closes itself after that.

**GitHub → Settings → Secrets and variables → Actions**

| Secret | Value |
|---|---|
| `FTP_SERVER` | `ftp.ferasolution.com` |
| `FTP_USERNAME` | the FTP account, e.g. `deploy@lms.ferasolution.com` |
| `FTP_PASSWORD` | its password |
| `DEPLOY_TOKEN` | same value as `DEPLOY_TOKEN` in the server `.env` |
| `FTP_SERVER_DIR` | optional, only if the FTP home is not the subdomain folder (must end with `/`) |

Until the secrets exist, the deploy job is skipped and only tests run.

**Generating APP_KEY and DEPLOY_TOKEN without a terminal** (Windows PowerShell):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); "base64:" + [Convert]::ToBase64String($b)
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString("x2") })
```

The first line is the `APP_KEY`, the second the `DEPLOY_TOKEN`.

## Roadmap

- **Phase 1 (in progress):** institutes, roles, courses ✔ · sections & lessons · video (Bunny Stream) ·
  quizzes · enrolment & progress · Stripe / JazzCash / Easypaisa · certificates · SaaS billing
- **Phase 2:** school mode — classes, attendance, timetable, exams, report cards, parent portal, fees
- **Phase 3:** corporate mode, live classes, analytics, custom domains
- **Phase 4:** mobile app (React Native, same API)
