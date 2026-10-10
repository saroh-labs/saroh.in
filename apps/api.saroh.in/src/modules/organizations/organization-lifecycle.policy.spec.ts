/**
 * The guard against #921's miss: "deleted" changed only a label, because the
 * lifecycle states were added without a decision for each place they touch.
 *
 * Every state the database allows must have a row in the decision table,
 * and every place that obeys the table — billing's charge paths, the public
 * site's reads and the member's door — must still ask it. A new state fails
 * here (and at compile time, `Record<…>`) until it is decided for each; a
 * new public site controller or membership door fails until it asks.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { LifecycleDecision } from "./organization-lifecycle.policy";
import {
    activityOpen,
    billingMayCharge,
    LEGAL_HOLD_DECISIONS,
    legalHoldAllowsMoveTo,
    legalHoldMayBePlaced,
    LIFECYCLE_DECISIONS,
    LIFECYCLE_WRITE_CLASSES,
    lifecycleAllows,
    lifecycleDecision,
    membersMayOpen,
    ORGANIZATION_LIFECYCLE_STATES,
    OrganizationLifecycleStatus,
    publicSiteOnline,
    windingDown,
} from "./organization-lifecycle.policy";

const SRC = join(__dirname, "..", "..");
const MODULES = join(SRC, "modules");
const MIGRATIONS = join(
    __dirname,
    "../../../../../packages/database/prisma/migrations",
);

function read(rel: string): string {
    return readFileSync(join(SRC, rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (name.endsWith(".ts") && !name.endsWith(".spec.ts")) {
            out.push(path);
        }
    }
    return out;
}

/** The states the latest `Organization_lifecycleStatus_check` allows. */
function statesTheDatabaseAllows(): string[] {
    let latest: string | null = null;
    for (const dir of readdirSync(MIGRATIONS).sort()) {
        const file = join(MIGRATIONS, dir, "migration.sql");
        let sql: string;
        try {
            sql = readFileSync(file, "utf8");
        } catch {
            continue;
        }
        const match =
            /"Organization_lifecycleStatus_check"\s+CHECK\s*\(([\s\S]*?)\)\s*\)/.exec(
                sql,
            );
        if (match) latest = match[1];
    }
    if (!latest) throw new Error("No Organization_lifecycleStatus_check found");
    return [...latest.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
}

describe("the lifecycle decision table (#921)", () => {
    it("has a row for every state the database allows, and no other", () => {
        expect([...ORGANIZATION_LIFECYCLE_STATES].sort()).toEqual(
            statesTheDatabaseAllows().sort(),
        );
        expect([...ORGANIZATION_LIFECYCLE_STATES].sort()).toEqual(
            Object.values(OrganizationLifecycleStatus).sort(),
        );
    });

    it.each(ORGANIZATION_LIFECYCLE_STATES)(
        "%s is decided for activity, billing, the public site and members",
        (state) => {
            const row: LifecycleDecision = LIFECYCLE_DECISIONS[state];
            expect(["open", "wind-down", "closed"]).toContain(row.activity);
            expect(["charges", "refused"]).toContain(row.billing);
            expect(["online", "offline"]).toContain(row.publicSite);
            expect(["open", "closed"]).toContain(row.members);
            expect(Object.keys(row).sort()).toEqual(
                ["activity", "billing", "members", "publicSite"].sort(),
            );
        },
    );

    it("says what the owner decided on 9 Oct", () => {
        expect(LIFECYCLE_DECISIONS).toEqual({
            ACTIVE: {
                activity: "open",
                billing: "charges",
                publicSite: "online",
                members: "open",
            },
            SUSPENDED: {
                activity: "closed",
                billing: "charges",
                publicSite: "online",
                members: "open",
            },
            PENDING_DELETION: {
                activity: "wind-down",
                billing: "refused",
                publicSite: "online",
                members: "open",
            },
            DELETED_RETAINED: {
                activity: "closed",
                billing: "refused",
                publicSite: "offline",
                members: "closed",
            },
        });
    });

    it.each(ORGANIZATION_LIFECYCLE_STATES)(
        "the accessors read %s's row",
        (state) => {
            const row = LIFECYCLE_DECISIONS[state];
            expect(activityOpen(state)).toBe(row.activity === "open");
            expect(windingDown(state)).toBe(row.activity === "wind-down");
            expect(billingMayCharge(state)).toBe(row.billing === "charges");
            expect(publicSiteOnline(state)).toBe(row.publicSite === "online");
            expect(membersMayOpen(state)).toBe(row.members === "open");
        },
    );

    // DEC-117 (owner, 9 Oct): a business winding down starts nothing new,
    // finishes what it started, and can always take its data away.
    it.each([
        ["ACTIVE", { new: true, "wind-down": true, takeout: true }],
        ["SUSPENDED", { new: false, "wind-down": false, takeout: true }],
        ["PENDING_DELETION", { new: false, "wind-down": true, takeout: true }],
        [
            "DELETED_RETAINED",
            { new: false, "wind-down": false, takeout: false },
        ],
        ["ARCHIVED", { new: false, "wind-down": false, takeout: false }],
    ] as const)("%s allows writes by class", (state, expected) => {
        for (const cls of LIFECYCLE_WRITE_CLASSES) {
            expect([cls, lifecycleAllows(state, cls)]).toEqual([
                cls,
                expected[cls],
            ]);
        }
    });

    it("treats a state it doesn't know as closed everywhere", () => {
        expect(lifecycleDecision("ARCHIVED")).toEqual(
            LIFECYCLE_DECISIONS.DELETED_RETAINED,
        );
        expect(activityOpen("ARCHIVED")).toBe(false);
        expect(billingMayCharge("ARCHIVED")).toBe(false);
        expect(publicSiteOnline("ARCHIVED")).toBe(false);
        expect(membersMayOpen("ARCHIVED")).toBe(false);
    });
});

