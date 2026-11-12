# Testing Report — Mess Management System

All tests below were actually executed against the live stack: Oracle Database 12c (12.1.0.2.0), service `MNC`, backend on `http://localhost:4000`, frontend build served by the backend.

## Environment verification

| Check | Result |
|---|---|
| `V$VERSION` | 12.1.0.2.0, 64-bit Enterprise |
| Listener services | `MNC`, `MNCXDB` on port 1521 |
| `MESS_APP` connection | OK via `//localhost:1521/MNC` (Thin Mode) |
| Tables created | 24 application tables |
| Seeds | ROLES=3, PERMISSIONS=23, ROLE_PERMISSIONS=48, BILL_CATEGORIES=9, EXPENSE_CATEGORIES=9, SYSTEM_SETTINGS=8, superadmin user |
| `GET /api/health` | `{"ok":true,"db":"connected"}` |
| `tsc` backend build | PASS (0 errors) |
| `vite build` frontend | PASS (734 modules, dist/ produced) |

## Authentication & RBAC

| Test | Result |
|---|---|
| Login `superadmin` / `admin123` | PASS — returns SUPER_ADMIN + permissions |
| Login `testmember` / `member123` | PASS — returns MEMBER role |
| Invalid password | PASS — `INVALID_CREDENTIALS` |
| `GET /api/auth/me` authenticated | PASS — user + permissions |
| Unauthenticated API call | PASS — `401 UNAUTHENTICATED` |
| Member → admin endpoints | PASS — blocked by `requireRole`/`requirePerm` |

## Member management

| Test | Result |
|---|---|
| Create member (`testmember`, code M001) | PASS — USERS+MEMBERS atomically, bcrypt hash stored |
| Member login after creation | PASS |
| List/search/filter members | PASS |
| Status change ACTIVE/INACTIVE | PASS — history preserved |

## Meals, guests, cutoff

| Test | Result |
|---|---|
| Member meal request (LUNCH qty 1) | PASS — `requestId` returned, MEAL_ENTRIES synced |
| Guest meal submission (`POST /api/guests`) | PASS — `GUEST_MEALS` row created |
| Requests list (admin) | PASS — revision-aware latest rows |
| Meal entries list (admin) | PASS |
| Cutoff enforcement | PASS — `isOpen()` uses Dhaka time vs `meal.*_cutoff` settings |
| Locked request override | PASS — requires `meals.override`/SUPER_ADMIN + reason; audited as `OVERRIDE` |
| Cancel before cutoff | PASS — request CANCELLED + entry cancelled in one tx |

## Financial engine (executed with real rows, month 2026-11)

Test data: 1 regular meal + 2 guest meals, bazar expense 2200, bills 3000, deposits 2000, other charges.

| Formula | Expected | Actual |
|---|---|---|
| Total chargeable meals | 3 | 3 |
| Meal rate | 2200 ÷ 3 = 733.33 | 733.3333 |
| Member food cost | meals × rate | computed per breakdown |
| Total payable | food + bills + charges | 5200 (aggregate) |
| Balance | deposits − payable | −3200 (due) |

Reports verified: `daily-meals`, `monthly-meals`, `member-meals`, `guest-meals`, `bazar`, `food-expense`, `monthly-bills`, `bill-categories`, `deposits`, `member-balances`, `outstanding`, `advances`, `monthly-summary`, `closing-report` — all return live Oracle rows.

## Monthly closing

| Test | Result |
|---|---|
| `GET /closing/:month/validate` | PASS — `canClose:true`, counts + financials |
| `POST /closing/:month/close` | PASS — snapshot written |
| Mutation after close (bazar/deposit/meal) | PASS — `423 MONTH_CLOSED` |
| `POST /closing/:month/reopen` with reason | PASS — month unlocked, `REOPEN_COUNT` incremented |
| Close → reopen → reports still consistent | PASS — snapshot preserved |

