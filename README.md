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

**First install (no terminal needed)**

1. PHP **8.3+** for the subdomain (cPanel → MultiPHP Manager); document root → its `public` folder.
2. Add the `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` secrets below and push (or re-run the workflow).
   The files are uploaded; the deploy notes that setup is pending.
3. Open `https://lms.ferasolution.com/install`. Enter the `INSTALL_KEY` secret (or the FTP password if it is not set),
   the MySQL details and your owner account. The installer creates the tables, the owner and `.env`
   (with a fresh `APP_KEY`), then shows a **deploy token** once.
4. Save that token as the `DEPLOY_TOKEN` secret. Every later deploy runs migrations and rebuilds
   caches automatically. The installer is closed for good once `.env` exists.

**GitHub → Settings → Secrets and variables → Actions**

| Secret | Value |
|---|---|
| `FTP_SERVER` | `ftp.ferasolution.com` |
| `FTP_USERNAME` | the FTP account, e.g. `deploy@lms.ferasolution.com` |
| `FTP_PASSWORD` | its password |
| `INSTALL_KEY` | optional: a phrase you type on `/install` to prove you own the site (defaults to the FTP password) |
| `DEPLOY_TOKEN` | shown by the installer |
| `FTP_SERVER_DIR` | optional, only if the FTP home is not the subdomain folder (must end with `/`) |

## Roadmap

- **Phase 1 (in progress):** institutes, roles, courses ✔ · sections & lessons · video (Bunny Stream) ·
  quizzes · enrolment & progress · Stripe / JazzCash / Easypaisa · certificates · SaaS billing
- **Phase 2:** school mode — classes, attendance, timetable, exams, report cards, parent portal, fees
- **Phase 3:** corporate mode, live classes, analytics, custom domains
- **Phase 4:** mobile app (React Native, same API)
