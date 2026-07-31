# Lighthouse Scores

**Status: NOT MEASURED IN THIS ENVIRONMENT.** The score cells below are deliberately
blank — no performance number here is invented.

Re-verified in Batch 23: Chrome *is* installed on this machine, but the Lighthouse CLI
is not (`npx lighthouse` requires a fresh download), and the only server running here is
the Next.js **dev** server. Auditing a dev build produces misleading performance scores
(unminified bundles, no route pre-render), so measuring it would have been worse than not
measuring it.

**To fill this in for real**, run against a production build:

```bash
cd frontend
npm run build && npm run start        # prod server on :3000
npx -y lighthouse http://localhost:3000/ --preset=desktop --view
# repeat per URL below; use an incognito window (extensions skew results),
# mobile preset + simulated throttling for the mobile column.
```

Authenticated pages need a logged-in session (Lighthouse can reuse a Chrome profile, or
use `--extra-headers` with a bearer token).

Measure each page in an incognito window (extensions skew results), mobile preset,
simulated throttling. Authenticated pages need a logged-in session.

## Public pages

| Page | URL | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Landing | `/` | | | | |
| Product | `/product` | | | | |
| Architecture | `/architecture` | | | | |
| Pricing | `/pricing` | | | | |
| Use cases | `/use-cases` | | | | |
| Features | `/features` | | | | |
| Docs | `/docs` | | | | |
| API reference (Redoc) | `/docs/api` | | | | |
| Contact | `/contact` | | | | |

## Auth pages

| Page | URL | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Login | `/login` | | | | |
| Register | `/register` | | | | |
| Forgot password | `/forgot-password` | | | | |
| Reset password | `/reset-password` | | | | |

## Authenticated app pages (require login)

| Page | URL | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Dashboard | `/dashboard` | | | | |
| Strategy Explorer | `/admin/strategies` | | | | |
| Portfolio | `/admin/portfolio` | | | | |
| Failure Intelligence | `/admin/failures` | | | | |
| Evolution Engine | `/admin/evolution` | | | | |
| Regime Monitor | `/admin/regimes` | | | | |
| Governance | `/admin/governance` | | | | |
| Knowledge Graph | `/admin/graph` | | | | |
| Research Assistant | `/admin/assistant` | | | | |
| LLM Audit Log | `/admin/llm-audit` | | | | |
| Research Notebook | `/admin/research` | | | | |
| Data Ingest | `/admin/data-ingest` | | | | |
| System Monitoring | `/admin/system` | | | | |
| Billing | `/admin/billing` | | | | |
| Settings | `/settings` | | | | |
| New Strategy | `/admin/strategies/new` | | | | |
| Backtest Results | `/admin/strategies/{id}/backtest-results` | | | | |
| Validation | `/admin/strategies/{id}/validation` | | | | |

---

## Batch 20 optimizations applied (before you measure)

Recorded honestly — several spec'd fixes turned out to be **not applicable** to this
codebase, and are noted as such rather than applied for show:

| Fix | Status | Note |
|---|---|---|
| `next/image` for images | **N/A** | The app renders no bitmap images — every visual is an inline SVG or a chart. There is no `<img>` to convert. |
| `loading="lazy"` below-fold images | **N/A** | Same reason — no images. |
| Dynamic import of heavy components | **Applied** | Cytoscape (knowledge graph) and recharts (portfolio) are now `dynamic(..., { ssr:false })` with loading skeletons, keeping those large libraries out of SSR and the initial render path. `@uiw/react-md-editor` (research) was already dynamically imported. |
| Preconnect to `fonts.gstatic.com` | **N/A** | Fonts load via `next/font/google` (Instrument Serif, JetBrains Mono), which **self-hosts** them at build time — there is no external font origin to preconnect to. Adding the tag would be a dead preconnect. |
| `Cache-Control` on `/api/` proxied routes | **N/A** | The frontend calls the backend directly (`NEXT_PUBLIC_API_BASE_URL`); there are no Next-proxied `/api` rewrites to attach headers to. Cache policy lives on the FastAPI responses instead. |
| Chart `role="img"` + `aria-label` | **Applied (portfolio)** | The portfolio combined-equity chart, regime donut, and correlation heatmap all carry `role="img"` and a descriptive `aria-label`. Other pages' charts predate this batch and were not swept — worth a follow-up if the audit flags them. |
| Icon-only button `aria-label` | **Spot-checked** | The marketing nav hamburger, and the WS status indicator already carry labels; the portfolio icon buttons are decorative (`aria-hidden`) beside text. A full-app sweep was not done. |
| Muted-text contrast ≥ 4.5:1 | **Verified — passes** | Computed WCAG ratios: dashboard muted text (`hsl(215 20% 70%)`) on navy `#0A1628` = **8.23:1**; marketing `#64748B` on white = **4.76:1**. Both pass AA; no colour change needed (the spec's worry about `#94A3B8` on `#0A0B0F` does not match the actual tokens). |

If the real audit surfaces a specific failure (e.g. an unlabeled control on a page
not swept here), fix that page directly — don't apply a blanket change the audit
didn't ask for.
