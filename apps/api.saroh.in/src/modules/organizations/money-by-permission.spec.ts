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
 * Storefronts too (DEC-106): no storefront role (`StoreMembers.role`:
 * Admin, Manager, Editor) grants money by its name. The money modules never
 * read a storefront role, and the stores service asks money of the
 * permissions only (`moneyAllows`), never of its storefront-role write
 * check. What a storefront role still grants that isn't money (taking and
 * changing its storefront's orders, DEC-048) stays there.
 *
 * Not covered, by design: who is NOTIFIED (owners and admins hear of a new
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

/**
 * A storefront role read as a grant: its names, or the stores service's
 * storefront-role write check (DEC-106).
 */
const STOREFRONT_ROLE =
    /["'](?:MANAGER|EDITOR|VIEWER)["']|\bWRITE_ROLES\b|\bcanWriteLegacy\b|\bstoreMembers\b[^\n]*\brole\b/;

/** Where a storefront's money is asked, outside the money modules. */
const STOREFRONT_MONEY = ["stores/order-read-access.ts"];

const rel = (file: string) => relative(MODULES, file).split(sep).join("/");

/** A method's body in `source`, from its signature to its closing brace. */
function methodBody(source: string, signature: string): string {
    const start = source.indexOf(signature);
    if (start < 0) throw new Error(`${signature} not found`);
    const end = source.indexOf("\n    }\n", start);
    return source.slice(start, end);
}

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

describe("no storefront role grants money (DEC-106)", () => {
    it("no money module reads a storefront role", () => {
        const files = [
            ...MONEY.flatMap((m) => sourceFiles(join(MODULES, m))),
            ...STOREFRONT_MONEY.map((f) => join(MODULES, f)),
        ];
        const offenders = files.flatMap((file) =>
            readFileSync(file, "utf8")
                .split("\n")
                .map((line, i) => ({ line, at: i + 1 }))
                .filter(({ line }) => STOREFRONT_ROLE.test(line))
                .map(({ line, at }) => `${rel(file)}:${at} ${line.trim()}`),
        );
        expect(offenders).toEqual([]);
    });

    it("the stores service asks money of the permissions, never its storefront-role check", () => {
        const source = readFileSync(
            join(MODULES, "stores", "stores.service.ts"),
            "utf8",
        );
        const money = methodBody(source, "private async moneyAllowsFor(");
        expect(money).toContain("this.orgAllows(");
        expect(STOREFRONT_ROLE.test(money)).toBe(false);
        // A money write leaves before the storefront-role fallback.
        const writes = methodBody(source, "async orderWriteOrganization(");
        const moneyAt = writes.indexOf("if (money ||");
        const legacyAt = writes.indexOf("canWriteLegacy");
        expect(moneyAt).toBeGreaterThan(-1);
        expect(moneyAt).toBeLessThan(legacyAt);
    });

    it("the guard catches a storefront role read as a grant", () => {
        expect(
            STOREFRONT_ROLE.test(`if (member.role === "MANAGER") return paid;`),
        ).toBe(true);
        expect(
            STOREFRONT_ROLE.test(`return WRITE_ROLES.has(member.role);`),
        ).toBe(true);
        expect(
            STOREFRONT_ROLE.test(
                `await prisma.storeMembers.findUnique({ select: { role: true } })`,
            ),
        ).toBe(true);
        expect(
            STOREFRONT_ROLE.test(
                `stores.moneyAllows(storeId, userId, "order:read")`,
            ),
        ).toBe(false);
    });
});
