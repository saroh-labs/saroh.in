import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import { reservedAccountEmail } from "../contacts/contact-email";
import type { OrgAction } from "../organizations/organization-actions";
import { ListCustomersQueryDto } from "./customers-list.dto";
import { CustomersListService } from "./customers-list.service";

/**
 * The Customers list (C3) with a mocked database: who may open it, what
 * each part of a row needs, and the chips and sorts a viewer may not use.
 * The SQL itself runs in `customers-list.db.spec.ts`.
 */

function ctx(actions: OrgAction[]): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "MEMBER",
        actions: new Set(actions),
    } as OrganizationContext;
}

const EVERYTHING: OrgAction[] = [
    "contact:read",
    "contact:write",
    "order:read",
    "invoice:read",
    "subscription:read",
];

const PERSON = {
    id: "c1",
    firstName: "Asha",
    lastName: "Rao",
    email: "asha@example.com",
    phone: "+91 98450 12345",
    account_email: null,
    orders: 3,
    paid_orders: 1,
    open_orders: 1,
    last_order_at: new Date("2026-09-20T10:00:00Z"),
    paid_invoices: 1,
    subscriber: true,
    offers: true,
};

/** The SQL text a tagged `$queryRaw` call was given, for routing. */
const textOf = (args: unknown[]) => (args[0] as TemplateStringsArray).join(" ");