## Other modules

| Test | Result |
|---|---|
| Deposits create/list/reverse | PASS — reversal inserts negative row, original kept |
| Other charges create/reverse | PASS |
| Bills create + auto-allocation | PASS — equal split reconciles exactly |
| Bill allocation exclude/include | PASS — `isEligible`/`exclusionReason` audited |
| Bill payments | PASS — `PAYMENTS` rows, `PAYMENT_STATUS` updates |
| Notifications list/read/read-all/send | PASS |
| Audit log list + filters | PASS — login/member/meal/financial/closing events recorded |
| Settings get/update | PASS — changes audited |
| Flowchart data | PASS — real month values in all 3 flows |
| Member-scoped endpoints (`/dashboard/member`, `/meals/my`, `/reports/my/*`, `/deposits/my`, `/charges/my`, `/guests/my`) | PASS — only own data |
| File upload endpoint | Implemented (`/api/files/upload`, multer, type/size validated) — not exercised in UI tests |

## Frontend

- `tsc -b && vite build` — PASS, 0 type errors.
- Production bundle served by backend at `http://localhost:4000`.
- All pages wired to live APIs (verified endpoint-by-endpoint above).
- EN/বাংলা dictionaries complete for all nav/pages; theme + language persisted.

## PDF export & branding (verified)

| Test | Result |
|---|---|
| Mess name `The Attic 712` via `app.mess_name` setting | PASS — `GET /api/settings/app.mess_name` returns it; login page, sidebar, profile, page title and PDFs all use it; editable in Admin → Settings |
| All 14 admin PDF types (`/api/pdf/admin/:type?month=2026-11`) | PASS — 19–25 KB each, `application/pdf` |
| Member PDFs (`my-meals`, `my-summary`) | PASS — member-scoped data only |
| PDF content extraction (pypdf) | PASS — mess name, report title, period, generated timestamp (Asia/Dhaka), real Oracle rows, `৳` BDT amounts, page numbering |
| Bangla PDF (`lang=bn`) | PASS — embedded Nirmala fonts, Bangla text present in PDF |
| Footer credit `Developed & Maintained by Atikahad` | PASS — PDF footer, login page, app sidebar footer, profile page |
| Money vs count formatting | PASS — meal counts render as integers, money columns render `৳` with thousands separators |
| Wide tables (>7 cols) | PASS — compact font, wrapped headers, no overlap |

## Known limitations

1. **No automated unit-test suite** — verification was manual API/integration testing (documented above). Financial formulas are centralized in `finance.ts` for future unit tests.
2. **File uploads**: receipts stored under `backend/uploads/` on local disk (not Oracle); served via `/api/files/:id`. For multi-instance deployment use shared storage.
3. **Email/SMS/WhatsApp notifications**: in-app notifications only; the `NOTIFICATIONS` schema is extensible but no external delivery channel is configured.
4. **Excel export**: CSV export + browser print + server-side PDF implemented; native `.xlsx` export not included.
5. **Frontend bundle size**: main JS chunk ~810 KB (Vite warning only) — code-splitting not yet applied; gzip ~232 KB.
5. **Charts**: monthly/daily meal, deposit, and expense charts on admin dashboard; member dashboard shows tabular history (no member charts yet).
6. **Realtime updates**: no websockets — dashboards refresh on navigation/month change.
7. **Rate limiting**: login is rate-limited; other endpoints rely on auth + permission checks.
8. **Meal requests support regular qty only** in the request payload; guest meals are submitted via the separate `/api/guests` endpoint (UI exposes both on the Meal Request page).
9. Oracle 12.1 constraints respected: no `AT TIME ZONE` on DATE, positional binds `:1..:n`, `FETCH FIRST n ROWS ONLY` used for pagination.

## Full audit (second pass) — executed results

