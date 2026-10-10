import { REQUIRE_MODULE_KEY } from "./require-module.decorator";

/**
 * The enforcement rollout, pinned (#117).
 *
 * `ModuleEnforcementGuard` is dark by default, so an annotation is a no-op
 * until `MODULE_ENFORCEMENT` is set. That makes the rollout uniquely easy to
 * get wrong in a way nothing notices: a missing annotation reads exactly like a
 * correct one until the day the flag flips, and a WRONG one — on a route that
 * must survive a module being switched off — is invisible until a merchant
 * cannot refund an order.
 *
 * So this spec asserts the two halves of the runbook's rule as source facts:
 * what carries the decorator, and what must never carry it.
 *
 * A source scan rather than a DI import on purpose. The question is "which
 * routes did we decide to gate", which is a property of the code as written;
 * importing thirty controllers to ask it would drag in every service and
 * Prisma with them, and would fail for reasons that have nothing to do with the
 * rule being tested.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MODULE_KEYS } from "./module-registry";

const MODULES_DIR = join(__dirname, "..");

function source(relative: string): string {
    return readFileSync(join(MODULES_DIR, relative), "utf8");
}

/** Controllers gated wholesale, and the module each one belongs to. */
const CLASS_LEVEL: Record<string, string> = {
    "leads/leads.controller.ts": "CRM",
    "contacts/contacts.controller.ts": "CRM",
    "pipelines/pipelines.controller.ts": "CRM",
    // A12: a class's waitlist, for the team.
    "bookings/waitlist.controller.ts": "APPOINTMENTS",
    // Staff, their hours and the booking rules (U3) — both controllers.
    "staff/staff.controller.ts": "APPOINTMENTS",
    // E3: business closures and the time-off preview.
    "staff/closures.controller.ts": "APPOINTMENTS",
    "sites/sites.controller.ts": "WEBSITE",
    // DEC-071 T2: a site's test releases and their links.
    "sites/test-releases.controller.ts": "WEBSITE",
    // A site's Search and tracking section (DEC-108).
    "sites/site-tracking.controller.ts": "WEBSITE",
    // A site's own icon (DEC-124).
    "sites/site-icon.controller.ts": "WEBSITE",
    // A site's QR codes (Settings › Share).
    "sites/qr-codes.controller.ts": "WEBSITE",
    "forms/forms.controller.ts": "WEBSITE",
    "domains/domains.controller.ts": "WEBSITE",
    "content/posts.controller.ts": "WEBSITE",
    "content/post-categories.controller.ts": "WEBSITE",
    "automations/automations.controller.ts": "AUTOMATIONS",
    "categories/categories.controller.ts": "COMMERCE",
    // #529: the business's catalogue settings, and the old per-storefront
    // addresses kept for one release.
    "catalogue/catalogue.controller.ts": "COMMERCE",
    "catalogue/store-catalogue.controller.ts": "COMMERCE",
    // The storefronts.
    "stores/storefronts.controller.ts": "COMMERCE",
    "discounts/discounts.controller.ts": "COMMERCE",
    "product-reviews/product-reviews.controller.ts": "COMMERCE",
    "products/products.controller.ts": "COMMERCE",
    "products/product-details.controller.ts": "COMMERCE",
    // #531: the business's products and where each is sold.
    "products/organization-products.controller.ts": "COMMERCE",
    "products/listings.controller.ts": "COMMERCE",
    // #516: collections, and one product's collections.
    "collections/collections.controller.ts": "COMMERCE",
    // #514: stock levels, the log, counts, moves and checks.
    "stock/stock.controller.ts": "COMMERCE",
    "imports/imports.controller.ts": "COMMERCE",
};

/**
 * Controllers where only SOME handlers are gated, because the rest must keep
 * working after the module is switched off.
 */
const METHOD_LEVEL: Record<string, string> = {
    "payments/payments.controller.ts": "PAYMENTS",
    // DEC-070: invoicing needs no module; only the pay link is Payments'.
    "invoices/invoices.controller.ts": "PAYMENTS",
    "communications/communications.controller.ts": "COMMUNICATIONS",
    // #117: history reads stay open when the module is off; every write and
    // operational route is gated. `history-reads.gate.spec.ts` pins which.
    "orders/orders.controller.ts": "COMMERCE",
    "orders/organization-orders.controller.ts": "COMMERCE",
    "customers/customers.controller.ts": "COMMERCE",
    "bookings/bookings.controller.ts": "APPOINTMENTS",
    // #117 (owner, 9 Oct): plans, subscriptions, packs and courses keep their
    // history readable too, and cancelling a subscription or an enrolment is
    // wind-down, allowed with the module off.
    "subscriptions/subscriptions.controller.ts": "PAYMENTS",
    "class-packs/class-packs.controller.ts": "CLASS_PACKS",
    "courses/courses.controller.ts": "COURSES",
};

