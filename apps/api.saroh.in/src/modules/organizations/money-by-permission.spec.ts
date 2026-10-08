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
 * Nor does store access (#868): the store-scoped reads that send amounts
 * (a storefront's orders with their totals, its customers with what they
 * spent) ask `order:read` through `requireOrderRead`, never `store:read`,
 * which a Member and a role made with only "See locations" hold.
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

/** Store access asked as a grant: `store:read` or `store:write` (#868). */
const STORE_ACCESS = /["']store:(?:read|write)["']/;

/**
 * A store-scoped service method that sends amounts: it serializes an order's
 * totals or a customer's spend. (A write that reads a total to settle a
 * refund asks its own money power, `requireOrderWrite`.)
 */
const SENDS_AMOUNTS =
    /\bserialize(?:OrderSummary|OrderDetail|CustomerListItem)\b/;

/** The services behind the store-scoped routes (`stores/:storeId/…`) that hold amounts. */
const STORE_SCOPED_MONEY = [
    "orders/orders.service.ts",
    "customers/customers.service.ts",
];

/**
 * Each method of a class in `source`, by name, with its body: from one
 * four-space-indented signature to the next.
 */
function methods(source: string): { name: string; body: string }[] {
    const signature = /^ {4}(?:private |public )?(?:async )?(\w+)\(/;
    const out: { name: string; body: string }[] = [];
    for (const line of source.split("\n")) {
        const m = signature.exec(line);
        if (m) out.push({ name: m[1], body: "" });
        const last = out[out.length - 1];
        if (last) last.body += `${line}\n`;
    }
    return out;
}

/**
 * The store-scoped methods in `source` that read or send amounts without
 * asking `requireOrderRead` before their first database read.
 */
function unaskedAmountReads(source: string): string[] {
    return methods(source)
        .filter(
            ({ name, body }) =>
                name !== "requireOrderRead" &&
                /\bstoreId: string\b/.test(body.slice(0, body.indexOf("{"))) &&
                SENDS_AMOUNTS.test(body),
        )
        .filter(({ body }) => {
            const asked = body.search(/\brequireOrderRead\(/);
            const read = body.search(/\bprisma\./);
            return asked < 0 || (read >= 0 && read < asked);
        })
        .map(({ name }) => `${name}()`);
}

describe("store access grants no amounts (#868)", () => {
    it("the store-scoped money read asks a money permission, never store access", () => {
        const offenders = STOREFRONT_MONEY.flatMap((f) =>
            readFileSync(join(MODULES, f), "utf8")
                .split("\n")
                .map((line, i) => ({ line, at: i + 1 }))
                .filter(({ line }) => STORE_ACCESS.test(line))
                .map(({ line, at }) => `${f}:${at} ${line.trim()}`),
        );
        expect(offenders).toEqual([]);
        const read = readFileSync(
            join(MODULES, "stores", "order-read-access.ts"),
            "utf8",
        );
        expect(read).toContain(`moneyAllows(storeId, userId, "order:read")`);
    });

    it("every store-scoped read that sends amounts asks requireOrderRead first", () => {
        const offenders = STORE_SCOPED_MONEY.flatMap((f) =>
            unaskedAmountReads(readFileSync(join(MODULES, f), "utf8")).map(
                (m) => `${f} ${m}`,
            ),
        );
        expect(offenders).toEqual([]);
        // And the scan sees them: each file has its list and read.
        for (const f of STORE_SCOPED_MONEY) {
            const names = methods(readFileSync(join(MODULES, f), "utf8"))
                .filter(({ body }) => SENDS_AMOUNTS.test(body))
                .map(({ name }) => name);
            expect(names).toContain("list");
        }
    });

    it("the guard catches store access read as a grant for amounts", () => {
        expect(
            STORE_ACCESS.test(
                `stores.memberAllows(storeId, userId, "store:read"),`,
            ),
        ).toBe(true);
        expect(
            STORE_ACCESS.test(
                `stores.moneyAllows(storeId, userId, "order:read")`,
            ),
        ).toBe(false);
        // A store-scoped list that sends totals on store access alone, or
        // reads them before asking, is found; one that asks first is not.
        const service = (...body: string[]) =>
            [
                "export class OrdersService {",
                "    async list(",
                "        storeId: string,",
                "        userId: string,",
                "    ) {",
                ...body,
                "        return orders.map(serializeOrderSummary);",
                "    }",
                "}",
            ].join("\n");
        const read = "        const orders = await prisma.order.findMany({});";
        expect(
            unaskedAmountReads(
                service(
                    "        await this.stores.getForUser(storeId, userId);",
                    read,
                ),
            ),
        ).toEqual(["list()"]);
        expect(
            unaskedAmountReads(
                service(
                    read,
                    "        await this.requireOrderRead(storeId, userId);",
                ),
            ),
        ).toEqual(["list()"]);
        expect(
            unaskedAmountReads(
                service(
                    "        await this.requireOrderRead(storeId, userId);",
                    read,
                ),
            ),
        ).toEqual([]);
    });
});
