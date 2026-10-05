/**
 * Every public write chooses, on the record, whether a test release may
 * reach it (DEC-071, KTD-8; T4).
 *
 * `TestHostWriteGuard` refuses every non-GET `/public/*` call from a test
 * host unless the route carries `@AllowOnTestRelease()` or sits under a
 * webhook prefix. That default is safe, but a default nobody looks at is
 * how a read-shaped POST breaks a test release, or how a write gets marked
 * allowed without anyone asking. So the lists below are pinned: a new public
 * write route fails this spec until it is added to REFUSED (a write: it
 * stores, sends or charges something) or to ALLOWED (it writes nothing,
 * with the reason).
 */
jest.mock("@saroh/database", () => ({
    prisma: {},
    outsideOrgContext: jest.fn(),
}));

import { join } from "node:path";

import type { PublicWriteRoute } from "./public-write-routes";
import { publicWriteRoutes, writeRoutesIn } from "./public-write-routes";
import { TestHostWriteGuard } from "./test-host.guard";

/** Reachable from a test host: read-shaped, and each says why. */
const ALLOWED: Record<string, string> = {
    "POST public/sites/:siteId/checkout/quote":
        "prices the bag from listings and stores nothing",
};

/** Provider callbacks: no browser origin from a test host ever reaches them. */
const EXEMPT = [
    "POST public/billing/webhooks/:provider",
    "POST public/payments/return",
    "POST public/webhooks/:provider/:organizationId",
];

/** Refused from a test host with 409 TEST_RELEASE. */
const REFUSED = [
    // Signing in and out (KTD-9: sign-in is off on a test host).
    "DELETE public/site-accounts/session",
    "DELETE public/site-accounts/sessions",
    "POST public/site-accounts/codes",
    "POST public/site-accounts/sessions",
    // The customer's account.
    "PATCH public/site-accounts/me",
    "POST public/site-accounts/me/email",
    "POST public/site-accounts/me/email/code",
    "POST public/site-accounts/me/messages",
    "POST public/site-accounts/me/notes",
    // Enquiries.
    "POST public/forms/:formId/submit",
    // Orders and payments.
    "POST public/sites/:siteId/checkout",
    "POST public/orders/:orderId/payment-intent",
    "POST public/order-pay/:token/payment-intent",
    "POST public/invoices/:token/payment-intent",
    "POST public/invoices/:token/autopay",
    // Bookings, holds and waitlists.
    "POST public/site-accounts/bookings",
    "POST public/services/:serviceId/book",
    "POST public/services/holds/:token/release",
    "POST public/site-accounts/me/bookings/:ref/cancel",
    "POST public/site-accounts/me/bookings/:ref/move",
    "POST public/site-accounts/me/treatments/:orderRef/visits",
    "POST public/site-accounts/waitlist",
    "POST public/site-accounts/waitlist/leave",
    "POST public/waitlist",
    "POST public/tools/link-preview/report",
    // Plans, packs and autopay.
    "POST public/site-accounts/me/plans/:ref/join",
    "POST public/site-accounts/me/plan/:ref/cancel",
    "POST public/site-accounts/me/plan/:ref/pause",
    "POST public/site-accounts/me/plan/:ref/pay",
    "POST public/site-accounts/me/plan/:ref/resume",
    "POST public/site-accounts/me/packs/:ref/buy",
    "POST public/site-accounts/me/autopay/plans/:ref",
    // Reviews, and page views (a tester's visits are not the business's).
    "POST public/product-reviews/:token/reviews",
    "POST public/sites/:siteId/analytics/events",
];

const routes = publicWriteRoutes(join(__dirname, "../../modules"));

const isExempt = (route: PublicWriteRoute) =>
    TestHostWriteGuard.isExempt(`/${route.key.split(" ")[1] ?? ""}`);

const sorted = (keys: string[]) => [...keys].sort();

