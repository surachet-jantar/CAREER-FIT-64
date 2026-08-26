---
status: accepted
---

# Frontend-only architecture — results encoded in the Share Link URL

LOGI-FIT 64's Web App Specification v1.0 (§23, §26) describes a PostgreSQL/Supabase
backend with user accounts and stored assessments. We decided to build none of it:
the entire app is static files on GitHub Pages, and a completed assessment is
encoded into the Share Link's URL fragment — the result exists only in the link,
not in any database. There is no admin dashboard; anyone with a Share Link views
that one Shared Result.

## Considered Options

- **Supabase backend per spec** — rejected: requires account infrastructure,
  ongoing maintenance, and personal-data storage that a student guidance tool
  distributed as a single public link does not need.
- **localStorage-only results** — rejected as the sharing mechanism: results
  would be trapped on one device/browser.
- **URL-encoded Shared Result (chosen)** — zero infra, works across devices,
  no personal data at rest anywhere.

## Consequences

- No cross-device progress sync; in-progress answers live only in `localStorage`
  (auto-save/resume, latest result wins).
- Anyone with the link can view the result — treat the link as the access control.
- URL length grows with result detail (~300–800 chars); acceptable for chat-app sharing.
- If a backend is ever added, the scoring engine stays client-side and unchanged;
  only persistence and sharing swap out.
