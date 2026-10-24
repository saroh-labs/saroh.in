/**
 * Every public and site-customer write asks the demo gate (DEC-188, #1191).
 *
 * A demo business's site opens for anyone to look at, and nothing a visitor
 * does on it is kept, charged or sent. The routes are read from the
 * controllers' source (`public-write-routes.ts`, as `test-host-routes.spec.ts`
 * does), so a new public write fails this spec until it says, below, where
 * it asks the gate or why it needn't:
 *
 * - `SESSION`: its controller signs the customer in with
 *   `CustomerSessionGuard`, which asks `assertNotDemo` on every write.
 * - a file: the service that asks `assertNotDemo`, `assertOrganizationOpen`,
 *   `assertOrganizationWindingDown` or `demoRefusal` on the way.
 * - `{ exempt }`: not a business's customer write, with the reason.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { publicWriteRoutes } from "../../common/guards/public-write-routes";

const SESSION = "SESSION";
type How = typeof SESSION | string | { exempt: string };

const GATE_RE =
    /\b(assertNotDemo|assertOrganizationOpen|assertOrganizationWindingDown|demoRefusal)\(/;

const ASKS: Record<string, How> = {
    // Signing in: a demo's customers never get a code or a session.
    "POST public/site-accounts/codes": "site-accounts/sign-in-codes.service.ts",
    "POST public/site-accounts/sessions":
        "site-accounts/sign-in-codes.service.ts",
    "DELETE public/site-accounts/session": SESSION,
    "DELETE public/site-accounts/sessions": SESSION,
    // The customer's account.
    "PATCH public/site-accounts/me": SESSION,
    "PATCH public/site-accounts/me/notifications": SESSION,
    "POST public/site-accounts/me/email": SESSION,
    "POST public/site-accounts/me/email/code": SESSION,
    "POST public/site-accounts/me/messages": SESSION,
    "POST public/site-accounts/me/notes": SESSION,
    "POST public/site-accounts/me/data-request": SESSION,
    "POST public/site-accounts/me/invoices/:ref/pay": SESSION,
    // Bookings and waitlists.
    "POST public/services/:serviceId/book":
        "bookings/public-bookings.service.ts",
    "POST public/site-accounts/bookings": SESSION,
    "POST public/site-accounts/me/bookings/:ref/cancel": SESSION,
    "POST public/site-accounts/me/bookings/:ref/move": SESSION,
    "POST public/site-accounts/me/treatments/:orderRef/visits": SESSION,
    "POST public/site-accounts/waitlist": SESSION,
    "POST public/site-accounts/waitlist/leave": SESSION,
    "POST public/services/holds/:token/release": {
        exempt: "frees a held time; a demo takes no booking, so holds none",
    },
    // Orders and payments.
    "POST public/sites/:siteId/checkout": "orders/public-checkout.service.ts",
    "POST public/sites/:siteId/checkout/quote":
        "orders/public-checkout.service.ts",
    "POST public/orders/:orderId/payment-intent":
        "payments/payments.service.ts",
    "POST public/order-pay/:token/payment-intent":
        "payments/public-order-pay.service.ts",
    "POST public/invoices/:token/payment-intent":
        "payments/public-invoices.service.ts",
    "POST public/invoices/:token/autopay":
        "payments/public-invoices.service.ts",
    // Plans, packs and autopay.
    "POST public/site-accounts/me/plans/:ref/join": SESSION,
    "POST public/site-accounts/me/plan/:ref/cancel": SESSION,
    "POST public/site-accounts/me/plan/:ref/pause": SESSION,
    "POST public/site-accounts/me/plan/:ref/pay": SESSION,
    "POST public/site-accounts/me/plan/:ref/resume": SESSION,
    "POST public/site-accounts/me/packs/:ref/buy": SESSION,
    "POST public/site-accounts/me/autopay/plans/:ref": SESSION,
    // Enquiries, reviews and back in stock.
    "POST public/forms/:formId/submit": "enquiry/enquiry.service.ts",
    "POST public/product-reviews/:token/reviews":
        "product-reviews/public-product-reviews.service.ts",
    "POST public/sites/:siteId/products/:productId/watch":
        "stock/stock-watch.service.ts",
    "POST public/sites/:siteId/stock-watch/:token/stop": {
        exempt: "stops a watch; a demo stores none to stop",
    },
    // Counts, not a customer's write.
    "POST public/sites/:siteId/analytics/events": {
        exempt: "a page view; looking is what a demo is for",
    },
    "POST public/sites/:siteId/qr/:code/scan": {
        exempt: "a scan count; looking is what a demo is for",
    },
    // Saroh's own, not a business's.
    "POST public/business-reports": { exempt: "saroh.in's report form" },
    "POST public/contact-messages": { exempt: "saroh.in's contact form" },
    "POST public/staff-invites/preview": { exempt: "Saroh staff invites" },
    "POST public/tools/link-preview": { exempt: "saroh.in's free tool" },
    "POST public/tools/link-preview/report": { exempt: "saroh.in's free tool" },
    "POST public/tools/qr-code-maker/unlock": {
        exempt: "saroh.in's free tool",
    },
    "POST public/waitlist": { exempt: "Saroh's own launch waitlist" },
    // Provider callbacks: a demo connects no provider.
    "POST public/billing/webhooks/:provider": { exempt: "Saroh's billing" },
    "POST public/payments/return": { exempt: "a provider's redirect" },
    "POST public/webhooks/:provider/:organizationId": {
        exempt: "a provider's callback",
    },
};

const modules = join(__dirname, "..");
const routes = publicWriteRoutes(modules);
const source = (file: string) => readFileSync(join(modules, file), "utf8");

describe("every public write asks the demo gate (DEC-188)", () => {
    it("finds the public writes (the scan is not silently empty)", () => {
        expect(routes.length).toBeGreaterThanOrEqual(40);
    });

    it("every public write says where it asks, and no entry is stale", () => {
        const found = routes.map((r) => r.key).sort();
        expect(found.filter((key) => !(key in ASKS))).toEqual([]);
        expect(Object.keys(ASKS).sort()).toEqual(found);
    });

    it.each(routes.map((r) => [r.key, r.file] as const))(
        "%s asks the gate",
        (key, file) => {
            const how = ASKS[key];
            if (how === undefined || typeof how === "object") return;
            if (how === SESSION) {
                expect(source(file)).toContain("CustomerSessionGuard");
                expect(
                    source("site-accounts/customer-session.guard.ts"),
                ).toMatch(/assertNotDemo\(/);
            } else {
                expect(source(how)).toMatch(GATE_RE);
            }
        },
    );
});
