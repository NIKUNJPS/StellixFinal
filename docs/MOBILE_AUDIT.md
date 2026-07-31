# Mobile Responsive Audit (Batch 21)

Target viewport: **375 px (iPhone SE)**. Method: read the real Tailwind classes on
each page + component, plus DOM-width checks in the in-app browser. Screenshots at
375 px are unreliable in this harness (rAF/screenshot limits), so **please
spot-confirm visually in Chrome DevTools mobile emulation** — this table reflects the
CSS, not pixels.

Principle applied: **fix what's actually broken at 375 px; don't rewrite working
layouts.** Most grids and tables were already responsive.

## Global fixes applied

| Area | Issue at 375px | Fix |
|---|---|---|
| Client sidebar (`components/layout/sidebar.tsx`) | `hidden md:flex` — no nav at all below 768 px, no hamburger | Added a **Sheet slide-over drawer** + hamburger in the top bar (`components/layout/mobile-nav.tsx`, wired into `top-nav.tsx`). Backdrop + closes on nav. Drawer is `md:hidden` so it never doubles the desktop sidebar. |
| Superadmin sidebar (`app/superadmin/layout.tsx`) | same `hidden md:flex`, console unreachable below md | Added a crimson Sheet drawer + hamburger in the superadmin header. |
| Top bar (`components/layout/top-nav.tsx`) | breadcrumb + Cmd-K search could overflow the 375 px bar | Breadcrumb + divider now `hidden md:block`; global search `hidden sm:block`; gap tightened on mobile. |
| Data tables | needed horizontal scroll | Already handled — the shadcn `Table` wraps every table in `overflow-x-auto` (`components/ui/table.tsx`); raw `<table>` pages already wrap in `overflow-x-auto`. |

## Per-page audit

| Page | Finding at 375px | Status |
|---|---|---|
| Dashboard (`app/dashboard`) | KPI grid `grid-cols-1 sm:grid-cols-2 lg:…`; chart grid `grid-cols-1 lg:grid-cols-2`; charts `ResponsiveContainer width=100%` (height fixed 260 px, acceptable). | Already responsive — no change |
| Strategies (`app/admin/strategies`) | Table wrapped in `overflow-x-auto`. Empty state reworded (Batch 21). **No `DashboardShell`** — see flag below. | Table fine; empty-state copy updated |
| Backtest results (`app/admin/strategies/[id]/backtest-results`) | Charts width-responsive; metric blocks stack. | Already responsive — no change |
| Knowledge graph (`app/admin/graph`) | Cytoscape viewer is width-fluid; empty-state copy updated. A dedicated mobile "fullscreen" affordance was **not** added (the viewer already fills its container; **no `DashboardShell`** — see flag). | Viewer fine; empty-state copy updated; fullscreen affordance deferred |
| Regime monitor (`app/admin/regimes`) | Uses `DashboardShell`; grids `grid-cols-1 …`; timeline/gauge width-fluid. | Already responsive — no change |
| Portfolio (`app/admin/portfolio`) | Uses `DashboardShell`; KPI grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`; correlation heatmap in `overflow-x-auto`. | Already responsive — no change |
| Settings (`app/settings`) | Uses `DashboardShell`; `Tabs` scroll horizontally; new **Usage** tab uses `grid-cols-1` bars — stacks cleanly. | Already responsive — no change |
| Governance (`app/admin/governance`) | Tables wrapped; forms single-column. **No `DashboardShell`** — see flag. | Content fine |
| SuperAdmin console (`app/superadmin/*`) | Sidebar now a drawer (fix above); Command Center metric grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`; all tables via shadcn `Table` (auto scroll); dialogs are Radix (centered, width-capped). | Fixed (drawer) + already responsive |
| Data ingest (`app/admin/data-ingest`) | New CSV flow uses `grid-cols-1 sm:grid-cols-2/3`, tables in `overflow-x-auto`, dropzone full-width. **No `DashboardShell`** — see flag. | Responsive by construction (Batch 21) |
| Onboarding wizard (`components/onboarding`) | **Full-screen on mobile** (`h-full w-full` → `sm:max-w-2xl sm:rounded-xl`); steps single-column; overflow-y-auto. | Responsive by construction (Batch 21) |

## ⚠️ Flag — pre-existing, not a Batch 21 regression

Nine admin pages **do not wrap in `DashboardShell`** and therefore render with **no
sidebar or top bar on any screen size** (desktop included), so the new mobile drawer
does not reach them:

`app/admin/{assistant, data-ingest, evolution, failures, governance, graph, llm-audit,
research, strategies}/page.tsx`

Only `dashboard`, `portfolio`, `regimes`, `system`, `billing`, and `settings` use the
shell. This is an existing inconsistency (several of these pages were built as
standalone harnesses — the data-ingest page even labels itself "internal test
harness"). Their content is individually responsive (tables scroll, grids stack), so
there is no horizontal overflow — but there is **no in-page navigation** on them.

**Recommendation (needs your call, out of scope for a mobile-only pass):** wrap these
nine pages in `DashboardShell` for consistent nav on every device. That changes their
**desktop** layout too (adds the sidebar) and each page's root `<main class="container
…">` must become a `<div>` to avoid nested `<main>`/double padding — a deliberate
refactor I did not make unilaterally under "don't rewrite working layouts."

## Not changed on purpose

- **Chart heights** are fixed (≈260 px) but width-responsive; readable at 375 px, so
  left as-is rather than adding `h-48 sm:h-64 lg:h-80` churn to working charts.
- **Modals/dialogs** use the Radix `Dialog`/`Sheet` primitives, which are already
  width-capped and centered; the onboarding wizard is the one full-screen-on-mobile
  overlay and was built that way.