/**
 * A METHOD_LEVEL file may hold a second controller that is wholly a write and
 * gated at the class: named here, so no other one is.
 */
const CLASS_LEVEL_WITHIN: Record<string, string[]> = {
    // Using a pack on a booking, or taking it off (E12).
    "class-packs/class-packs.controller.ts": ["BookingClassPackController"],
};

/**
 * Must NEVER be gated. Each entry is a decision with a reason, and the reason
 * is the point — a future change that gates one of these would look like
 * finishing the rollout and would in fact break the thing the runbook protects.
 */
const NEVER: Record<string, string> = {
    "product-reviews/public-product-reviews.controller.ts":
        "the customer review page — no session, hangs on its token",
    "capabilities/capabilities.controller.ts":
        "gating this locks a merchant out of turning the module back on",
    "home/home.controller.ts":
        "Home is the recovery surface, and already filters by availability itself",
    "audit/audit.controller.ts": "historical reads must survive a disable",
    "provider-health/provider-health.controller.ts":
        "diagnosing an unhealthy provider must work when the module is off",
    "search/search.controller.ts": "spans modules; it should degrade, not 403",
    "saved-views/saved-views.controller.ts": "spans modules",
    "calendar/calendar.controller.ts":
        "spans every dated module, and drops a layer whose module is off itself",
    "customer-workspace/customer-workspace.controller.ts":
        "spans CRM, Commerce and Appointments at once",
    "contacts/contact-search.controller.ts":
        "the customer picker in New booking and New order (B13) works whichever of CRM, Appointments and Commerce is on",
    "notifications/notifications.controller.ts": "cross-cutting",
    // F14: a person's own alert choices; the rows follow their role and
    // the modules on, read by the service.
    "notifications/notification-preferences.controller.ts": "cross-cutting",
    // DEC-123: a person's own "Help improve Saroh" choice, kept on their
    // user row; it belongs to no module.
    "notifications/usage-sharing.controller.ts":
        "the person's own choice, not a capability",
    "media/media.controller.ts": "shared by more than one module",
    "organizations/organizations.controller.ts": "tenancy, not a capability",
    // DEC-069 (L2): the web address is the business's whichever modules
    // are on, and share buttons across modules read its links.
    "organizations/web-address.controller.ts": "tenancy, not a capability",
    "organizations/organization-roles.controller.ts":
        "roles decide who may switch modules; a module switch must never lock the owner out of roles",
    "projects/projects.controller.ts": "tenancy",
    "projects/teams.controller.ts": "tenancy",
    "members/members.controller.ts": "tenancy",
    "stores/stores.controller.ts": "tenancy",
    "billing/billing.controller.ts": "billing is not a capability module",
    "waitlist/launch-offer.controller.ts":
        "taking an opening-day invite's plan offer at onboarding — billing, not a capability module",
    "admin/admin.controller.ts": "staff control plane, not a tenant surface",
    "admin/admin-machinery.controller.ts":
        "staff control plane, not a tenant surface",
    "admin/admin-organizations.controller.ts":
        "staff control plane, not a tenant surface",
    "admin/admin-people.controller.ts":
        "staff control plane, not a tenant surface",
    "admin/admin-staff.controller.ts":
        "staff control plane, not a tenant surface",
    "admin/admin-waitlist.controller.ts":
        "staff control plane, not a tenant surface",
    "admin/admin-deployments.controller.ts":
        "staff control plane, not a tenant surface",
    "admin/admin-usage.controller.ts":
        "staff control plane, not a tenant surface",
    "organizations/organization-members.controller.ts": "tenancy",
    "health/health.controller.ts": "liveness",
    "self-test/self-test.controller.ts": "diagnostics",
    // Public surfaces. A visitor has no organization context, so the guard
    // would answer them 401/403, and a merchant switching a module off must not
    // take down a checkout, a published site, or a provider's webhook. Where a
    // public route must still honour a module, the service decides from the
    // resource: public booking answers 410 when the organization switched
    // Appointments off (`bookings/appointments-open.ts`).
    "payments/public-payments.controller.ts": "public checkout",
    "payments/public-invoices.controller.ts":
        "a customer's invoice link — no session",
    "payments/public-order-pay.controller.ts":
        "a customer's order pay link — no session (B11)",
    "bookings/public-bookings.controller.ts": "public booking",
    // Also the place a site's Visit us block and booking page show (G8): a
    // shop's address and hours stay true whichever modules are on.
    "sites/public-sites.controller.ts":
        "published sites, and the business's place and hours",
    // A QR code's short link, relayed by the site's server. It forwards
    // to a page that answers for its own module, so it carries none.
    "sites/public-qr.controller.ts":
        "a scan of a QR code's short link on a published site — no organization context",
    // A customer signs in on a merchant's site (ADR-011): sign-in is always
    // on, so it must not vanish with a module switch.
    "site-accounts/sign-in.controller.ts":
        "customer sign-in on a published site — no organization context",
    "site-accounts/sessions.controller.ts":
        "a signed-in customer's session on a published site",
    // A9: booking signed in. Appointments being off is checked per service
    // (`appointmentsOpen`), as on the anonymous route.
    "site-accounts/account-bookings.controller.ts":
        "a signed-in customer booking on a published site — Appointments checked per service",
    // A12: joining a full class's waitlist from the booking page, checked
    // per service like booking (`loadBookableService`).
    "site-accounts/account-waitlist.controller.ts":
        "a signed-in customer joining a class's waitlist on a published site — Appointments checked per service",
    // A5: the customer's account area. It lists only the modules the
    // business has rolled out and on (`account-home.service.ts`), and must
    // stay reachable whichever are off: Me, receipts and sign-out.
    "site-accounts/account.controller.ts":
        "a signed-in customer's own account on a published site — modules checked per tab",
    // A6, A7, A8: the account's Bookings, Orders and Plan tabs. Each shows
    // only the customer's own records, which stay theirs to read whichever
    // modules are off; the tab bar hides a tab whose module is off
    // (`account-home.service.ts`). Dark with the account area.
    "site-accounts/account-bookings-tab.controller.ts":
        "a signed-in customer's own bookings — the tab follows Appointments, dark with the account area",
    "site-accounts/account-orders.controller.ts":
        "a signed-in customer's own orders — the tab follows Commerce, dark with the account area",
    "site-accounts/account-plan.controller.ts":
        "a signed-in customer's own plans and packs — the tab follows what's on sale, dark with the account area",
    // A11: buying a class pack from the account. The service answers 404
    // unless Class packs is rolled out and switched on (DEC-057, E12).
    "class-packs/account-packs.controller.ts":
        "a signed-in customer buying a pack — Class packs checked by the service, dark with the account area",
    // G20: the Prices page's Class packs section. Class packs being off is
    // checked by the service (`packsOffered`), which answers 404, as a
    // site with no packs.
    "class-packs/public-packs.controller.ts":
        "a published site's Class packs section — Class packs checked by the service",
    // G20: joining a plan from the site. Payments being off is checked by
    // the service (`paymentsOffered`), which answers 404.
    "subscriptions/account-plan-join.controller.ts":
        "a signed-in customer joining a plan — Payments checked by the service, dark with the account area",
    // D12: autopay on the customer's own plan. Payments being off, or a
    // provider without autopay, is checked by the service (409).
    "subscriptions/account-autopay.controller.ts":
        "a signed-in customer's own autopay — Payments and the provider checked by the service, dark with the account area",
    // A13: the customer's message thread. Every business can be written
    // to; it ships dark with the account area (SITE_ACCOUNT_AREA), not with
    // a module, on both sides.
    "site-accounts/account-messages.controller.ts":
        "a signed-in customer's own thread with the business — dark with the account area, not a module",
    "customer-workspace/threads.controller.ts":
        "the team's side of a customer's thread — message:read / message:write, dark with the account area",
    // G11: a site's shop. Commerce being off is checked by the service
    // (`commerceOpen`), which answers 404, as a site with no shop does.
    "products/public-catalogue.controller.ts":
        "a published site's shop and product pages — Commerce checked by the service",
    // G13: a site's bag and checkout. Never module-gated off mid-payment;
    // the service asks `commerceOpen` before it starts a checkout, and a
    // payment already made still lands through the webhook.
    "orders/public-checkout.controller.ts":
        "a published site's bag and checkout — Commerce checked by the service",
    // P4: a site order's confirmation page. Never module-gated: an order
    // already paid is shown to whoever placed it, Commerce on or off.
    "orders/checkout-confirmation.controller.ts":
        "a placed site order's confirmation — shown to its customer only",
    // G9: a site's Plans block. Payments being off is checked by the
    // service (`paymentsOffered`), which answers 404, as a site with no plans.
    "subscriptions/public-plans.controller.ts":
        "a published site's Plans block — Payments checked by the service",
    "enquiry/enquiry.controller.ts": "public forms",
    "organizations/public-invitations.controller.ts":
        "someone reads an invitation before they have an account, let alone a module",
    "sign-in-options/sign-in-options.controller.ts":
        "the sign-in pages ask which providers to draw before anyone is signed in",
    "webhooks/webhooks.controller.ts": "provider webhook inbox",
    // P1: the buyer's browser reports a payment the moment the provider's
    // window closes. Never module-gated: a payment already taken is settled
    // whatever the business has switched off since.
    "webhooks/checkout-return.controller.ts":
        "a buyer's checkout return — settles a payment already taken",
    "billing/billing-webhook.controller.ts": "billing webhook inbox",
    "waitlist/waitlist.controller.ts": "public waitlist",
    "waitlist/public-offer.controller.ts":
        "the launch offer saroh.in's waitlist page shows, not a tenant surface",
    "pricing/public-pricing.controller.ts":
        "Saroh's own price list for saroh.in, not a tenant surface",
    "pricing/admin-pricing.controller.ts":
        "staff control plane (Plans & modules), not a tenant surface",
    // Resources plan U2: saroh.in's free link preview tool, used before any
    // account or business exists. Behind the signed visitor relay instead.
    "link-preview/link-preview.controller.ts":
        "saroh.in's public link preview tool, not a tenant surface",
    // QR codes plan U9: the free QR code maker's email gate, the same way.
    "tools/qr-maker.controller.ts":
        "saroh.in's public QR code maker's email gate, not a tenant surface",
    // Terms rev 46 (9 Oct): a customer reports a business at
    // saroh.in/customers, with no account and whatever it has switched on.
    "business-reports/public-business-reports.controller.ts":
        "saroh.in's report-a-business form, not a tenant surface",
    "admin/admin-business-reports.controller.ts":
        "staff control plane (customers' reports), not a tenant surface",
    // DEC-120: an owner takes the business's data whatever it has switched
    // off, and while it is closing or suspended.
    "data-export/data-export.controller.ts":
        "the owner's download of the business's own data — no module holds it",
};

