jest.mock("@saroh/database", () => {
    const prisma = {
        contactMessage: { create: jest.fn(), deleteMany: jest.fn() },
    };
    return { prisma };
});

jest.mock("../../common/email", () => ({
    sendContactMessageNotice: jest.fn().mockResolvedValue("sent"),
}));

import { HttpException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { sendContactMessageNotice } from "../../common/email";
import { ContactMessagesService } from "./contact-messages.service";
import {
    CONTACT_MESSAGE_KEEP_DAYS,
    deleteOldContactMessages,
} from "./contact-retention";
import { CONTACT_MESSAGE_MAX, SendContactMessageDto } from "./dto";
import { PublicContactMessagesController } from "./public-contact-messages.controller";

const db = prisma as unknown as {
    contactMessage: { create: jest.Mock; deleteMany: jest.Mock };
};

beforeEach(() => {
    jest.clearAllMocks();
    db.contactMessage.create.mockResolvedValue({ id: "m1" });
    db.contactMessage.deleteMany.mockResolvedValue({ count: 0 });
});

const ok = {
    topic: "question",
    name: "Asha Rao",
    email: "asha.rao@example.com",
    message: "Can I take bookings for two branches?",
};

describe("SendContactMessageDto", () => {
    async function check(body: Record<string, unknown>) {
        const dto = plainToInstance(SendContactMessageDto, body);
        const errors = await validate(dto, {
            whitelist: true,
            forbidNonWhitelisted: true,
        });
        return { dto, fields: errors.map((e) => e.property) };
    }

    it("takes a topic, a name, an email and a message, the kind optional", async () => {
        const { dto, fields } = await check({
            ...ok,
            name: "  Asha   Rao ",
            email: "  Asha.Rao@Example.com ",
            kind: "salon",
            message: "  Can I take bookings for two branches?  ",
        });
        expect(fields).toEqual([]);
        expect(dto.name).toBe("Asha Rao");
        expect(dto.email).toBe("asha.rao@example.com");
        expect(dto.kind).toBe("salon");
        expect(dto.message).toBe("Can I take bookings for two branches?");
    });

    it("treats a blank kind as none", async () => {
        const { dto, fields } = await check({ ...ok, kind: "" });
        expect(fields).toEqual([]);
        expect(dto.kind).toBeUndefined();
    });

    it("refuses a missing name, a bad email and a message under five characters", async () => {
        expect((await check({ ...ok, name: "   " })).fields).toEqual(["name"]);
        expect((await check({ ...ok, email: "nope" })).fields).toEqual([
            "email",
        ]);
        expect((await check({ ...ok, message: "hey" })).fields).toEqual([
            "message",
        ]);
    });

    it("refuses a topic or a kind the form doesn't offer", async () => {
        expect((await check({ ...ok, topic: "sales" })).fields).toEqual([
            "topic",
        ]);
        expect((await check({ ...ok, kind: "bank" })).fields).toEqual(["kind"]);
    });

    it("refuses a message past the longest kept", async () => {
        expect(
            (
                await check({
                    ...ok,
                    message: "x".repeat(CONTACT_MESSAGE_MAX + 1),
                })
            ).fields,
        ).toEqual(["message"]);
    });

    it("refuses a field it doesn't know", async () => {
        expect(
            (await check({ ...ok, organizationId: "org_1" })).fields,
        ).toEqual(["organizationId"]);
    });
});

const notice = sendContactMessageNotice as jest.MockedFunction<
    typeof sendContactMessageNotice
>;

describe("ContactMessagesService.send", () => {
    const service = new ContactMessagesService();

    it("stores the message with what the form asked, and nothing else", async () => {
        await expect(
            service.send({
                topic: "bug",
                name: "Asha Rao",
                email: "asha.rao@example.com",
                kind: "gym",
                message: "  The calendar didn't open.  ",
                ipHash: "hash",
            }),
        ).resolves.toEqual({ ok: true });
        expect(db.contactMessage.create).toHaveBeenCalledWith({
            data: {
                topic: "bug",
                name: "Asha Rao",
                email: "asha.rao@example.com",
                kind: "gym",
                message: "The calendar didn't open.",
                ipHash: "hash",
            },
            select: { id: true },
        });
    });

    it("tells the team's inbox, in the page's own words for the topic", async () => {
        notice.mockClear();
        await service.send({
            topic: "bug",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            kind: "gym",
            message: "  The calendar didn't open.  ",
        });
        expect(notice).toHaveBeenCalledTimes(1);
        expect(notice).toHaveBeenCalledWith({
            topic: "Something's not working",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            kind: "gym",
            message: "The calendar didn't open.",
        });
    });

    it("still answers as sent when the notice can't go: the message is stored", async () => {
        notice.mockResolvedValueOnce("failed");
        db.contactMessage.create.mockClear();
        await expect(
            service.send({
                topic: "question",
                name: "Asha Rao",
                email: "asha.rao@example.com",
                message: "One line.",
            }),
        ).resolves.toEqual({ ok: true });
        expect(db.contactMessage.create).toHaveBeenCalledTimes(1);
    });

    it("keeps no kind and no digest when there is none", async () => {
        await service.send({
            topic: "question",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            message: "One line.",
        });
        expect(db.contactMessage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ kind: null, ipHash: null }),
            }),
        );
    });

    it("logs the topic only, never the name, the email or the words", async () => {
        const logged: string[] = [];
        const spy = jest
            .spyOn(
                (service as unknown as { logger: { log: (m: string) => void } })
                    .logger,
                "log",
            )
            .mockImplementation((m: string) => {
                logged.push(m);
            });
        await service.send({
            topic: "help",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            message: "My booking page is empty.",
        });
        spy.mockRestore();
        expect(logged).toEqual(["contact message: help, notice sent"]);
    });

    it("fails when the message could not be stored", async () => {
        db.contactMessage.create.mockRejectedValue(new Error("db down"));
        await expect(
            service.send({
                topic: "question",
                name: "Asha Rao",
                email: "asha.rao@example.com",
                message: "One line.",
            }),
        ).rejects.toThrow("db down");
    });
});

