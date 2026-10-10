jest.mock("@saroh/database", () => ({
    prisma: {
        waitlistSignup: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            aggregate: jest.fn(),
            updateMany: jest.fn(),
        },
    },
}));
jest.mock("../../common/email", () => ({
    sendLinkReportEmail: jest.fn(),
}));

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { sendLinkReportEmail } from "../../common/email";
import type { SiteRelay } from "../site-accounts/site-relay";
import { SiteRelayGuard } from "../site-accounts/site-relay";
import {
    EMAILS_PER_DAY,
    REPORT_EMAILS_PER_DAY,
} from "../waitlist/tool-email-cap";
import { UnlockQrMakerDto } from "./dto";
import {
    QR_MAKER_SUBJECT,
    QR_MAKER_URL,
    qrMakerEmailText,
} from "./qr-maker-email";
import { QrMakerGateService } from "./qr-maker-gate.service";
import { QrMakerController } from "./qr-maker.controller";

/**
 * The QR code maker's email gate (QR codes plan U9): the route needs the
 * signed relay and takes an email and nothing else; an unlock stores the
 * email in the waitlist's store with its own source and never a consent,
 * leaves an entry from anywhere else as it was, and sends one email whose
 * words are fixed, so nothing a visitor typed can be in it. The tools' two
 * email caps are counted in the database, and past either the page still
 * unlocks.
 */

const relayFor = (address: string): SiteRelay => ({
    host: "www.saroh.in",
    address,
    clientHash: `hash-${address}`,
});

/**
 * The entry's two email counters, as the database would keep them: the
 * cap's conditional `updateMany` calls run against this one row.
 */
let row: { reportEmailDay: Date | null; reportEmailCount: number };
let dayTotal = 0;

const send = sendLinkReportEmail as jest.Mock;
const store = prisma.waitlistSignup as unknown as Record<
    "findUnique" | "create" | "update" | "aggregate" | "updateMany",
    jest.Mock
>;

beforeEach(() => {
    jest.clearAllMocks();
    row = { reportEmailDay: null, reportEmailCount: 0 };
    dayTotal = 0;
    send.mockResolvedValue("sent");
    store.findUnique.mockResolvedValue(null);
    store.create.mockResolvedValue({ id: "w1" });
    store.update.mockResolvedValue({ id: "w1" });
    store.aggregate.mockImplementation(() =>
        Promise.resolve({ _sum: { reportEmailCount: dayTotal } }),
    );
    store.updateMany.mockImplementation(
        ({
            where,
            data,
        }: {
            where: { reportEmailDay?: Date };
            data: { reportEmailDay?: Date };
        }) => {
            const held = row.reportEmailDay?.getTime();
            if (where.reportEmailDay) {
                // Same day, under the cap: one more.
                if (
                    held !== where.reportEmailDay.getTime() ||
                    row.reportEmailCount >= EMAILS_PER_DAY
                ) {
                    return Promise.resolve({ count: 0 });
                }
                row.reportEmailCount += 1;
            } else {
                // No day yet, or another day: start today's count.
                const day = data.reportEmailDay as Date;
                if (held === day.getTime())
                    return Promise.resolve({ count: 0 });
                row = { reportEmailDay: day, reportEmailCount: 1 };
            }
            dayTotal += 1;
            return Promise.resolve({ count: 1 });
        },
    );
});

const gate = () => new QrMakerGateService();

describe("the route", () => {
    it("is guarded by the relay: only saroh.in's server may call it", () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            QrMakerController,
        ) as unknown[];
        expect(guards).toContain(SiteRelayGuard);
    });

    it("takes an email and has no field for a link, a logo or a label", async () => {
        const dto = plainToInstance(UnlockQrMakerDto, {
            email: "  Owner@Example.com ",
        });
        expect(await validate(dto)).toEqual([]);
        expect(dto.email).toBe("owner@example.com");
        expect(Object.keys(dto)).toEqual(["email"]);
    });

    it("refuses an incomplete email in the page's words", async () => {
        const errors = await validate(
            plainToInstance(UnlockQrMakerDto, { email: "owner@" }),
        );
        expect(errors[0]?.constraints).toMatchObject({
            isEmail: "That email looks incomplete. Check it and try again.",
        });
    });

    it("limits a visitor to 5 unlocks a minute, counted by the signed relay", async () => {
        const controller = new QrMakerController(gate());
        const caller = relayFor("198.51.100.150");
        for (let i = 0; i < 5; i += 1) {
            await controller.unlock({ email: `v${i}@example.com` }, caller);
        }
        await expect(
            controller.unlock({ email: "v9@example.com" }, caller),
        ).rejects.toMatchObject({ status: 429 });
        // Another visitor is not held up by the first.
        await expect(
            controller.unlock(
                { email: "other@example.com" },
                relayFor("198.51.100.151"),
            ),
        ).resolves.toMatchObject({ unlocked: true });
    });
});