/** Routes on neither list: what a new public write shows up as. */
function unlisted(found: PublicWriteRoute[]): string[] {
    const listed = new Set([...Object.keys(ALLOWED), ...EXEMPT, ...REFUSED]);
    return found.map((r) => r.key).filter((key) => !listed.has(key));
}

describe("public write routes on a test release", () => {
    it("finds the public writes (the scan is not silently empty)", () => {
        expect(routes.length).toBeGreaterThanOrEqual(30);
        expect(routes.map((r) => r.key)).toContain(
            "POST public/forms/:formId/submit",
        );
    });

    it("every public write is on exactly one list", () => {
        expect(unlisted(routes)).toEqual([]);
        const all = [...Object.keys(ALLOWED), ...EXEMPT, ...REFUSED];
        expect(new Set(all).size).toBe(all.length);
        // And no list names a route that no longer exists.
        expect(sorted(all)).toEqual(sorted(routes.map((r) => r.key)));
    });

    it("only the ALLOWED routes carry @AllowOnTestRelease()", () => {
        expect(
            sorted(routes.filter((r) => r.allowed).map((r) => r.key)),
        ).toEqual(sorted(Object.keys(ALLOWED)));
    });

    it("the EXEMPT routes are exactly the guard's webhook prefixes", () => {
        expect(sorted(routes.filter(isExempt).map((r) => r.key))).toEqual(
            sorted(EXEMPT),
        );
    });

    it("the REFUSED routes are neither allowed nor exempt", () => {
        const refused = routes.filter((r) => !r.allowed && !isExempt(r));
        expect(sorted(refused.map((r) => r.key))).toEqual(sorted(REFUSED));
    });
});

describe("the route scan", () => {
    const source = `
@Controller("public/things")
export class ThingsController {
    constructor(private readonly things: ThingsService) {}

    /** @AllowOnTestRelease() in a comment does not count. */
    @Post(":id/claim")
    @HttpCode(200)
    claim(@Param("id") id: string) {
        return this.things.claim(id);
    }

    @Post("price")
    @AllowOnTestRelease()
    price() {
        return this.things.price();
    }

    @Get(":id")
    read() {}

    @Delete()
    async clear() {}
}

@Controller("organizations/:organizationId/things")
export class TeamThingsController {
    @Post()
    create() {}
}
`;

    it("reads each write route, its path and its annotation", () => {
        expect(writeRoutesIn(source, "things.controller.ts")).toEqual([
            {
                key: "POST public/things/:id/claim",
                file: "things.controller.ts",
                allowed: false,
            },
            {
                key: "POST public/things/price",
                file: "things.controller.ts",
                allowed: true,
            },
            {
                key: "DELETE public/things",
                file: "things.controller.ts",
                allowed: false,
            },
            {
                key: "POST organizations/:organizationId/things",
                file: "things.controller.ts",
                allowed: false,
            },
        ]);
    });

    it("a new unannotated public write fails the list check", () => {
        const found = writeRoutesIn(source, "things.controller.ts").filter(
            (r) => r.key.split(" ")[1]?.startsWith("public/"),
        );
        expect(unlisted(found)).toEqual([
            "POST public/things/:id/claim",
            "POST public/things/price",
            "DELETE public/things",
        ]);
    });

    it("a class-level @AllowOnTestRelease() covers every handler", () => {
        const allowedClass = `
@AllowOnTestRelease()
@Controller("public/reads")
export class ReadsController {
    @Post("search")
    search() {}
}
`;
        expect(writeRoutesIn(allowedClass, "reads.controller.ts")).toEqual([
            {
                key: "POST public/reads/search",
                file: "reads.controller.ts",
                allowed: true,
            },
        ]);
    });

    it("refuses a computed controller path rather than miss its routes", () => {
        expect(() =>
            writeRoutesIn(
                "@Controller(BASE)\nexport class X {}",
                "x.controller.ts",
            ),
        ).toThrow(/not a plain string path/);
    });
});
