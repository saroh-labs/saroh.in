/**
 * One Late tag everywhere (plan B, B17): two storefronts with different late
 * thresholds, and Home's Needs you, the Orders list's rows, its Late filter
 * and count, and Order Detail all agree about every order — and all follow
 * a threshold changed in Storefronts on the next read.
 *
 * The app draws what the API sends (`late`, `lateBy`, Home's tone), so the
 * API agreeing is the screens agreeing. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { businessDay } from "../home/home-today";
import { HomeService } from "../home/home.service";
import { StorefrontsService } from "../stores/storefronts.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { listOrderRows } from "./order-list";

const tag = `${process.pid}-${Date.now()}`;
const MIN = 60_000;

const kitchen = new OrderKitchenService();
const storefronts = new StorefrontsService();
const availability = {
    listViews: jest.fn().mockResolvedValue([
        {
            key: "COMMERCE",
            label: "Sell",
            readiness: "ACTIVE",
            blockers: [],
        },
    ]),
} as unknown as ModuleAvailabilityService;
const home = new HomeService(availability, prisma);

let owner: OrganizationContext;
/** A counter: pick-ups late after 20 minutes, shipping after 72 hours. */
let counter: string;
/** Everything on the defaults: 2 hours, 24 hours, 48 hours. */
let bakery: string;
let customerId: string;
let seq = 0;

/** Each order by what it is; filled in `beforeAll`. */
const ids: Record<string, string> = {};

async function order(
    storeId: string,
    fulfilment: "PICKUP" | "SHIPPING",
    minutesAgo: number,
): Promise<string> {
    seq += 1;
    const o = await prisma.order.create({
        data: {
            storeId,
            organizationId: owner.organizationId,
            orderId: `LATE-${seq}`,
            customerId,
            subtotal: "250.00",
            total: "250.00",
            currency: "INR",
            status: "PENDING",
            paymentStatus: "PAID",
            stage: "NEW",
            fulfilment,
            createdAt: new Date(Date.now() - minutesAgo * MIN),
        },
    });
    return o.id;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Two counters", slug: `late-agree-${tag}` },
    });
    owner = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    const store = (name: string) =>
        prisma.store.create({
            data: {
                name,
                slug: `${name.toLowerCase()}-${tag}`,
                organizationId: org.id,
            },
        });
    counter = (await store("Counter")).id;
    bakery = (await store("Bakery")).id;
    await prisma.storeSettings.create({
        data: {
            storeId: counter,
            fulfilmentTypes: ["PICKUP", "SHIPPING"],
            pickupLateAfterMinutes: 20,
            shippingLateAfterMinutes: 72 * 60,
        },
    });
    // The bakery never saved settings: it reads the defaults.
    customerId = (
        await prisma.customer.create({
            data: {
                storeId: counter,
                organizationId: org.id,
                email: `asha-${tag}@example.in`,
                firstName: "Asha",
            },
        })
    ).id;

    // Five open orders: Home's Needs you shows up to five, oldest first.
    ids.counterPickup25 = await order(counter, "PICKUP", 25);
    ids.bakeryPickup25 = await order(bakery, "PICKUP", 25);
    ids.bakeryPickup150 = await order(bakery, "PICKUP", 150);
    ids.counterShipping50h = await order(counter, "SHIPPING", 50 * 60);
    ids.bakeryShipping50h = await order(bakery, "SHIPPING", 50 * 60);
});

afterAll(async () => {
    await prisma.$disconnect();
});