describe("unlocking the downloads", () => {
    it("stores a new entry with the tool's source, when it was used, and no consent or link", async () => {
        const now = new Date("2026-10-17T06:00:00Z");
        const result = await gate().unlock({
            email: "Owner+qr@Example.com",
            ipHash: "h1",
            now,
        });
        expect(result).toEqual({ unlocked: true, emailed: "sent" });
        expect(store.create.mock.calls[0][0].data).toEqual({
            email: "owner+qr@example.com",
            emailKey: "owner@example.com",
            businessKey: "",
            source: "qr-maker",
            checkedAt: now,
            newsConsent: false,
            ipHash: "h1",
        });
    });

    it("sends one email, to the address, in fixed words with the link back", async () => {
        await gate().unlock({ email: "owner@example.com" });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(
            "owner@example.com",
            QR_MAKER_SUBJECT,
            qrMakerEmailText(),
        );
        expect(qrMakerEmailText()).toContain(QR_MAKER_URL);
    });

    it("the email carries no visitor text: its words take no input, and say so", () => {
        // Nothing to pass in: the subject is a constant and the body a
        // function of nothing, so two visitors get the same email.
        expect(qrMakerEmailText).toHaveLength(0);
        expect(qrMakerEmailText()).toBe(qrMakerEmailText());
        const text = `${QR_MAKER_SUBJECT}\n${qrMakerEmailText()}`;
        // The only address in it is the tool's own, with no query string.
        expect(text.match(/https?:\/\/\S+/g)).toEqual([QR_MAKER_URL]);
        expect(QR_MAKER_URL).toBe("https://www.saroh.in/tools/qr-code-maker");
        expect(text).not.toContain("?");
        expect(text).not.toContain("@");
    });

    it("touches only when its own entry was last used", async () => {
        store.findUnique.mockResolvedValue({ id: "w1", source: "qr-maker" });
        const now = new Date("2026-10-18T06:00:00Z");
        await gate().unlock({ email: "back@example.com", now });
        expect(store.create).not.toHaveBeenCalled();
        expect(store.update.mock.calls[0][0].data).toEqual({ checkedAt: now });
    });

    it.each(["direct", "link-preview", null])(
        "leaves an entry from elsewhere (source %s) exactly as it was",
        async (source) => {
            store.findUnique.mockResolvedValue({ id: "w1", source });
            await expect(
                gate().unlock({ email: "joined@example.com" }),
            ).resolves.toEqual({ unlocked: true, emailed: "sent" });
            expect(store.create).not.toHaveBeenCalled();
            expect(store.update).not.toHaveBeenCalled();
        },
    );

    it("uses the entry another unlock made at the same moment", async () => {
        store.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "w2", source: "qr-maker" });
        store.create.mockRejectedValue({ code: "P2002" });
        await expect(
            gate().unlock({ email: "twice@example.com" }),
        ).resolves.toMatchObject({ unlocked: true });
        expect(store.updateMany.mock.calls[0][0].where.id).toBe("w2");
    });

    it(`emails one address at most ${EMAILS_PER_DAY} times a UTC day, counted in the database, and still unlocks`, async () => {
        const now = new Date("2026-10-17T10:00:00Z");
        for (let i = 0; i < EMAILS_PER_DAY; i += 1) {
            await gate().unlock({ email: "target@example.com", now });
        }
        await expect(
            gate().unlock({ email: "Target+x@example.com", now }),
        ).resolves.toEqual({ unlocked: true, emailed: "limited" });
        expect(send).toHaveBeenCalledTimes(EMAILS_PER_DAY);
        // A new UTC day starts the count again.
        await expect(
            gate().unlock({
                email: "target@example.com",
                now: new Date("2026-10-18T00:00:01Z"),
            }),
        ).resolves.toEqual({ unlocked: true, emailed: "sent" });
    });

    it(`sends nothing past ${REPORT_EMAILS_PER_DAY} tool emails a day in all, and still unlocks`, async () => {
        dayTotal = REPORT_EMAILS_PER_DAY;
        await expect(
            gate().unlock({ email: "late@example.com" }),
        ).resolves.toEqual({ unlocked: true, emailed: "not-sent" });
        expect(send).not.toHaveBeenCalled();
    });

    it("says when mail is down, and still unlocks", async () => {
        send.mockResolvedValue("not-configured");
        await expect(
            gate().unlock({ email: "down@example.com" }),
        ).resolves.toEqual({ unlocked: true, emailed: "not-sent" });
    });
});