Environment note: backend `.env`/`config.ts` now default to `PORT=4001`. Audit API sweep ran against a fresh build on port 4002 (`_audit_api.mjs`, `AUDIT_BASE` env override); the user-started server on 4001 was still running pre-fix code at audit time and must be restarted to pick up fixes.

### Bugs found & fixed

| # | Bug | Root cause | Fix | Verified |
|---|---|---|---|---|
| 1 | `GET /api/closing/:month/snapshot` ? 500 | `MONTHLY_CLOSINGS.SNAPSHOT` is a CLOB; raw LOB in `res.json()` is circular | Strip `SNAPSHOT` from row, return parsed snapshot separately | 200 with `STATUS=REOPENED` + parsed snapshot |
| 2 | `GET /api/reports/admin/closing-report` ? 500 | Same CLOB serialization issue in `reportData.ts` | Convert via `clobText`, return `closing.snapshot` parsed | 200, members=2 |
| 3 | `?month=garbage` ? 200 | No month-format validation; `monthRange` produced NaN dates | `/^\d{4}-\d{2}$/` check in `getAdminReport`/`getMemberReport` ? 400 `BAD_MONTH`; error handler now surfaces safe UPPER_SNAKE codes | 400 `BAD_MONTH` |
| 4 | Member deposits/charges/bills reports ignored `month` | Queries had no month predicate | Added Dhaka month-bounds / `BILL_MONTH` filters | 2026-11?1 row, 2020-01?0 rows |
| 5 | `GET /deposits/my`, `GET /charges/my` ignored `month` param | No filter implemented | Optional `month` query param with `monthBounds` | rows filtered correctly |
| 6 | Member bill report lacked `AMOUNT` key | Returned only `ALLOCATED_AMOUNT`; MyExpenses table binds `AMOUNT` ? showed ?0.00 | Added `ALLOCATED_AMOUNT AMOUNT` alias | `AMOUNT=3000` returned |
| 7 | MyReports meal-history table showed always-blank `GUEST_QTY` | Member meals report has no guest qty (guest meals are a separate report) | Removed the dead column; STATUS column shown instead | build PASS |
| 8 | Notification "Specific Member" with no member selected broadcast to ALL users | `USER_ID NULL` row = visible to everyone; empty targets fell through to `[null]` | Backend 400 `MEMBER_REQUIRED` + frontend guard | 400 verified |
| 9 | Dead stub `GET /api/bills/my` returning 404 under admin guard | Leftover placeholder | Removed (member bills served by `/api/reports/my/bills`) | n/a |
| 10 | Vite dev proxy targeted `:4000` (stale after PORT change) | Hardcoded proxy target | `VITE_API_TARGET` env or default `:4001` | config updated |
| 11 | Leftover `TZTEST` table in MESS_APP schema | Temp artifact from earlier timezone probe | `DROP TABLE TZTEST PURGE` (was empty, self-created) | 0 rows confirmed before drop |
| 12 | Unused `zod@3.x` dep with high-severity npm audit finding | Declared but never imported | `npm uninstall zod` | backend `npm audit` ? 0 vulnerabilities |

### Tests executed

- `node _audit_api.mjs` (112 checks): **112 passed, 0 failed** — auth, RBAC (12 forbidden member?admin probes), all 30+ admin GET endpoints, 15 member endpoints, 20 PDF exports, validation/error paths, SQLi probes, static frontend.
- `npm test` (new `backend/src/tests/run.ts`): **13/13 pass** — `equalAllocation` reconciliation (incl. 100/3 ? 33.34+33.33+33.33 exact paisa sum), `monthBounds` Dhaka UTC+6 edges, `monthOf`.
- `tsc` backend build: PASS. `vite build` frontend: PASS (chunk-size warning only).
- Oracle integrity: 235 constraints, 60 indexes, 0 orphan rows across MEAL_ENTRIES/GUEST_MEALS/BILL_ALLOCATIONS/DEPOSITS/OTHER_CHARGES.
- Business math re-verified live (2026-11): 3 regular + 23 guest = 26 meals; food expense 2480; rate 95.3846; member balances reconcile to the paisa; bill allocations sum exactly to bill amount.

