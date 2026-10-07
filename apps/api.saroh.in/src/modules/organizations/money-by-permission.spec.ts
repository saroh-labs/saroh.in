/**
 * Money follows permissions, never role names (DEC-098).
 *
 * Seeing amounts and recording or taking payments — orders, a booking's
 * desk payment, an invoice marked paid, refunds — is decided only by the
 * permissions on the person's role (ADR-008), through `allows`. The
 * built-in roles carry their default permissions there; nothing in the
 * money modules compares the business role's name. This guard fails on
 * such a comparison, so one can't creep back in.
 *
 * Not covered, by design: a storefront role (`StoreMembers.role`, DEC-048)
 * is its own bundle, and who is NOTIFIED (owners and admins hear of a new
 * enquiry) is not who may do something. The app's half is
 * `apps/app.saroh.in/lib/organizations/money-by-permission.test.ts`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const MODULES = join(__dirname, "..");

/** The modules where money is seen, taken, recorded or refunded. */
const MONEY = [
    "bookings",
    "orders",
    "invoices",
    "payments",
    "subscriptions",
    "class-packs",
    "courses",
    "customer-workspace",
    "customers",
    "home",
];

const ROLE_NAME =
    /\b(?:role|organizationRole|orgRole)\??\s*(?:===|!==|==|!=)\s*["'](?:OWNER|ADMIN|MEMBER)["']|["']OWNER["']\s*,\s*["']ADMIN["']/;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!name.endsWith(".ts") || name.endsWith(".d.ts")) return [];
        if (/\.spec\.ts$|\.test\.ts$/.test(name)) return [];
        return [path];
    });
}

/**
 * Where a role's name is read for something other than money, each with
 * why. Home's staff landing picks which Home a person lands on; every
 * figure on it still asks the viewer's own permissions (`home-staff.ts`).
 */
const NOT_MONEY = new Set(["home/home-staff.ts"]);

describe("money is decided by permissions, never role names (DEC-098)", () => {
    it("no money module compares the business role's name", () => {
        const offenders = MONEY.flatMap((m) => sourceFiles(join(MODULES, m)))
            .filter(
                (file) =>
                    !NOT_MONEY.has(
                        relative(MODULES, file).split(sep).join("/"),
                    ),
            )
            .flatMap((file) =>
                readFileSync(file, "utf8")
                    .split("\n")
                    .map((line, i) => ({ line, at: i + 1 }))
                    .filter(({ line }) => ROLE_NAME.test(line))
                    .map(
                        ({ line, at }) =>
                            `${relative(MODULES, file).split(sep).join("/")}:${at} ${line.trim()}`,
                    ),
            );
        expect(offenders).toEqual([]);
    });

    it("the guard catches a role-name check", () => {
        expect(ROLE_NAME.test(`if (ctx.role === "OWNER") return money;`)).toBe(
            true,
        );
        expect(
            ROLE_NAME.test(`where: { role: { in: ["OWNER", "ADMIN"] } }`),
        ).toBe(true);
        expect(ROLE_NAME.test(`allows(ctx, "payment:read")`)).toBe(false);
    });
});