/** Controllers with a test of their own below, not a row above. */
const OWN_TEST = ["analytics/analytics.controller.ts"];

/** Every controller file under src/modules, as `<module>/<file>`. */
function controllers(): string[] {
    return readdirSync(MODULES_DIR, { recursive: true, encoding: "utf8" })
        .map((f) => f.split("\\").join("/"))
        .filter((f) => f.endsWith(".controller.ts"))
        .sort();
}

describe("module enforcement rollout (#117)", () => {
    // A controller in none of the lists is one nobody decided about: add it
    // to CLASS_LEVEL, METHOD_LEVEL or NEVER (with the reason).
    it("names every controller under src/modules in one of the lists", () => {
        const named = new Set([
            ...Object.keys(CLASS_LEVEL),
            ...Object.keys(METHOD_LEVEL),
            ...Object.keys(NEVER),
            ...OWN_TEST,
        ]);
        expect(controllers().filter((f) => !named.has(f))).toEqual([]);
        // And every one named still exists.
        const found = new Set(controllers());
        expect(Array.from(named).filter((f) => !found.has(f))).toEqual([]);
    });

    it.each(Object.entries(CLASS_LEVEL))(
        "%s gates the whole controller on %s",
        (file, moduleKey) => {
            expect(source(file)).toContain(`@RequireModule("${moduleKey}")`);
        },
    );

    it.each(Object.entries(METHOD_LEVEL))(
        "%s gates individual handlers on %s",
        (file, moduleKey) => {
            const text = source(file);
            expect(text).toContain(`@RequireModule("${moduleKey}")`);

            // If it ever moves to the class, the exempt handlers below it stop
            // being exempt — which is the mistake this file exists to catch.
            const classLevel = new RegExp(
                `@RequireModule\\("${moduleKey}"\\)\\s*\\n(?:@IgnoreModuleReadiness\\(\\)\\s*\\n)?export class (\\w+)`,
                "g",
            );
            const gatedWhole = Array.from(
                text.matchAll(classLevel),
                (m) => m[1],
            );
            expect(gatedWhole).toEqual(CLASS_LEVEL_WITHIN[file] ?? []);
        },
    );

    // The half that matters most: these are the routes that must keep working
    // when a merchant switches a capability off.
    /*
     * Invoice pay links and subscriptions sit under Payments but need no
     * provider to reach: an invoice paid in cash is recorded by hand
     * (ADR-007), and the pay link's service says what it needs. Without the
     * opt-out, switching enforcement on would refuse every business that
     * never connected one.
     */
    it.each([
        "invoices/invoices.controller.ts",
        "subscriptions/subscriptions.controller.ts",
    ])("%s works while Payments has no provider connected", (file) => {
        const text = source(file);
        const gated = text.match(/@RequireModule\("PAYMENTS"\)/g) ?? [];
        const optedOut = text.match(/@IgnoreModuleReadiness\(\)/g) ?? [];
        // Every controller in the file that is gated also opts out.
        expect(optedOut.length).toBe(gated.length);
    });

    it.each(Object.entries(NEVER))("%s is never gated — %s", (file) => {
        expect(source(file)).not.toContain("@RequireModule(");
    });

    /*
     * analytics.controller.ts holds TWO controllers: the public event intake
     * and the Organization's own read. Only the second is gated — a site that
     * is published must keep reporting views after Insights is switched off, or
     * the merchant loses the history rather than the feature.
     */
    it("gates the Organization analytics read but not the public intake", () => {
        const text = source("analytics/analytics.controller.ts");

        const publicPart = text.slice(
            text.indexOf('@Controller("public/sites")'),
            text.indexOf(
                '@Controller("organizations/:organizationId/analytics")',
            ),
        );
        expect(publicPart).not.toContain("@RequireModule(");

        const orgPart = text.slice(
            text.indexOf(
                '@Controller("organizations/:organizationId/analytics")',
            ),
        );
        expect(orgPart).toContain('@RequireModule("INSIGHTS")');
        // Insights is set up once something is counted; a business with no
        // sales and no visits yet reads its empty takings, not a refusal
        // (DEC-075).
        expect(orgPart).toContain("@IgnoreModuleReadiness()");
    });

    /*
     * DEC-070: a business invoices with Payments off — create, issue, send,
     * void, credit, record paid, download. Only the pay link, a way to take
     * money online, stays under Payments, and it alone carries the gate.
     */
    it("gates only the invoice pay link on Payments (DEC-070)", () => {
        const text = source("invoices/invoices.controller.ts");
        expect(text.match(/@RequireModule\(/g)).toHaveLength(1);
        const payLink = text.slice(
            text.indexOf('@Post(":invoiceId/pay-link")'),
        );
        const handler = payLink.slice(0, payLink.indexOf("async payLink("));
        expect(handler).toContain('@RequireModule("PAYMENTS")');
        expect(handler).toContain("@IgnoreModuleReadiness()");
    });

    it("refunds and payment status stay reachable with Payments off", () => {
        const text = source("payments/payments.controller.ts");
        const refund = text.slice(
            text.indexOf('@Post("orders/:orderId/refund")'),
        );
        // Nothing between the refund route and its handler may gate it.
        expect(refund.slice(0, 200)).not.toContain("@RequireModule(");
    });

    it("withdrawing consent stays reachable with Communications off", () => {
        const text = source("communications/communications.controller.ts");
        const consent = text.slice(text.indexOf('@Post("consents")'));
        expect(consent.slice(0, 200)).not.toContain("@RequireModule(");
    });

    it("only names modules the registry actually declares", () => {
        const declared = new Set<string>(MODULE_KEYS);
        for (const key of [
            ...Object.values(CLASS_LEVEL),
            ...Object.values(METHOD_LEVEL),
        ]) {
            expect(declared.has(key)).toBe(true);
        }
    });

    it("gates Class packs on CLASS_PACKS, not Appointments (E12)", () => {
        const text = source("class-packs/class-packs.controller.ts");
        expect(text).toContain('@RequireModule("CLASS_PACKS")');
        expect(text).not.toContain('@RequireModule("APPOINTMENTS")');
    });

    it("exports the metadata key the guard reads", () => {
        expect(REQUIRE_MODULE_KEY).toBe("saroh:requireModule");
    });
});
