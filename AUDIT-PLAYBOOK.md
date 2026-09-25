# Saroh — UX Design Audit Playbook

**Trigger:** when the user says **"let's do the UX design audit"** (or "run the audit", "audit this screen"), follow this playbook without asking which skills to use.

## Scope

- Audit the screen the user is currently viewing, or the screens they name.
- Walk it as each role (Owner, Admin, Member, Reviewer), at 1440px, ~924px and phone width, and through every state: loading, couldn't load, empty, already exists, no access, and editing/unsaved.

## Skills — load every one with `read_skill_prompt` before auditing

In Claude Code, load each one with the Skill tool.

**Usability and interaction**

1. `ux-heuristics` — Krug's laws, Nielsen's 10, 0–4 severity, score /10
2. `design-everyday-things` — signifiers, mappings, constraints, feedback, the two gulfs, score /10
3. `steve-jobs-design-review` — the One Thing, cut list, back of the fence, binary verdict
4. `top-design` — craft: type, composition, motion, details
5. `microinteractions` — trigger / rules / feedback / loops for every control
6. `hooked-ux` — does the screen earn a return visit (and pass the ethics gate)
7. `lean-ux` — riskiest assumptions and the cheapest test for each fix
8. `improve-website` — for marketing or public pages (booking page, site)
9. `improve-app` — for in-product screens (settings, bookings, payments…)

**Content and copy**

10. `storybrand-messaging` — customer is the hero; problem, plan, CTA
11. `content-strategy` — what content the screen needs and what it doesn't
12. `copywriting` — labels, buttons, empty states, errors
13. `copy-editing` — seven sweeps on the existing strings

**Why pay and use it**

14. `obviously-awesome` — alternatives, unique value, best-fit customer: does the screen make that value obvious?

## Output

- Write a `Saroh <Screen> Audit.dc.html` in the house style (see `Saroh Settings Audit.dc.html`): scores per framework, what already works, findings ordered worst first (severity, what, why, framework, fix), a cut list, copy rewrites, a value and positioning note, and the path to 10/10.
- In chat: a short summary, then ask "Should I apply the fixes?"
- On "yes": fix in severity order, mark each finding **Fixed** in the audit file, and verify.
