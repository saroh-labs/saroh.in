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

import { readFileSync } from "node:fs";
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
    "bookings/bookings.controller.ts": "APPOINTMENTS",
    "sites/sites.controller.ts": "WEBSITE",
    "forms/forms.controller.ts": "WEBSITE",
    "domains/domains.controller.ts": "WEBSITE",
    "content/posts.controller.ts": "WEBSITE",
    "content/post-categories.controller.ts": "WEBSITE",
    "automations/automations.controller.ts": "AUTOMATIONS",
    "categories/categories.controller.ts": "COMMERCE",
    "customers/customers.controller.ts": "COMMERCE",
    "orders/orders.controller.ts": "COMMERCE",
    "products/products.controller.ts": "COMMERCE",
    "products/product-details.controller.ts": "COMMERCE",
    "imports/imports.controller.ts": "COMMERCE",
};

/**
 * Controllers where only SOME handlers are gated, because the rest must keep
 * working after the module is switched off.
 */
const METHOD_LEVEL: Record<string, string> = {
    "payments/payments.controller.ts": "PAYMENTS",
    "communications/communications.controller.ts": "COMMUNICATIONS",
};

/**
 * Must NEVER be gated. Each entry is a decision with a reason, and the reason
 * is the point — a future change that gates one of these would look like
 * finishing the rollout and would in fact break the thing the runbook protects.
 */
const NEVER: Record<string, string> = {
    "capabilities/capabilities.controller.ts":
        "gating this locks a merchant out of turning the module back on",
    "home/home.controller.ts":
        "Home is the recovery surface, and already filters by availability itself",
    "audit/audit.controller.ts": "historical reads must survive a disable",
    "provider-health/provider-health.controller.ts":
        "diagnosing an unhealthy provider must work when the module is off",
    "search/search.controller.ts": "spans modules; it should degrade, not 403",
    "saved-views/saved-views.controller.ts": "spans modules",
    "customer-workspace/customer-workspace.controller.ts":
        "spans CRM, Commerce and Appointments at once",
    "notifications/notifications.controller.ts": "cross-cutting",
    "media/media.controller.ts": "shared by more than one module",
    "organizations/organizations.controller.ts": "tenancy, not a capability",
    "projects/projects.controller.ts": "tenancy",
    "projects/teams.controller.ts": "tenancy",
    "members/members.controller.ts": "tenancy",
    "stores/stores.controller.ts": "tenancy",
    "billing/billing.controller.ts": "billing is not a capability module",
    "admin/admin.controller.ts": "staff control plane, not a tenant surface",
    "health/health.controller.ts": "liveness",
    "self-test/self-test.controller.ts": "diagnostics",
    // Public surfaces. A merchant switching a module off must not take down a
    // checkout, a booking page, a published site, or a provider's webhook.
    "payments/public-payments.controller.ts": "public checkout",
    "bookings/public-bookings.controller.ts": "public booking",
    "sites/public-sites.controller.ts": "published sites",
    "enquiry/enquiry.controller.ts": "public forms",
    "webhooks/webhooks.controller.ts": "provider webhook inbox",
    "billing/billing-webhook.controller.ts": "billing webhook inbox",
    "waitlist/waitlist.controller.ts": "public waitlist",
};

describe("module enforcement rollout (#117)", () => {
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
                `@RequireModule\\("${moduleKey}"\\)\\s*\\nexport class`,
            );
            expect(text).not.toMatch(classLevel);
        },
    );

    // The half that matters most: these are the routes that must keep working
    // when a merchant switches a capability off.
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

    it("exports the metadata key the guard reads", () => {
        expect(REQUIRE_MODULE_KEY).toBe("saroh:requireModule");
    });
});
