// Price history (owner, 12 Oct 2026) on the first service Bookings makes
// when it is turned on: a priced one starts its history on the switch's own
// transaction. DB-free: the transaction is a fake.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {},
}));

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { AppointmentsSetupDto } from "./module-setup.dto";
import { prepareSetup } from "./module-setup.writers";
import { TRADE_PRESETS } from "./trade-presets";

const asha: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_asha",
    role: "OWNER",
};

function fakeTx(existing: { id: string } | null = null) {
    return {
        service: {
            findFirst: jest.fn().mockResolvedValue(existing),
            create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: "svc_new", ...data }),
            ),
        },
        businessProfile: {
            findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }),
        },
        // The business's currency: its first storefront's.
        store: {
            findFirst: jest
                .fn()
                .mockResolvedValue({ settings: { currency: "INR" } }),
        },
        availabilityRule: { createMany: jest.fn() },
        auditEvent: { create: jest.fn() },
    };
}

const setup = (price: string): AppointmentsSetupDto =>
    ({
        hours: [{ weekday: 1, open: "09:00", close: "17:00" }],
        service: { name: "Haircut", durationMinutes: 45, price },
    }) as AppointmentsSetupDto;

const write = async (tx: ReturnType<typeof fakeTx>, price: string) =>
    (await prepareSetup(asha, "APPOINTMENTS", setup(price), {} as never))(
        tx as never,
    );

describe("the first service's price history", () => {
    it("starts at the price it was set up with, by who turned Bookings on", async () => {
        const tx = fakeTx();
        await write(tx, "500");
        expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
        expect(tx.auditEvent.create).toHaveBeenCalledWith({
            data: {
                action: "price.set",
                actorUserId: "u_asha",
                organizationId: "org_1",
                targetType: "service",
                targetId: "svc_new",
                outcome: "SUCCESS",
                metadata: {
                    kind: "SERVICE",
                    name: "Haircut",
                    currency: "INR",
                    source: "setup",
                    changes: [
                        { field: "price", before: null, after: "500.00" },
                    ],
                },
            },
        });
    });

    it("has none when the service was set up with no price", async () => {
        const tx = fakeTx();
        await write(tx, "");
        expect(tx.service.create).toHaveBeenCalledTimes(1);
        expect(tx.auditEvent.create).not.toHaveBeenCalled();
    });

    it("has none when Bookings is turned on again: nothing is made", async () => {
        const tx = fakeTx({ id: "svc_1" });
        await write(tx, "500");
        expect(tx.service.create).not.toHaveBeenCalled();
        expect(tx.auditEvent.create).not.toHaveBeenCalled();
    });
});

describe("a trade starter (DEC-189)", () => {
    const writeTrade = async (
        tx: ReturnType<typeof fakeTx>,
        trade: AppointmentsSetupDto,
    ) =>
        (await prepareSetup(asha, "APPOINTMENTS", trade, {} as never))(
            tx as never,
        );
    const created = (tx: ReturnType<typeof fakeTx>) =>
        tx.service.create.mock.calls.map(
            (c) => (c[0] as { data: Record<string, unknown> }).data,
        );

    it("writes the salon's samples, hidden, each with its hours and price history", async () => {
        const tx = fakeTx();
        await writeTrade(tx, { trade: "SALON" } as AppointmentsSetupDto);
        const { services, hours } = TRADE_PRESETS.SALON;
        expect(created(tx)).toEqual(
            services.map((s) =>
                expect.objectContaining({
                    name: s.name,
                    durationMinutes: s.durationMinutes,
                    priceCents: s.priceCents,
                    currency: "INR",
                    isSample: true,
                    showOnBookingPage: false,
                }),
            ),
        );
        // Every salon sample is priced: one history entry each.
        expect(tx.auditEvent.create).toHaveBeenCalledTimes(services.length);
        expect(tx.availabilityRule.createMany).toHaveBeenCalledTimes(
            services.length,
        );
        expect(tx.availabilityRule.createMany).toHaveBeenCalledWith({
            data: hours.map((h) =>
                expect.objectContaining({ dayOfWeek: h.weekday }),
            ),
        });
    });

    it("uses the hours sent over the preset's", async () => {
        const tx = fakeTx();
        await writeTrade(tx, {
            trade: "GYM",
            hours: [{ weekday: 3, open: "07:00", close: "09:00" }],
        } as AppointmentsSetupDto);
        expect(tx.availabilityRule.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    dayOfWeek: 3,
                    startMinute: 420,
                    endMinute: 540,
                }),
            ],
        });
        // The free trial has no price, so no currency and no history.
        expect(
            created(tx).find((d) => d.name === "Free trial session"),
        ).toEqual(
            expect.objectContaining({ priceCents: null, currency: null }),
        );
        expect(tx.auditEvent.create).toHaveBeenCalledTimes(
            TRADE_PRESETS.GYM.services.length - 1,
        );
    });

    it("without a trade, the one typed service is no sample", async () => {
        const tx = fakeTx();
        await write(tx, "500");
        const [data] = created(tx);
        expect(data).not.toHaveProperty("isSample");
        expect(data).not.toHaveProperty("showOnBookingPage");
    });
});