/**
 * Each place that obeys the table, and what it must call. A file here that
 * stops asking fails; so does a new public site controller or membership
 * door below that never started.
 */
const CONSUMERS: Record<
    "activity" | "billing" | "publicSite" | "members",
    { file: string; asks: RegExp }[]
> = {
    activity: [
        {
            file: "modules/organizations/organization-lifecycle.gate.ts",
            asks: /\blifecycleAllows\(/,
        },
        // The site's shop, booking page, packs and plans say the business
        // isn't taking orders or bookings when it isn't (DEC-117).
        {
            file: "modules/orders/checkout-paused.ts",
            asks: /\bactivityOpen\(/,
        },
    ],
    billing: [
        // Saroh's own plan: a checkout, a subscription, an add-on, the
        // add-ons sent to the provider, a renewal it charged anyway, and
        // the provider subscription ended when deletion is scheduled.
        {
            file: "modules/billing/checkout.service.ts",
            asks: /\bassertBillingMayStart\(/,
        },
        {
            file: "modules/billing/subscriptions.service.ts",
            asks: /\bassertBillingMayStart\(/,
        },
        {
            file: "modules/billing/addons.service.ts",
            asks: /\bassertBillingMayStart\(/,
        },
        {
            file: "modules/billing/addon-charges.ts",
            asks: /\bbillingMayCharge\(/,
        },
        {
            file: "modules/billing/billing-webhook.service.ts",
            asks: /\bbillingMayChargeFor\(/,
        },
        {
            file: "modules/admin/admin-lifecycle.service.ts",
            asks: /\bstopRenewalsInTx\(/,
        },
        // The business's charges to its own customers: renewals (listed and
        // re-read under the lock) and the autopay debit.
        {
            file: "modules/subscriptions/subscription-renew.handler.ts",
            asks: /\bBILLING_ORGANIZATION\b[\s\S]*\bBILLING_STATES\b/,
        },
        {
            file: "modules/subscriptions/subscriptions.service.ts",
            asks: /\bbillingMayChargeFor\(/,
        },
        {
            file: "modules/subscriptions/subscription-charge.handler.ts",
            asks: /\bbillingMayChargeFor\(/,
        },
    ],
    publicSite: [
        {
            file: "modules/sites/sites.service.ts",
            asks: /\bSITE_ONLINE_ORGANIZATION\b/,
        },
        {
            file: "modules/site-accounts/site-host.ts",
            asks: /\bSITE_ONLINE_ORGANIZATION\b/,
        },
        {
            file: "modules/sites/test-release-lookup.ts",
            asks: /\bpublicSiteOnline\(/,
        },
        {
            file: "modules/sites/site-preview-links.service.ts",
            asks: /\bpublicSiteOnline\(/,
        },
        {
            file: "modules/sites/site-moved.ts",
            asks: /\bpublicSiteOnline\(/,
        },
        {
            file: "modules/bookings/reservation.ts",
            asks: /\bpublicSiteOnlineFor\(/,
        },
        {
            file: "modules/bookings/public-booking-page.ts",
            asks: /\bSITE_ONLINE_ORGANIZATION\b/,
        },
        {
            file: "common/guards/public-site-online.guard.ts",
            asks: /\bpublicSiteOnline\(/,
        },
    ],
    members: [
        {
            file: "modules/organizations/organization-context.service.ts",
            asks: /\bassertMembersMayOpen\(/,
        },
        {
            file: "modules/stores/stores.service.ts",
            asks: /\bassertMembersMayOpen\(/,
        },
    ],
};

describe("a legal hold is decided for every state (DEC-119)", () => {
    it("has a row for every state, and no other", () => {
        expect(Object.keys(LEGAL_HOLD_DECISIONS).sort()).toEqual(
            [...ORGANIZATION_LIFECYCLE_STATES].sort(),
        );
    });

    it("says what the owner decided on 10 Oct", () => {
        expect(LEGAL_HOLD_DECISIONS).toEqual({
            // Suspended with the hold; never held while active.
            ACTIVE: { place: false, enter: false },
            SUSPENDED: { place: true, enter: true },
            // Kept "even if deletion was requested".
            PENDING_DELETION: { place: true, enter: false },
            DELETED_RETAINED: { place: true, enter: false },
        });
    });

    it("never lets a held business reach a state that takes new activity or moves it towards deletion", () => {
        for (const state of ORGANIZATION_LIFECYCLE_STATES) {
            if (!legalHoldAllowsMoveTo(state)) continue;
            // The only state a held business may be moved to takes no
            // workspace write but the data download (itself refused under
            // a hold), so none of its people can delete a record.
            expect(lifecycleAllows(state, "new")).toBe(false);
            expect(lifecycleAllows(state, "wind-down")).toBe(false);
            expect(membersMayOpen(state)).toBe(true);
        }
        expect(legalHoldAllowsMoveTo("PENDING_DELETION")).toBe(false);
        expect(legalHoldAllowsMoveTo("DELETED_RETAINED")).toBe(false);
        expect(legalHoldAllowsMoveTo("ACTIVE")).toBe(false);
    });

    it("treats a state it doesn't know as taking no hold and no held business", () => {
        expect(legalHoldMayBePlaced("ARCHIVED")).toBe(false);
        expect(legalHoldAllowsMoveTo("ARCHIVED")).toBe(false);
    });

    it("is asked by everything that moves or removes a business", () => {
        // The operator's commands ask the table…
        const lifecycle = read("modules/admin/admin-lifecycle.service.ts");
        expect(lifecycle).toContain("legalHoldMayBePlaced(");
        expect(lifecycle).toContain("legalHoldAllowsMoveTo(");
        // …and each job on a business's way out reads the hold itself
        // (`legal-hold.deletes.spec.ts` covers every other deleting job).
        for (const rel of [
            "modules/admin/organization-deletion.handler.ts",
            "modules/admin/organization-deletion-cleanup.handler.ts",
            "modules/admin/organization-retention-erase.handler.ts",
            "modules/data-export/data-export.service.ts",
            "modules/customer-workspace/privacy-removal.service.ts",
        ]) {
            expect(
                `${rel}: ${read(rel).includes('organizations/legal-hold"')}`,
            ).toBe(`${rel}: true`);
        }
    });
});

describe("every consumer asks the table (#921)", () => {
    const rows = Object.entries(CONSUMERS).flatMap(([decision, list]) =>
        list.map((c) => [decision, c.file, c.asks] as const),
    );

    it.each(rows)("%s: %s asks it", (_decision, file, asks) => {
        expect(read(file)).toMatch(asks);
    });

    it("guards every public/sites controller with PublicSiteOnlineGuard", () => {
        const unguarded: string[] = [];
        let seen = 0;
        for (const path of walk(MODULES)) {
            const text = readFileSync(path, "utf8");
            const at = text.indexOf('@Controller("public/sites")');
            if (at === -1) continue;
            seen += 1;
            // The decorators stacked on the class that follows it.
            const head = text.slice(at, text.indexOf("export class", at));
            if (!/@UseGuards\([^)]*\bPublicSiteOnlineGuard\b/.test(head)) {
                unguarded.push(relative(SRC, path));
            }
        }
        expect(seen).toBeGreaterThanOrEqual(8);
        expect(unguarded).toEqual([]);
    });

    it("closes every door a membership opens: each asks for the member pause asks for the deleted state too", () => {
        const doors: string[] = [];
        const open: string[] = [];
        for (const path of walk(MODULES)) {
            const text = readFileSync(path, "utf8");
            if (path.endsWith("member-paused.ts")) continue;
            if (!/\b(assertMemberNotPaused|assertNotPaused)\(/.test(text)) {
                continue;
            }
            doors.push(relative(SRC, path));
            if (!/\bassertMembersMayOpen\(/.test(text)) {
                open.push(relative(SRC, path));
            }
        }
        expect(doors.length).toBeGreaterThanOrEqual(2);
        expect(open).toEqual([]);
    });
});
