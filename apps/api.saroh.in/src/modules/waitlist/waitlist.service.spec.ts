jest.mock("@saroh/database", () => ({
    prisma: {
        waitlistSignup: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
    },
}));

import { prisma } from "@saroh/database";

import { WaitlistService } from "./waitlist.service";

const findUnique = prisma.waitlistSignup.findUnique as jest.Mock;
const create = prisma.waitlistSignup.create as jest.Mock;

describe("WaitlistService", () => {
    let service: WaitlistService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new WaitlistService();
        findUnique.mockResolvedValue(null);
        create.mockResolvedValue({ id: "wl_1" });
    });

    it("stores a new signup and reports it as created", async () => {
        await expect(
            service.join({ email: "founder@example.test" }),
        ).resolves.toEqual({ created: true });

        expect(create).toHaveBeenCalledWith({
            data: {
                email: "founder@example.test",
                source: null,
                ipHash: null,
            },
        });
    });

    it("normalizes the email so casing and padding cannot create duplicates", async () => {
        await service.join({ email: "  Founder@Example.TEST  " });

        expect(findUnique).toHaveBeenCalledWith({
            where: { email: "founder@example.test" },
            select: { id: true },
        });
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    email: "founder@example.test",
                }),
            }),
        );
    });

    it("is idempotent: a repeat signup writes nothing and does not throw", async () => {
        findUnique.mockResolvedValue({ id: "wl_existing" });

        await expect(
            service.join({ email: "founder@example.test" }),
        ).resolves.toEqual({ created: false });

        expect(create).not.toHaveBeenCalled();
    });

    it("treats a concurrent insert race (P2002) as a repeat, not a 500", async () => {
        // Both requests pass findUnique before either inserts; the loser hits
        // the unique index. The caller wanted the address on the list and it is.
        findUnique.mockResolvedValue(null);
        create.mockRejectedValue(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );

        await expect(
            service.join({ email: "founder@example.test" }),
        ).resolves.toEqual({ created: false });
    });

    it("propagates failures that are not a unique violation", async () => {
        create.mockRejectedValue(
            Object.assign(new Error("connection lost"), { code: "P1001" }),
        );

        await expect(
            service.join({ email: "founder@example.test" }),
        ).rejects.toThrow("connection lost");
    });

    it("persists source and ipHash when supplied", async () => {
        await service.join({
            email: "founder@example.test",
            source: "saroh.in",
            ipHash: "abc123",
        });

        expect(create).toHaveBeenCalledWith({
            data: {
                email: "founder@example.test",
                source: "saroh.in",
                ipHash: "abc123",
            },
        });
    });

    it("never logs a full email address", async () => {
        const logged: string[] = [];
        jest.spyOn(
            (service as unknown as { logger: { log: (m: string) => void } })
                .logger,
            "log",
        ).mockImplementation((message: string) => {
            logged.push(message);
        });

        await service.join({ email: "founder@example.test" });

        expect(logged.join(" ")).not.toContain("founder@example.test");
        // "founder" -> first two chars kept, remaining five masked.
        expect(logged.join(" ")).toContain("fo*****@example.test");
    });
});
