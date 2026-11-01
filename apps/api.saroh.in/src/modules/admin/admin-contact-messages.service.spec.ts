jest.mock("@saroh/database", () => {
    const prisma = {
        contactMessage: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
            findUniqueOrThrow: jest.fn(),
        },
        sarohLead: { findMany: jest.fn().mockResolvedValue([]) },
        waitlistSignup: { findMany: jest.fn().mockResolvedValue([]) },
        user: { findMany: jest.fn().mockResolvedValue([]) },
        adminAuditEvent: { create: jest.fn() },
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
        (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    return { prisma };
});

import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminContactMessagesService } from "./admin-contact-messages.service";

const db = prisma as unknown as {
    contactMessage: {
        findMany: jest.Mock;
        updateMany: jest.Mock;
        findUniqueOrThrow: jest.Mock;
    };
    sarohLead: { findMany: jest.Mock };
    waitlistSignup: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
};
const audit = { write: jest.fn() };
const staff = { userId: "support_1" } as PlatformAdminInfo;
const noLinks = { lead: false, waitlist: false, userId: null };

const row = (n: number) => ({
    id: `m${n}`,
    topic: "question",
    name: "Asha Rao",
    email: "asha.rao@example.com",
    kind: null,
    message: `Message ${n}`,
    createdAt: new Date("2026-10-11T10:00:00Z"),
    handledAt: null,
});

beforeEach(() => {
    jest.clearAllMocks();
    db.contactMessage.findMany.mockResolvedValue([row(1)]);
});

describe("AdminContactMessagesService.list", () => {
    const service = new AdminContactMessagesService(
        audit as unknown as AdminAuditService,
    );

    it("lists every topic newest first, without the address digest", async () => {
        const page = await service.list({});
        expect(page).toEqual({
            items: [{ ...row(1), links: noLinks }],
            nextCursor: undefined,
        });
        const call = db.contactMessage.findMany.mock.calls[0]?.[0] as {
            where: unknown;
            select: Record<string, boolean>;
            orderBy: unknown;
            take: number;
        };
        expect(call.where).toEqual({});
        expect(call.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
        expect(call.take).toBe(51);
        expect(call.select.ipHash).toBeUndefined();
    });

    it("narrows to one topic on asking", async () => {
        await service.list({ topic: "bug" });
        expect(db.contactMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { topic: "bug" } }),
        );
    });

    it("hands back a cursor only when there is another page", async () => {
        db.contactMessage.findMany.mockResolvedValue(
            Array.from({ length: 51 }, (_, i) => row(i + 1)),
        );
        const first = await service.list({});
        expect(first.items).toHaveLength(50);
        expect(first.nextCursor).toBe("m50");

        await service.list({ cursor: "m50" });
        expect(db.contactMessage.findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({ cursor: { id: "m50" }, skip: 1 }),
        );
    });
});

describe("handled state and links", () => {
    const service = new AdminContactMessagesService(
        audit as unknown as AdminAuditService,
    );

    it("narrows to open or handled, and to one address", async () => {
        await service.list({ state: "open", email: "Asha@Example.com" });
        expect(db.contactMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    handledAt: null,
                    email: { equals: "Asha@Example.com", mode: "insensitive" },
                },
            }),
        );
        await service.list({ state: "handled" });
        expect(db.contactMessage.findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({
                where: { handledAt: { not: null } },
            }),
        );
    });

    it("says when the writer is also a lead, on the waitlist, or has an account", async () => {
        db.sarohLead.findMany.mockResolvedValueOnce([
            { emailKey: "asharao@example.com", signUpEmailKey: null },
        ]);
        db.user.findMany.mockResolvedValueOnce([
            { id: "u1", email: "asha.rao@example.com" },
        ]);
        const page = await service.list({});
        expect(page.items[0]?.links).toEqual({
            lead: false,
            waitlist: false,
            userId: "u1",
        });
        db.sarohLead.findMany.mockResolvedValueOnce([
            { emailKey: "asha.rao@example.com", signUpEmailKey: null },
        ]);
        db.waitlistSignup.findMany.mockResolvedValueOnce([
            { emailKey: "asha.rao@example.com" },
        ]);
        const again = await service.list({});
        expect(again.items[0]?.links).toMatchObject({
            lead: true,
            waitlist: true,
        });
    });

    it("marks one handled with who did it, on the record", async () => {
        db.contactMessage.updateMany.mockResolvedValue({ count: 1 });
        db.contactMessage.findUniqueOrThrow.mockResolvedValue({
            id: "m1",
            handledAt: new Date(),
        });
        await service.mark(staff, "m1", true);
        expect(db.contactMessage.updateMany).toHaveBeenCalledWith({
            where: { id: "m1" },
            data: { handledAt: expect.any(Date), handledByUserId: "support_1" },
        });
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                action: "contact-message.handled",
                targetId: "m1",
            }),
        );
        await service.mark(staff, "m1", false);
        expect(db.contactMessage.updateMany).toHaveBeenLastCalledWith({
            where: { id: "m1" },
            data: { handledAt: null, handledByUserId: null },
        });
    });

    it("refuses a message that isn't there", async () => {
        db.contactMessage.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.mark(staff, "gone", true)).rejects.toThrow(
            "Message not found",
        );
    });
});