/** Every surface's verdict on every order. */
async function verdicts() {
    const now = new Date();
    const view = { money: true, contact: true };
    const list = await listOrderRows(owner.organizationId, {}, view, now);
    const filtered = await listOrderRows(
        owner.organizationId,
        { late: true },
        view,
        now,
    );
    const model = await home.build({
        organizationId: owner.organizationId,
        organizationRole: "OWNER",
    });

    const out: Record<
        string,
        { row: boolean; filter: boolean; detail: boolean; home: boolean }
    > = {};
    for (const [name, id] of Object.entries(ids)) {
        const row = list.rows.find((r) => r.id === id);
        const need = model.needs.find((n) =>
            n.href.startsWith(`/commerce/orders/${id}?`),
        );
        if (!row || !need) throw new Error(`${name} is missing`);
        out[name] = {
            row: row.late,
            filter: filtered.rows.some((r) => r.id === id),
            detail: (await kitchen.read(owner, id)).late,
            home: need.tone === "bad",
        };
    }
    return { out, lateCount: filtered.counts.all };
}

const agreeing = (late: boolean) => ({
    row: late,
    filter: late,
    detail: late,
    home: late,
});

describe("one Late tag across Home, Orders, Order Detail and the Late filter", () => {
    it("judges each order by its own storefront's thresholds", async () => {
        const { out, lateCount } = await verdicts();
        expect(out).toEqual({
            // 25 minutes: past the counter's 20, inside the bakery's 2 hours.
            counterPickup25: agreeing(true),
            bakeryPickup25: agreeing(false),
            bakeryPickup150: agreeing(true),
            // 50 hours: inside the counter's 72, past the bakery's 48.
            counterShipping50h: agreeing(false),
            bakeryShipping50h: agreeing(true),
        });
        expect(lateCount).toBe(3);
    });

    it("says by how much on the row and on Order Detail alike", async () => {
        const now = new Date();
        const { rows } = await listOrderRows(
            owner.organizationId,
            {},
            { money: true, contact: true },
            now,
        );
        const row = rows.find((r) => r.id === ids.counterPickup25)!;
        expect(row).toMatchObject({ lateAfterMinutes: 20, late: true });
        expect(row.lateBy).toBeGreaterThanOrEqual(4);
        expect(row.lateBy).toBeLessThanOrEqual(6);
        const detail = await kitchen.read(owner, ids.counterPickup25!);
        expect(detail).toMatchObject({ lateAfterMinutes: 20, late: true });
        expect(
            Math.abs((detail.lateBy ?? 0) - (row.lateBy ?? 0)),
        ).toBeLessThanOrEqual(1);
        const other = rows.find((r) => r.id === ids.bakeryPickup25)!;
        expect(other).toMatchObject({ lateAfterMinutes: 120, late: false });
    });

    it("re-labels open orders everywhere on the next read after a change", async () => {
        await storefronts.update(owner.organizationId, counter, {
            lateAfterMinutes: { PICKUP: 120, SHIPPING: 24 * 60 },
        });
        await storefronts.update(owner.organizationId, bakery, {
            lateAfterMinutes: { PICKUP: 20 },
        });
        const { out, lateCount } = await verdicts();
        expect(out).toEqual({
            counterPickup25: agreeing(false),
            bakeryPickup25: agreeing(true),
            bakeryPickup150: agreeing(true),
            counterShipping50h: agreeing(true),
            bakeryShipping50h: agreeing(true),
        });
        expect(lateCount).toBe(4);
    });

    it("puts a pick-up on Today at its own storefront's wait", async () => {
        const model = await home.build({
            organizationId: owner.organizationId,
            organizationRole: "OWNER",
        });
        const pickUps = model.today?.items.filter((i) => i.kind === "PICKUP");
        const due = (id: string) =>
            pickUps?.find((i) => i.id === id)?.startAt ?? null;
        const placed = async (id: string) =>
            (await prisma.order.findUniqueOrThrow({ where: { id } })).createdAt;
        // After the change: the bakery waits 20 minutes, the counter 2 hours.
        const day = businessDay(new Date(), "Asia/Kolkata");
        for (const [id, wait] of [
            [ids.bakeryPickup25!, 20],
            [ids.counterPickup25!, 120],
        ] as const) {
            const expected = new Date(
                (await placed(id)).getTime() + wait * MIN,
            );
            // Today holds only what is due inside the business's day.
            const today = expected >= day.start && expected < day.end;
            expect(due(id)).toBe(today ? expected.toISOString() : null);
        }
    });
});
