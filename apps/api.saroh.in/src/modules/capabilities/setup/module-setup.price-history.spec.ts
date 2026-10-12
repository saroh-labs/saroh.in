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