function make(people: Record<string, unknown>[] = [PERSON]) {
    const $queryRaw = jest.fn((...args: unknown[]) => {
        const sql = textOf(args);
        if (sql.includes("AS everyone")) {
            return Promise.resolve([
                {
                    everyone: 9,
                    all: 4,
                    returning: 2,
                    subscribers: 1,
                    open: 1,
                    offers: 1,
                    attention: 0,
                },
            ]);
        }
        if (sql.includes("AS n FROM u")) return Promise.resolve([{ n: 2 }]);
        if (sql.includes("SUM(s.amount)")) {
            return Promise.resolve([
                { contactId: "c1", currency: "INR", amount: "2050.00" },
            ]);
        }
        if (sql.includes("DISTINCT ON")) {
            return Promise.resolve([
                { contactId: "c1", id: "s1", name: "Hill Road" },
            ]);
        }
        if (sql.includes("SELECT m.id")) return Promise.resolve(people);
        return Promise.resolve([]);
    });
    const db = {
        $queryRaw,
        store: {
            findFirst: jest.fn().mockResolvedValue({ id: "s1" }),
            findMany: jest
                .fn()
                .mockResolvedValue([{ id: "s1", name: "Hill Road" }]),
        },
        contact: { findMany: jest.fn().mockResolvedValue([]) },
        contactAttention: {
            findMany: jest.fn().mockResolvedValue([]),
            groupBy: jest.fn().mockResolvedValue([]),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
        storeAllergen: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CustomersListService(
        db as unknown as ConstructorParameters<typeof CustomersListService>[0],
    );
    return { service, db };
}

describe("CustomersListService.list", () => {
    it("is refused without contact:read", async () => {
        const { service, db } = make();
        await expect(service.list(ctx(["order:read"]), {})).rejects.toThrow(
            ForbiddenException,
        );
        expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it("gives the whole row, counts and storefronts to a viewer who reads everything", async () => {
        const { service } = make();
        const page = await service.list(ctx(EVERYTHING), {});
        expect(page).toMatchObject({
            total: 4,
            everyone: 9,
            page: 1,
            pageSize: 50,
            unlinkedPaying: 2,
            sort: "last",
            chip: "all",
            sees: { orders: true, spent: true, subscriptions: true },
            storefronts: [{ id: "s1", name: "Hill Road" }],
            counts: {
                all: 4,
                returning: 2,
                subscribers: 1,
                open: 1,
                offers: 1,
                attention: 0,
            },
        });
        expect(page.rows[0]).toEqual({
            contactId: "c1",
            name: "Asha Rao",
            email: "asha@example.com",
            phone: "+91 98450 12345",
            signsIn: false,
            possibleDuplicate: false,
            offers: true,
            attention: [],
            hiddenSensitiveCount: 0,
            returning: true,
            orders: {
                count: 3,
                open: 1,
                lastAt: "2026-09-20T10:00:00.000Z",
                lastStorefront: { id: "s1", name: "Hill Road" },
            },
            spent: [{ currency: "INR", amount: "2050.00" }],
            subscriber: true,
        });
    });

    it("sends only the person to a viewer with contact:read alone: no orders, spend, plan or their chips", async () => {
        const { service, db } = make();
        const page = await service.list(ctx(["contact:read"]), {});
        const row = page.rows[0];
        expect(row).not.toHaveProperty("orders");
        expect(row).not.toHaveProperty("spent");
        expect(row).not.toHaveProperty("subscriber");
        expect(row).not.toHaveProperty("returning");
        expect(page).not.toHaveProperty("storefronts");
        expect(page.sort).toBe("name");
        expect(Object.keys(page.counts).sort()).toEqual([
            "all",
            "attention",
            "offers",
        ]);
        expect(db.store.findMany).not.toHaveBeenCalled();
    });

    it("leaves Spent out, not zero, for a viewer with order:read but not invoice:read", async () => {
        const { service } = make();
        const page = await service.list(
            ctx(["contact:read", "order:read"]),
            {},
        );
        expect(page.sees.spent).toBe(false);
        expect(page.rows[0]).not.toHaveProperty("spent");
        expect(page.rows[0].orders?.count).toBe(3);
        // Returning counts orders only when invoices can't be read.
        expect(page.rows[0].returning).toBe(false);
    });

    it.each([
        [{ chip: "open" as const }, ["contact:read"]],
        [{ chip: "returning" as const }, ["contact:read"]],
        [{ chip: "subscribers" as const }, ["contact:read", "order:read"]],
        [{ sort: "last" as const }, ["contact:read"]],
        [{ sort: "spent" as const }, ["contact:read", "order:read"]],
        [{ store: "s1" }, ["contact:read"]],
    ])(
        "refuses %o to a viewer who can't read what it's about",
        async (query, actions) => {
            const { service } = make();
            await expect(
                service.list(ctx(actions as OrgAction[]), query),
            ).rejects.toThrow(ForbiddenException);
        },
    );

    it("answers a storefront of another business with a 404", async () => {
        const { service, db } = make();
        db.store.findFirst.mockResolvedValue(null);
        await expect(
            service.list(ctx(EVERYTHING), { store: "theirs" }),
        ).rejects.toThrow(NotFoundException);
        expect(db.store.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "theirs", organizationId: "org_1" },
            }),
        );
    });

    it("shows a separate contact's account email and says they sign in, never the placeholder", async () => {
        const { service } = make([
            {
                ...PERSON,
                id: "c2",
                firstName: null,
                lastName: null,
                email: reservedAccountEmail("c2"),
                account_email: "kiran@example.com",
            },
        ]);
        const page = await service.list(ctx(["contact:read"]), {});
        expect(page.rows[0]).toMatchObject({
            contactId: "c2",
            name: null,
            email: "kiran@example.com",
            signsIn: true,
        });
    });

    it("pages from the offset of the page asked for", async () => {
        const { service, db } = make();
        await service.list(ctx(EVERYTHING), { page: 3 });
        const call = db.$queryRaw.mock.calls.find((args) =>
            textOf(args).includes("SELECT m.id"),
        ) as unknown[];
        expect(call.slice(1)).toEqual(expect.arrayContaining([50, 100]));
    });
});

describe("CustomersListService.unlinked", () => {
    it("is refused without contact:read", async () => {
        const { service } = make();
        await expect(service.unlinked(ctx([]), {})).rejects.toThrow(
            ForbiddenException,
        );
    });

    it("refuses the storefront filter without order:read, as the list does (review C-5)", async () => {
        const { service, db } = make();
        await expect(
            service.unlinked(ctx(["contact:read"]), { store: "s1" }),
        ).rejects.toThrow(ForbiddenException);
        expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it("names the contact holding their email, and leaves order figures out without order:read", async () => {
        const { service, db } = make();
        db.$queryRaw.mockImplementation((...args: unknown[]) => {
            const sql = textOf(args);
            if (sql.includes("AS n FROM u")) {
                return Promise.resolve([{ n: 1 }]);
            }
            return Promise.resolve([
                {
                    id: "cust1",
                    firstName: "Kiran",
                    lastName: null,
                    email: "Kiran@Example.com",
                    phone: null,
                    storeId: "s1",
                    paid_orders: 2,
                    last_at: new Date("2026-09-15T10:00:00Z"),
                },
            ]);
        });
        db.contact.findMany.mockResolvedValue([
            {
                id: "c9",
                firstName: "Kiran",
                lastName: "M",
                email: "kiran@example.com",
                customerAccounts: [],
            },
        ]);
        const sheet = await service.unlinked(ctx(["contact:read"]), {});
        expect(sheet).toMatchObject({ total: 1, page: 1, pageSize: 50 });
        expect(sheet.rows[0]).toEqual({
            customerId: "cust1",
            name: "Kiran",
            email: "Kiran@Example.com",
            phone: null,
            storefront: { id: "s1", name: "Hill Road" },
            holder: {
                contactId: "c9",
                name: "Kiran M",
                email: "kiran@example.com",
            },
        });

        const withOrders = await service.unlinked(
            ctx(["contact:read", "order:read"]),
            {},
        );
        expect(withOrders.rows[0]).toMatchObject({
            paidOrders: 2,
            lastPaidOrderAt: "2026-09-15T10:00:00.000Z",
        });
    });
});

describe("ListCustomersQueryDto", () => {
    const check = async (raw: Record<string, unknown>) =>
        validate(plainToInstance(ListCustomersQueryDto, raw), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it("takes the page as text and converts it", async () => {
        const dto = plainToInstance(ListCustomersQueryDto, { page: "2" });
        expect(dto.page).toBe(2);
        expect(await check({ page: "2" })).toHaveLength(0);
    });

    it.each([
        { page: "0" },
        { page: "1.5" },
        { page: "x" },
        { chip: "vip" },
        { sort: "oldest" },
        { q: "x".repeat(101) },
        { extra: "1" },
    ])("refuses %o", async (raw) => {
        expect((await check(raw)).length).toBeGreaterThan(0);
    });

    it("treats a blank store, chip or sort as none", async () => {
        const dto = plainToInstance(ListCustomersQueryDto, {
            store: " ",
            chip: "",
            sort: "",
        });
        expect(dto).toMatchObject({
            store: undefined,
            chip: undefined,
            sort: undefined,
        });
        expect(await check({ store: " ", chip: "", sort: "" })).toHaveLength(0);
    });
});
