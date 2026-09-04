# SAROH — PRODUCT & ENGINEERING GUIDELINES

**Visibility:** PUBLIC
**Repository:** `saroh-labs/saroh.in`
**Purpose:** Long-lived product, UX and engineering guidance for humans and AI coding agents.

---

# 1. PURPOSE OF THIS DOCUMENT

This document defines the product principles, user-experience standards, architecture expectations and prioritization framework for Saroh.

It should guide:

- product design
- UX decisions
- engineering decisions
- architecture
- GitHub issue creation
- roadmap discussions
- AI coding agents
- code reviews
- feature prioritization

This document intentionally does NOT contain:

- revenue targets
- customer-count targets
- sales targets
- commercial deadlines
- private customer information
- acquisition funnels
- conversion assumptions
- private pricing experiments
- internal financial information
- confidential competitive strategy

Those belong in Saroh's private company strategy.

---

# 2. WHAT SAROH IS

Saroh is a modular commerce operating system for small businesses.

Saroh helps a business manage important operational workflows such as:

- sales
- customers
- products
- bookings
- payments
- customer follow-ups
- communications
- websites
- business activity

from one coherent workspace.

Saroh is commerce-led, but it is not limited to traditional ecommerce.

It should work especially well for businesses that combine:

- products
- services
- appointments
- enquiries
- repeat customers
- online selling
- offline operations

Saroh should feel like one product rather than a collection of unrelated tools.

---

# 3. PRIMARY USER

The primary Saroh user is a small business team, commonly around 2–5 people, where individuals often perform multiple roles.

Examples may include:

- owner/operator
- salesperson
- customer-support person
- fulfilment staff
- store staff
- service provider
- administrator

In very small businesses, one person may perform all of these jobs.

Saroh must therefore avoid software complexity designed primarily for large specialized teams.

The product should work for users who are busy running the business rather than learning software.

---

# 4. PRIMARY PRODUCT QUESTION

Saroh should answer this question extremely well:

> **What should I do next?**

When users open Saroh, they should quickly understand:

- what needs attention
- what is overdue
- which customers need a response
- what has been sold
- what is scheduled
- which payments need attention
- what should happen next

This principle should guide the Home experience and many operational workflows.

---

# 5. PRODUCT EXPERIENCE GOALS

Saroh should optimize for:

## Fast understanding

A new user should understand the purpose of the product without learning Saroh's internal architecture.

## Fast activation

Users should be able to reach meaningful value quickly.

Avoid unnecessary setup before useful work can happen.

## Daily usefulness

Saroh should solve recurring operational problems, not just provide occasional reporting.

## Low cognitive load

Small businesses should not need specialist knowledge to operate the software.

## Actionability

Operational screens should help users complete work.

## Trust

Status, data, permissions, payments, identity and customer information must behave predictably and truthfully.

---

# 6. OUTCOMES, NOT MODULES

Saroh internally uses modular capabilities.

Examples may include:

- Website
- CRM
- Appointments
- Commerce
- Payments
- Communications
- Automations
- Insights

The architecture may remain modular.

The merchant experience should not force the user to think in modules.

Prefer customer-facing language based on outcomes.

BAD:

> Enable CRM.

GOOD:

> Manage customers and enquiries.

BAD:

> Enable Commerce.

GOOD:

> Sell products.

BAD:

> Enable Communications.

GOOD:

> Follow up with customers.

BAD:

> Configure capability dependencies.

GOOD:

> Connect the tools needed to complete setup.

Architecture can be sophisticated.

The product experience should remain simple.

---

# 7. ONBOARDING PRINCIPLE

Do not begin onboarding by asking users to configure Saroh's internal architecture.

Instead ask what they want to accomplish.

Example:

# What would you like Saroh to help with?

- Sell products
- Take bookings
- Manage enquiries
- Manage customers
- Follow up with customers
- Build my website

Saroh should translate these answers into capability configuration.

Where useful, ask:

## What kind of business do you run?

- Products
- Services
- Products + services

And potentially:

## Where do customers currently reach you?

- WhatsApp
- Instagram
- Website
- Walk-ins
- Marketplace
- Other

Only ask questions that materially improve setup.

---

# 8. HOME EXPERIENCE

Home should primarily be an operational workspace rather than a generic analytics dashboard.

Recommended conceptual hierarchy:

## Needs attention

Items requiring action.

Examples:

- order overdue
- payment failed
- customer awaiting response
- booking conflict
- unfulfilled sale
- follow-up due

