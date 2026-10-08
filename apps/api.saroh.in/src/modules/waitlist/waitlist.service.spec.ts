jest.mock("@saroh/database", () => ({
    prisma: {
        waitlistSignup: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
    },
}));
// Nothing a join does may send mail: every sender is a spy that must stay
// untouched, and nodemailer itself cannot open a connection.
jest.mock("../../common/email", () => ({
    sendWaitlistLaunchInviteEmail: jest.fn(),
    sendEnquiryNotificationEmail: jest.fn(),
    sendVerificationOtpEmail: jest.fn(),
}));
jest.mock("nodemailer", () => ({
    createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
}));

import { prisma } from "@saroh/database";
import nodemailer from "nodemailer";

import * as email from "../../common/email";
import { WaitlistService } from "./waitlist.service";

const findUnique = prisma.waitlistSignup.findUnique as jest.Mock;
const create = prisma.waitlistSignup.create as jest.Mock;

const V2 = {
    email: "founder@example.test",
    business: "Glow Studio",
    kind: "salon" as const,
};

describe("WaitlistService", () => {
    let service: WaitlistService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new WaitlistService();
        findUnique.mockResolvedValue(null);
        create.mockImplementation(
            ({ data }: { data: { refCode: string | null } }) =>
                Promise.resolve({ position: 312, refCode: data.refCode }),
        );
    });

    it("stores a saved gallery template, and drops one it doesn't know", async () => {
        await service.join({ ...V2, template: "Gym" });
        expect(create).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ template: "gym" }),
            }),
        );

        await service.join({ ...V2, template: "no-such-template" });
        expect(create).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ template: null }),
            }),
        );

        // The V1 form (an email alone) saves no template, as it saves no kind.
        await service.join({ email: "v1@example.test", template: "gym" });
        expect(create).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ template: null, kind: null }),
            }),
        );
    });

    it("stores a new entry and hands back its place and referral id", async () => {
        const result = await service.join({ ...V2, city: "Pune" });

        expect(result).toEqual({
            created: true,
            position: 312,
            refCode: expect.stringMatching(/^[a-z2-9]{8}$/),
        });
        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                email: "founder@example.test",
                emailKey: "founder@example.test",
                businessName: "Glow Studio",
                businessKey: "glow studio",
                kind: "salon",
                city: "Pune",
                source: "direct",
                referredById: null,
            }),
            select: { position: true, refCode: true },
        });
    });

    it("looks a repeat up by normalised email and business", async () => {
        await service.join({ ...V2, email: " A.B+x@Gmail.com " });

        expect(findUnique).toHaveBeenCalledWith({
            where: {
                emailKey_businessKey: {
                    emailKey: "ab@gmail.com",
                    businessKey: "glow studio",
                },
            },
            select: { id: true },
        });
    });

    it("answers a repeat with no place or link, and writes nothing", async () => {
        findUnique.mockResolvedValue({ id: "wl_existing" });

        await expect(service.join(V2)).resolves.toEqual({ created: false });
        expect(create).not.toHaveBeenCalled();
    });

    it("treats a concurrent insert race (P2002) as a repeat, not a 500", async () => {
        findUnique
            .mockResolvedValueOnce(null) // the first check
            .mockResolvedValueOnce({ id: "wl_winner" }); // after the clash
        create.mockRejectedValue(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );

        await expect(service.join(V2)).resolves.toEqual({ created: false });
    });

    it("draws another referral id when the clash was the id", async () => {
        findUnique.mockResolvedValue(null);
        create
            .mockRejectedValueOnce(
                Object.assign(new Error("unique"), { code: "P2002" }),
            )
            .mockResolvedValueOnce({ position: 9, refCode: "abcdefgh" });

        await expect(service.join(V2)).resolves.toEqual({
            created: true,
            position: 9,
            refCode: "abcdefgh",
        });
        expect(create).toHaveBeenCalledTimes(2);
    });

    it("propagates failures that are not a unique violation", async () => {
        create.mockRejectedValue(
            Object.assign(new Error("connection lost"), { code: "P1001" }),
        );

        await expect(service.join(V2)).rejects.toThrow("connection lost");
    });

    it("stores a V1 email-only signup with no business and no link", async () => {
        await service.join({ email: "a@example.test", source: "saroh.in" });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    businessName: null,
                    businessKey: "",
                    kind: null,
                    source: "saroh.in",
                    refCode: null,
                }),
            }),
        );
    });

    it("stores the page's source and plan", async () => {
        await service.join({ ...V2, source: "instagram", plan: "grow" });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    source: "instagram",
                    plan: "grow",
                }),
            }),
        );
    });

    describe("referrals", () => {
        const owner = {
            id: "wl_owner",
            emailKey: "owner@example.test",
            ipHash: "hash-owner",
        };

        function withOwner() {
            findUnique.mockImplementation(
                ({ where }: { where: { refCode?: string } }) =>
                    Promise.resolve(where.refCode ? owner : null),
            );
        }

        it("credits the link's owner", async () => {
            withOwner();
            await service.join({ ...V2, ref: "abcdefgh", ipHash: "hash-new" });

            expect(create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ referredById: "wl_owner" }),
                }),
            );
        });

        it("does not count a self-referral by the same person", async () => {
            withOwner();
            await service.join({
                ...V2,
                email: "Owner+2@example.test",
                ref: "abcdefgh",
                ipHash: "hash-new",
            });

            expect(create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ referredById: null }),
                }),
            );
        });

        it("does not count a self-referral from the same address", async () => {
            withOwner();
            await service.join({
                ...V2,
                ref: "abcdefgh",
                ipHash: "hash-owner",
            });

            expect(create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ referredById: null }),
                }),
            );
        });

        it("ignores a malformed id without looking it up", async () => {
            await service.join({ ...V2, ref: "../../etc" });

            expect(findUnique).toHaveBeenCalledTimes(1); // the repeat check only
            expect(create).toHaveBeenCalled();
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

        await service.join(V2);
        findUnique.mockResolvedValue({ id: "wl_existing" });
        await service.join(V2);

        expect(logged.join(" ")).not.toContain("founder@example.test");
        expect(logged.join(" ")).toContain("f***@example.test");
    });

    it("sends no email on join: nothing leaves the process", async () => {
        await service.join(V2);
        findUnique.mockResolvedValue({ id: "wl_existing" });
        await service.join(V2);

        const senders = Object.values(email).filter(
            (value): value is jest.Mock => jest.isMockFunction(value),
        );
        expect(senders.length).toBeGreaterThan(0);
        for (const sender of senders) {
            expect(sender).not.toHaveBeenCalled();
        }
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
});