describe("PublicContactMessagesController", () => {
    const dto = ok as unknown as SendContactMessageDto;

    it("passes a hash of the address on, never the address", async () => {
        const send = jest.fn().mockResolvedValue({ ok: true });
        const controller = new PublicContactMessagesController({
            send,
        } as unknown as ContactMessagesService);
        await controller.send(dto, "203.0.113.5", undefined);
        const call = send.mock.calls[0]?.[0] as { ipHash?: string };
        expect(call.ipHash).toBeDefined();
        expect(call.ipHash).not.toContain("203.0.113.5");
    });

    it("refuses a fourth message in a minute from one address with 429", async () => {
        const send = jest.fn().mockResolvedValue({ ok: true });
        const controller = new PublicContactMessagesController({
            send,
        } as unknown as ContactMessagesService);
        const go = () => controller.send(dto, "203.0.113.9", undefined);
        await go();
        await go();
        await go();
        const refused = await go().catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(HttpException);
        expect((refused as HttpException).getStatus()).toBe(429);
        expect(send).toHaveBeenCalledTimes(3);
    });
});

describe("deleteOldContactMessages", () => {
    it("deletes what arrived more than 12 months before now", async () => {
        db.contactMessage.deleteMany.mockResolvedValue({ count: 2 });
        const now = new Date("2027-10-20T00:00:00Z");
        await expect(deleteOldContactMessages(now)).resolves.toBe(2);
        expect(CONTACT_MESSAGE_KEEP_DAYS).toBe(365);
        expect(db.contactMessage.deleteMany).toHaveBeenCalledWith({
            where: { createdAt: { lt: new Date("2026-10-20T00:00:00Z") } },
        });
    });
});