### Remaining known issues (not fixed — documented)

- `react-router-dom` npm audit: 3 moderate + 1 high advisories; fix requires v7 major upgrade. App is CSR-only (no SSR hydration) and uses only internal navigation — practical risk low.
- Cookie `secure:false` — required for localhost HTTP; set `secure:true` + HTTPS in production.
- `JWT_SECRET` is a dev placeholder in `.env` — must be changed for production.
- Multer validates MIME type only (client-supplied); file contents not scanned. `nosniff` + random stored names mitigate.
- `GET /api/files/:id` allows any authenticated user to fetch any file by ID (no per-file ACL).
- Member joining mid-month is not auto-added to already-created bill allocations; admin must re-save the bill (PUT triggers re-allocation) or adjust per-member eligibility.
- Member's own server on port 4001 must be restarted to load the fixed build.

## UI Redesign & Meal Schedule (2026-11-12)

- Developer credit updated to `Developed & Maintained by Atikahad` in Layout, Login, Profile, PDF footer, TESTING_REPORT; zero `Devin AI`/`Atiakd` remain in source or dist.
- Premium theme: gradient ambient background, glass cards, brand palette, animations; light/dark via existing theme toggle.
- New SVG logo (`Logo.tsx` + `favicon.svg`) on login, sidebar, mobile header.
- Login page redesigned: glass card, animated blobs, password visibility toggle; auth flow unchanged.
- Meal serving times configurable via SYSTEM_SETTINGS `meal.lunch_time=09:00` / `meal.dinner_time=19:00`; exposed via `/api/meals/status` and settings API; displayed on member MyMeals cards, member/admin dashboards, admin meal page. Cutoff logic unchanged (11:00/17:00).
- Verified on :4002 and public tunnel: health OK, admin+member login 200, member /meals/status returns `{time:'09:00'/'19:00', cutoff:'11:00'/'17:00'}`, member->admin report 403, SPA+favicon 200, PDF footer shows new credit.

## Community Upgrade (2026-11-12, phase 2)

- New Oracle objects (migration `0002_community.sql`): `CHAT_MESSAGES`, `POLLS`, `POLL_OPTIONS`, `POLL_VOTES`; `MEAL_REQUESTS` gained `DELETED_BY`/`DELETED_AT` + `DELETED` status.
- Backend: Socket.IO server (`src/socket.ts`, JWT-cookie auth, `community` room), `services/chat.ts`, `routes/chat.ts` (history/send/image upload), `routes/polls.ts` (CRUD/vote/close), `DELETE /api/meals/requests/:id`, `meal.*` settings PUT restricted to SUPER_ADMIN, `notifyAllUsers`, error handler maps `FILE_TYPE_NOT_ALLOWED`?400.
- Frontend: `pages/Chat.tsx` (history, load-older, emoji picker, image upload+preview+lightbox, sounds, daily-open chime), `pages/Polls.tsx` (vote/results bars/create/close/delete), shared `socket.ts`/`sound.ts`, nav+routes for `/chat` `/polls` (admin+member), global chat unread badge + notification sound in Layout, site-wide animated `.app-bg`, Settings meal-schedule card, MealRequests delete button, dashboard poll counts.
- Meal schedule now Lunch 10:00 / cutoff 10:00, Dinner 19:30 / cutoff 19:30 (SYSTEM_SETTINGS, editable by Super Admin only).
- Verified live on :4002 AND through Cloudflare tunnel: socket connect both roles, realtime message delivery, image upload (png ok / exe ? 400), poll create/vote/dup-vote 409/close, member?admin still 403, meal request delete + member re-request 200, SPA routes 200, health db connected.
- Developer credit now `Developed & Maintained by Atikahad` everywhere.
