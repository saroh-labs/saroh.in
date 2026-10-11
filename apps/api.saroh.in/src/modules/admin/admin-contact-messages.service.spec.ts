jest.mock("@saroh/database", () => {
    const prisma = { contactMessage: { findMany: jest.fn() } };
    return { prisma };
});

import { prisma } from "@saroh/database";

import { AdminContactMessagesService } from "./admin-contact-messages.service";

const db = prisma as unknown as {
    contactMessage: { findMany: jest.Mock };
};

const row = (n: number) => ({
    id: `m${n}`,
    topic: "question",
    name: "Asha Rao",
    email: "asha.rao@example.com",
    kind: null,
    message: `Message ${n}`,
    createdAt: new Date("2026-10-11T10:00:00Z"),
});

beforeEach(() => {
    jest.clearAllMocks();
    db.contactMessage.findMany.mockResolvedValue([row(1)]);
});

describe("AdminContactMessagesService.list", () => {
    const service = new AdminContactMessagesService();

    it("lists every topic newest first, without the address digest", async () => {
        const page = await service.list({});
        expect(page).toEqual({ items: [row(1)], nextCursor: undefined });
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