## Coming up

Upcoming operational work.

Examples:

- today's bookings
- orders awaiting pickup
- follow-ups due
- scheduled activities

## Business pulse

A concise view of business performance.

Examples:

- sales
- new customers
- repeat customers
- bookings
- recent activity

Actions should generally rank above passive reporting.

---

# 9. HOME PRIORITY MODEL

Saroh may use concepts such as:

### ATTENTION

Something requires user action.

### OVERDUE

Something should already have happened.

### SETUP

Configuration prevents the user from receiving full value.

### SUGGESTION

Something optional may improve the business.

Priorities should be understandable without requiring documentation.

---

# 10. CUSTOMER EXPERIENCE

Customer information should progressively become one of Saroh's strongest product areas.

A business should not have to mentally reconstruct a person's relationship with the company from several unrelated screens.

Saroh should work toward a coherent customer view containing:

- identity
- contact information
- sales
- bookings
- interactions
- notes
- follow-ups
- relevant payment history
- lifetime relationship

Avoid making claims about unified identity until the underlying data model and reconciliation logic reliably support them.

Product communication must remain technically truthful.

---

# 11. CUSTOMER 360 DIRECTION

A future mature customer view may include:

## Customer summary

- name
- phone
- email
- recent activity
- purchase history
- booking history
- lifetime value
- next follow-up

## Timeline

Example:

August 29 — Follow-up sent
August 27 — Order completed
August 19 — Appointment booked
August 18 — Website enquiry
June 11 — Previous purchase

## Actions

- Message
- Create sale
- Add booking
- Add note
- Create follow-up

The experience should remain operational rather than becoming a heavyweight CRM.

---

# 12. FOLLOW-UPS

Saroh should make customer follow-up easy.

Avoid forcing small businesses into unnecessarily complex CRM concepts where simpler concepts would work.

Prefer language such as:

- Customers
- Enquiries
- Follow-ups
- Notes
- Activity

before introducing concepts such as:

- opportunities
- complex pipelines
- enterprise workflows
- sequences
- custom objects

unless customer needs clearly justify them.

Example Follow-ups experience:

## Today

Priya
Asked about a product yesterday
[Message] [Done]

Akash
Quotation sent three days ago
[Follow up] [Done]

Rhea
Order awaiting confirmation
[Message] [Done]

Common actions should require very little interaction.

---

# 13. SALES EXPERIENCE

Saroh should continue moving toward a coherent operational Sales experience.

A merchant primarily wants to answer:

> What have we sold, what state is it in, and does anything need attention?

The UX should avoid exposing unnecessary backend model fragmentation.

Where appropriate, Saroh can provide a derived operational view over different transaction sources rather than forcing risky domain-table consolidation.

Example conceptual Sales list:

| Customer | Sale           | Status          | Amount |
| -------- | -------------- | --------------- | ------ |
| Priya    | Linen dress ×2 | Preparing       | ₹4,800 |
| Riya     | Consultation   | Confirmed       | ₹1,500 |
| Kabir    | Custom order   | Needs attention | —      |

Technical implementation should preserve domain correctness while presenting a coherent merchant experience.

---

# 14. CUSTOMER IDENTITY

Customer identity is an important long-term platform primitive.

Order customers, booking customers, contacts and related identities should eventually reconcile safely where confidence is sufficient.

Identity work should consider:

- email normalization
- phone normalization
- ambiguous matches
- manual linking
- unlinking
- auditability
- organization boundaries
- historical records
- privacy
- incorrect-match recovery

Never silently merge uncertain identities simply to create cleaner UX.

Correctness is more important than cosmetic unification.

---

# 15. IMPORTING AND MIGRATION

Most established businesses already store information elsewhere.

Saroh should progressively make migration easy.

Useful import flows include:

- CSV
- spreadsheet-compatible formats
- products
- customers

Potential future platform-specific migration tools may include systems such as:

- Shopify
- WooCommerce
- other commerce platforms

Importing should include:

- preview
- validation
- useful error messages
- duplicate handling
- resumability where appropriate
- safe rollback or correction paths

Migration UX should be treated as part of activation.

---

# 16. COMMUNICATIONS AND WHATSAPP

Customer messaging is an important operational workflow.

Where appropriate, Saroh can provide simple actions such as:

> Message on WhatsApp

and useful prefilled messages.

Example:

> Hi Priya, your order is ready for pickup.

Or:

> Hi Priya, just following up about the product you asked about.

