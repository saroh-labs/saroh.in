/**
 * Money follows permissions, never role names (DEC-098).
 *
 * Seeing amounts and recording or taking payments — orders, a booking's
 * Take payment, an invoice's Mark paid, refunds — is decided only by the
 * permissions on the person's role (ADR-008), asked through `permits`. This
 * guard reads every screen and helper that decides money and fails on a
 * comparison with a built-in role's name that grants something (`role ===
 * "OWNER"`, `"ADMIN"`), so a fallback to role names can't creep back in.
 *
 * Words that NAME a role (a locked card telling a Member who sees
 * payments) aren't a grant, and compare with "MEMBER" or "REVIEWER" only.
 * Storefront roles too (DEC-106): no money screen reads a storefront
 * Manager or Editor. The API's half is `apps/api.saroh.in/src/modules/
 * organizations/money-by-permission.spec.ts`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { permits, permitsFor } from "./permits";

const APP = join(__dirname, "..", "..");

/** Where money is decided in the app. */
const MONEY = [
    "lib/orders",
    "lib/services/booking-money.ts",
    "lib/invoices",
    "lib/class-packs",
    "lib/contacts/panels.ts",
    "lib/home/first-run.ts",
    "components/bookings",
    "components/commerce/order-detail",
    "components/commerce/orders",
    "components/invoices",
    "app/(shell)/billing",
    "app/(shell)/commerce/orders",
    "app/(shell)/bookings/page.tsx",
    "app/(shell)/bookings/all",
    "app/(shell)/bookings/[bookingId]",
    "app/(shell)/calendar",
    "app/(shell)/class-packs",
];

const ROLE_GRANT =
    /\brole\??\s*(?:===|!==|==|!=)\s*["'](?:OWNER|ADMIN)["']|["']OWNER["']\s*,\s*["']ADMIN["']/;

/**
 * A storefront role named as a grant (DEC-106): no storefront Admin,
 * Manager or Editor decides money; their business role's permissions do.
 */
const STOREFRONT_GRANT = /["'](?:MANAGER|EDITOR)["']/;

function sourceFiles(path: string): string[] {
    if (!statSync(path).isDirectory()) return [path];
    return readdirSync(path).flatMap((name) => {
        const child = join(path, name);
        if (statSync(child).isDirectory()) return sourceFiles(child);
        if (!/\.tsx?$/.test(name) || name.endsWith(".d.ts")) return [];
        if (/\.(test|spec)\.tsx?$/.test(name)) return [];
        return [child];
    });
}

describe("money is decided by permissions, never role names (DEC-098)", () => {
    it("no screen or helper that decides money compares a role with Owner or Admin", () => {
        const offenders = MONEY.flatMap((root) =>
            sourceFiles(join(APP, root)),
        ).flatMap((file) =>
            readFileSync(file, "utf8")
                .split("\n")
                .map((line, i) => ({ line, at: i + 1 }))
                .filter(({ line }) => ROLE_GRANT.test(line))
                .map(
                    ({ line, at }) =>
                        `${relative(APP, file).split(sep).join("/")}:${at} ${line.trim()}`,
                ),
        );
        expect(offenders).toEqual([]);
    });

    it("the guard catches the old fallback", () => {
        expect(
            ROLE_GRANT.test(
                `: organization?.role === "OWNER" || organization?.role === "ADMIN";`,
            ),
        ).toBe(true);
        expect(
            ROLE_GRANT.test(`viewer.role === "MEMBER" && !seesPayments`),
        ).toBe(false);
    });
});

describe("no storefront role decides money (DEC-106)", () => {
    it("no screen or helper that decides money names a storefront role", () => {
        const offenders = MONEY.flatMap((root) =>
            sourceFiles(join(APP, root)),
        ).flatMap((file) =>
            readFileSync(file, "utf8")
                .split("\n")
                .map((line, i) => ({ line, at: i + 1 }))
                .filter(({ line }) => STOREFRONT_GRANT.test(line))
                .map(
                    ({ line, at }) =>
                        `${relative(APP, file).split(sep).join("/")}:${at} ${line.trim()}`,
                ),
        );
        expect(offenders).toEqual([]);
        expect(STOREFRONT_GRANT.test(`storeRole === "MANAGER"`)).toBe(true);
    });

    it("a storefront Manager on the Location team role records no payment", () => {
        // What the API resolves for the narrow role someone who joins
        // through a storefront holds, whatever their storefront role.
        const locationTeam = {
            role: "MEMBER",
            roleKey: "storefront-team",
            actions: ["store:read", "order:stage"],
        };
        expect(permits(locationTeam, "order:stage")).toBe(true);
        expect(permits(locationTeam, "order:edit")).toBe(false);
        expect(
            permits(
                {
                    ...locationTeam,
                    actions: [...locationTeam.actions, "order:edit"],
                },
                "order:edit",
            ),
        ).toBe(true);
    });
});

describe("permits", () => {
    it("asks the role's permissions, whatever the role is called", () => {
        const frontDesk = {
            role: "MEMBER",
            roleKey: "front-desk",
            actions: ["booking:write", "invoice:write", "payment:read"],
        };
        expect(permits(frontDesk, "invoice:write")).toBe(true);
        const member = { role: "MEMBER", actions: ["order:stage"] };
        expect(permits(member, "invoice:write")).toBe(false);
    });

    it("permits nothing without resolved permissions, an Owner included", () => {
        expect(permits({ role: "OWNER" } as never, "payment:read")).toBe(false);
        expect(permits(null, "payment:read")).toBe(false);
        expect(permitsFor(undefined)("order:read")).toBe(false);
    });
});
