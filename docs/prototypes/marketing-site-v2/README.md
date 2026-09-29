# Marketing Site V2 and Admin Plans v2 — design copies

Verbatim copies (2026-09-29) of the claude.ai/design project `1fef6fb9-c3b1-4c04-bfc2-86d09cb32a65` files the plan
`docs/plans/2026-09-29-001-feat-marketing-site-v2-and-plans-catalogue-plan.md` builds from. They are reference, not code.

- `Saroh Marketing Site V2 - Home|Pricing|Nav|Footer.dc.html`
- `Saroh Marketing Site V2 - Features - Template.dc.html` — holds the content of all 8 feature pages (`feature` prop: home=Dashboard, products, orders, customers, bookings, subscriptions, billing, insights). The per-feature files in the design project are one-line wrappers that set the prop.
- `Saroh Marketing Site V2 - Solutions - Template.dc.html` — holds shops, gyms, clinics (`solution` prop); same wrapper pattern.
- `Saroh Admin Plans v2.dc.html` — the admin Plans & modules catalogue control.
- `saroh-catalog.js.txt` (the design project's `saroh-catalog.js`, renamed so lint skips it) — the prototype catalogue data layer (the contract the admin screen, the pricing page and the merchant dashboard share).

To render one locally, the design project's `support.js` must sit beside it (not copied; fetch it with DesignSync in the main session).
Screenshots referenced as `shots/*.png` live in the design project; the plan re-captures them from the real app instead.