Simple deep-link or handoff workflows may create useful value before more complex provider integrations are required.

Do not unnecessarily block a simple useful customer workflow on a large integration project.

Any future official provider integration must comply with the relevant platform requirements and permissions.

---

# 17. MOBILE EXPERIENCE

Phone use is a primary Saroh scenario.

Critical workflows must be intentionally designed for mobile, not merely compressed from desktop.

Important mobile workflows include:

1. See what needs attention
2. Search customer/order
3. Message customer
4. Update order or booking status
5. Create a common record
6. Complete a follow-up

Avoid:

- desktop tables squeezed onto mobile
- hover-dependent interactions
- tiny controls
- deeply nested menus
- excessive horizontal scrolling
- modal stacks
- unnecessary multi-screen workflows

Touch targets should be comfortable.

Important actions should be reachable one-handed where possible.

---

# 18. FOUR PRIMARY USAGE SCENES

Design important Saroh experiences for:

## Desktop / desk work

Dense information scanning and multi-task workflows.

## Phone

One-handed, fast operational actions.

## Shop floor / warehouse / workplace

High brightness, interruption-heavy usage and quick status updates.

## Evening / dark mode

Low-light usage without losing hierarchy or contrast.

Testing only a desktop light-mode happy path is insufficient.

---

# 19. ACCESSIBILITY

Accessibility is a product quality requirement.

Important expectations include:

- adequate color contrast
- keyboard accessibility
- visible focus states
- semantic controls
- large touch targets
- no hover-only functionality
- understandable error states
- appropriate labels
- reduced dependence on color alone

Accessibility should be considered during implementation, not only during later audits.

---

# 20. INFORMATION ARCHITECTURE

The merchant workspace should feel smaller than the underlying platform.

A possible high-level structure is:

## Home

Operational priorities.

## Sales

Things the business sold.

## Customers

Customers, relationships and follow-ups.

## Products

Catalog and inventory-related operations.

## Bookings

When relevant.

## Website

Public website/storefront management.

## Marketing

Only when relevant and sufficiently mature.

## Settings

Business configuration, integrations, capabilities, team and administration.

Do not expose navigation merely because a backend module exists.

Navigation should reflect useful customer workflows.

---

# 21. CAPABILITY-AWARE UX

Saroh's interface should reflect enabled capabilities.

If a capability is not available:

- unnecessary navigation should disappear
- users should not encounter dead screens
- context should be preserved
- disabling a capability must not destroy merchant data

Capability-aware UX must be backed by capability-aware server enforcement.

Hiding a navigation item is not security.

---

# 22. SOCIAL PUBLISHING STATUS

Social Publishing is not currently part of Saroh's active core-product priority.

Current focus is on strengthening foundational merchant operations such as:

- activation
- Sales
- Customers
- Follow-ups
- mobile workflows
- reliability

Existing Social Publishing research or reusable infrastructure may be retained.

Incomplete Social Publishing functionality should not be exposed as production-ready functionality.

Future prioritization should depend on customer evidence and overall product maturity.

Do not delete technically sound work merely because its product priority has changed.

---

# 23. FEATURE PRIORITIZATION FRAMEWORK

Before building a feature, answer:

### What customer problem does this solve?

### How often does this problem occur?

### Does it materially improve:

- activation
- daily usage
- retention
- customer trust
- operational efficiency?

### Is the problem already solved elsewhere in Saroh?

### Is there a simpler implementation?

### Does this increase onboarding complexity?

### Does this fragment the product experience?

### Does it introduce security, privacy or operational risk?

### How will we know whether it works?

If these questions cannot be answered, investigate before implementing.

---

# 24. DEFAULT PRODUCT DECISION

When deciding between:

> adding another capability

and:

> making a core workflow dramatically better

prefer improving the core workflow unless strong evidence says otherwise.

When deciding between:

> architectural elegance

and:

> understandable merchant UX

preserve correct architecture while simplifying the merchant experience.

When deciding between:

> more configurability

and:

> a good default

prefer a strong default with progressive customization.

---

# 25. ENGINEERING ARCHITECTURE

Preserve Saroh's current architectural direction unless strong technical evidence requires change.

## Backend boundary

`api.saroh.in` is the database-facing application service.

Frontend applications should not directly access PostgreSQL.

## Modular capabilities

Capability availability must be enforced across:

- navigation
- UX
- API/backend boundaries

## Data preservation

Disabling a capability must not silently delete merchant information.

## Organization isolation

Tenant boundaries are release-critical.

