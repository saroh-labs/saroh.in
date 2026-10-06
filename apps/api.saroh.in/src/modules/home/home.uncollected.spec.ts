/**
 * Home's "Not collected" rows (R34): a website order to pay on handover,
 * still unpaid and not handed over three days after it was placed, under
 * Attention, naming the order and the customer, linking to it, the days
 * counting up. The database is stubbed; it answers what the where asks
 * (`home.uncollected.db.spec.ts` runs the real one). Amounts are made up.
 */
import { flattenNeeds } from "./home-needs";
import { UNCOLLECTED_CODE, uncollectedOrders } from "./home-uncollected";

const ZONE = "Asia/Kolkata";
/** An instant in Kolkata, as `YYYY-MM-DDTHH:mm`. */
const at = (local: string) => new Date(`${local}:00.000+05:30`);

interface Row {
    id: string;
    orderId: string;
    total: string;
    currency: string;
    createdAt: Date;
    status: string;
    paymentStatus: string;
    payOnHandover: boolean;
    fulfilment: string;
    customerId: string | null;
    walkInName: string | null;
    customer: { firstName: string; lastName: string; email: string } | null;
    storeId: string;
}

const row = (over: Partial<Row> = {}): Row => ({
    id: "ord_1",
    orderId: "ORD-1042",
    total: "480.00",
    currency: "INR",
    // Monday 5 Oct, 22:00 in Kolkata.
    createdAt: at("2026-10-05T22:00"),
    status: "PROCESSING",
    paymentStatus: "UNPAID",
    payOnHandover: true,
    fulfilment: "PICKUP",
    customerId: "cus_1",
    walkInName: null,
    customer: {
        firstName: "Anika",
        lastName: "Rao",
        email: "anika@example.com",
    },
    storeId: "store_1",
    ...over,
});

interface Where {
    organizationId: string;
    payOnHandover: boolean;
    paymentStatus: { in: string[] };
    status: { in: string[] };
    createdAt: { lt: Date };
    storeId?: { in: string[] };
}

/** A stand-in `order` that applies the where the way Postgres would. */
function dbOf(rows: Row[]) {
    const match = (w: Where) =>
        rows.filter(
            (r) =>
                r.payOnHandover === w.payOnHandover &&
                w.paymentStatus.in.includes(r.paymentStatus) &&
                w.status.in.includes(r.status) &&
                r.createdAt < w.createdAt.lt &&
                (!w.storeId || w.storeId.in.includes(r.storeId)),
        );
    const order = {
        count: jest.fn(({ where }: { where: Where }) =>
            Promise.resolve(match(where).length),
        ),
        findMany: jest.fn(({ where, take }: { where: Where; take: number }) =>
            Promise.resolve(
                match(where)
                    .sort((a, b) => +a.createdAt - +b.createdAt)
                    .slice(0, take),
            ),
        ),
        // Home only reads: nothing here may write to an order.
        update: jest.fn(),
        updateMany: jest.fn(),
    };
    return { order };
}

const read = (
    rows: Row[],
    now: Date,
    over: { money?: boolean; storeIds?: string[] | null } = {},
) => {
    const db = dbOf(rows);
    return {
        db,
        action: uncollectedOrders(db as never, "org_1", {
            now,
            zone: ZONE,
            money: over.money ?? true,
            storeIds: over.storeIds ?? null,
        }),
    };
};

describe("orders nobody came for, on Home (R34)", () => {
    it("isn't on Home before the third day", async () => {
        const { action } = read([row()], at("2026-10-07T23:59"));
        await expect(action).resolves.toBeNull();
    });

    it("is under Attention from the third day, naming the order and customer, with a link", async () => {
        const action = await read([row()], at("2026-10-08T09:00")).action;
        expect(action).toMatchObject({
            code: UNCOLLECTED_CODE,
            severity: "ATTENTION",
            moduleKey: "COMMERCE",
            count: 1,
            href: "/commerce/orders/ord_1",
        });
        expect(action?.evidence?.[0]).toMatchObject({
            title: "#ORD-1042",
            subtitle: "Anika Rao",
            href: "/commerce/orders/ord_1",
            tag: "Not collected: 3 days",
            tone: "bad",
            amountMinor: 48000,
            currency: "INR",
        });

        const { needs } = flattenNeeds(action ? [action] : [], ZONE);
        expect(needs).toHaveLength(1);
        expect(needs[0]).toMatchObject({
            id: `${UNCOLLECTED_CODE}:ord_1`,
            severity: "ATTENTION",
            title: "Anika Rao hasn't collected order #ORD-1042",
            sub: "Placed 5 Oct to pay on collection, not paid yet. Cancel it to put the stock back, or keep waiting.",
            tag: "Not collected: 3 days",
            tone: "bad",
            amountIn: "sub",
            href: "/commerce/orders/ord_1",
        });
    });

    it("stays while staff keep waiting, the days counting up", async () => {
        const action = await read([row()], at("2026-10-11T09:00")).action;
        expect(action?.evidence?.[0]?.tag).toBe("Not collected: 6 days");
    });

    it("says delivered for an order that goes out", async () => {
        const action = await read(
            [row({ fulfilment: "LOCAL_DELIVERY" })],
            at("2026-10-09T09:00"),
        ).action;
        expect(action?.evidence?.[0]).toMatchObject({
            tag: "Not delivered: 4 days",
            headline: "Order #ORD-1042 to Anika Rao hasn't been delivered",
        });
    });

    it("goes once it is paid, collected or delivered, or cancelled", async () => {
        const now = at("2026-10-10T09:00");
        for (const over of [
            { paymentStatus: "PAID" },
            { status: "DELIVERED", paymentStatus: "PAID" },
            { status: "CANCELLED" },
        ]) {
            await expect(read([row(over)], now).action).resolves.toBeNull();
        }
    });

    it("is only an order placed to be paid on handover", async () => {
        const { action } = read(
            [row({ payOnHandover: false })],
            at("2026-10-10T09:00"),
        );
        await expect(action).resolves.toBeNull();
    });

    it("never cancels it, or writes anything", async () => {
        const { db, action } = read([row()], at("2026-10-20T09:00"));
        await action;
        expect(db.order.update).not.toHaveBeenCalled();
        expect(db.order.updateMany).not.toHaveBeenCalled();
    });

    it("shows the amount only to someone who reads orders", async () => {
        const action = await read([row()], at("2026-10-08T09:00"), {
            money: false,
        }).action;
        expect(action?.evidence?.[0]).toMatchObject({
            amountMinor: null,
            currency: null,
        });
    });

    it("a staff member's Home reads only their storefronts'", async () => {
        const { action } = read(
            [row({ storeId: "store_2" })],
            at("2026-10-08T09:00"),
            { storeIds: ["store_1"] },
        );
        await expect(action).resolves.toBeNull();
    });

    it("lists more than one oldest first, and opens the list", async () => {
        const action = await read(
            [
                row({
                    id: "ord_2",
                    orderId: "ORD-1050",
                    createdAt: at("2026-10-04T10:00"),
                }),
                row(),
            ],
            at("2026-10-08T09:00"),
        ).action;
        expect(action).toMatchObject({
            count: 2,
            title: "2 orders haven't been collected",
            href: "/commerce/orders",
        });
        expect(action?.evidence?.map((e) => e.tag)).toEqual([
            "Not collected: 4 days",
            "Not collected: 3 days",
        ]);
    });
});