Authorization and database protections should provide defense in depth.

## Derived experiences

For cross-domain views such as Sales, prefer safe aggregation/read models where appropriate rather than unnecessary destructive domain rewrites.

---

# 26. ARCHITECTURE CHURN

Avoid broad rewrites unless a concrete product, security, reliability or maintainability problem requires them.

Before proposing a rewrite, identify:

- current defect
- affected customers
- expected benefit
- migration cost
- data risks
- compatibility impact
- test strategy

Saroh should avoid architecture work driven mainly by aesthetic preference.

---

# 27. RELEASE QUALITY

Critical product journeys should have browser-level testing.

Representative coverage should eventually include:

- authentication
- organization creation
- onboarding
- capability configuration
- desktop
- mobile
- permissions
- disabled capabilities
- representative order flow
- representative booking flow
- customer creation
- follow-up creation
- dark mode
- loading states
- error states
- cross-subdomain authentication where applicable

Production confidence must include more than unit tests.

---

# 28. DATABASE MIGRATIONS

CI should validate migration history against a fresh database.

A desirable release check is:

> empty database → migration replay → usable application

Schema push alone is not a substitute for migration replay.

Migration safety should be treated as a production requirement.

---

# 29. SECURITY AND TENANCY

All new functionality should consider:

- authentication
- authorization
- organization boundaries
- capability boundaries
- role permissions
- sensitive data
- audit requirements
- abuse cases
- CSRF where relevant
- rate limiting where relevant

Frontend assumptions must not substitute for server-side protection.

---

# 30. ERROR, EMPTY AND LOADING STATES

Every important workflow must intentionally handle:

- loading
- empty
- partial data
- errors
- permission denial
- unavailable capability
- provider disconnected
- provider error
- stale information
- retry

These states are part of the product.

Do not treat them as edge cases to be designed later.

---

# 31. DOCUMENTATION RULE

Product truth should have a clear source.

When code or product behaviour changes:

- update relevant documentation
- remove contradictory claims
- identify stale issues
- avoid restoring obsolete architecture descriptions

Do not allow multiple documents to describe conflicting current states.

---

# 32. GITHUB ISSUE HYGIENE

Before implementing an issue:

1. Inspect current code.
2. Confirm the issue still describes reality.
3. Check whether another issue superseded it.
4. Confirm dependencies.
5. Confirm expected UX.
6. Define acceptance criteria.

Issues may be classified as:

- Execute
- Execute after dependency
- Keep / rewrite
- Defer
- Close as stale
- Merge with another issue

Do not treat age as proof of relevance.

---

# 33. AI AGENT OPERATING INSTRUCTIONS

Any AI agent working on Saroh should:

1. Inspect the existing implementation before proposing changes.
2. Read relevant product documentation.
3. Search for existing implementation before introducing new abstractions.
4. Review relevant GitHub issues.
5. Preserve established architectural boundaries.
6. Protect organization isolation.
7. Protect merchant data.
8. Consider mobile and desktop.
9. Consider permissions and capability states.
10. Consider loading, error and empty states.
11. Add or update meaningful tests.
12. Avoid broad speculative rewrites.
13. Update documentation when product truth changes.
14. Identify contradictions rather than silently choosing one.
15. Avoid claiming features are complete when technical constraints remain.

---

# 34. REQUIRED FORMAT FOR MAJOR PROPOSALS

When proposing a meaningful feature or architectural change, explain:

## Problem

What user or technical problem exists?

## User impact

Who experiences it and how?

## Recommended UX

What should the merchant experience?

## Technical approach

How should it fit the architecture?

## Dependencies

What must exist first?

## Risks

What can go wrong?

## Metrics / validation

How will success be measured?

## Acceptance criteria

What must be true before the work is complete?

## Priority

Why should this be done now?

---

# 35. PRODUCT VISION

Saroh should not feel like several unrelated SaaS tools bundled together.

It should feel like:

> **One coherent operating workspace for a small business.**

A merchant should be able to open Saroh and understand:

- what happened
- what needs attention
- who needs a response
- what was sold
- what is scheduled
- what money needs attention
- what to do next

The internal architecture may remain modular and sophisticated.

The merchant experience should remain calm, clear and understandable.

---

# 36. LONG-LIVED DEFAULT RULE

When uncertain between:

> building more

and:

> making the core product easier, faster, safer and more useful

default to:

> **improving the core product.**

This guideline should only change when there is clear product or customer evidence that the direction should change.
