/**
 * The free downloads' gate against a real Postgres (plan 2026-10-31-002
 * U9): one `DownloadLead` per contact and download, a repeat touches it, a
 * refused request writes nothing, a phone lead is never messaged, no lead
 * holds a marketing consent, and the retention sweep drops a lead 12
 * months after its last request.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/email", () => ({
    sendLinkReportEmail: jest.fn().mockResolvedValue("sent"),
}));

import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import type { ChallengeVerifier } from "../site-accounts/challenge";
import { EMAILS_PER_DAY, utcDay } from "../waitlist/tool-email-cap";
import { WaitlistRetentionHandler } from "../waitlist/waitlist-retention.handler";
import { DownloadGateController } from "./download-gate.controller";
import { DownloadGateService, downloadContact } from "./download-gate.service";
import { DOWNLOAD_CONSENT_VERSION } from "./download-names";
import { DownloadUnlockDto } from "./dto";

const SLUG = "customer-list-template";
const DAY_MS = 24 * 60 * 60 * 1000;
const gate = new DownloadGateService();
const send = sendLinkReportEmail as jest.Mock;
const relay = {
    host: "www.saroh.in",
    address: "203.0.113.9",
    clientHash: "h1",
};

const ask = (contact: { email?: string; phone?: string }, slug = SLUG) =>
    gate.unlock({ slug, contact: downloadContact(contact), ipHash: "h1" });

beforeEach(async () => {
    await prisma.downloadLead.deleteMany({});
    await prisma.waitlistSignup.deleteMany({});
    jest.clearAllMocks();
});

describe("a download's lead", () => {
    it("stores an email lead with its source and consent version, and emails the link", async () => {
        await expect(ask({ email: "Owner@Example.com" })).resolves.toEqual({
            unlocked: true,
            emailed: "sent",
        });
        const [lead] = await prisma.downloadLead.findMany();
        expect(lead).toMatchObject({
            email: "owner@example.com",
            phone: null,
            contactKey: "owner@example.com",
            slug: SLUG,
            source: `download:${SLUG}`,
            purpose: "download",
            consentVersion: DOWNLOAD_CONSENT_VERSION,
            ipHash: "h1",
            emailCount: 1,
        });
        // Nothing to say yes to news with.
        expect(
            Object.keys(lead ?? {}).some(
                (k) => /consent/i.test(k) && k !== "consentVersion",
            ),
        ).toBe(false);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("stores a phone lead as +91 and messages nobody", async () => {
        await expect(ask({ phone: "98450 12345" })).resolves.toEqual({
            unlocked: true,
            emailed: "none",
        });
        const [lead] = await prisma.downloadLead.findMany();
        expect(lead).toMatchObject({
            email: null,
            phone: "+919845012345",
            contactKey: "+919845012345",
            emailCount: 0,
        });
        expect(send).not.toHaveBeenCalled();
    });

    it("a repeat for the same contact and download updates its one row", async () => {
        await ask({ phone: "9845012345" });
        const first = await prisma.downloadLead.findFirstOrThrow();
        await new Promise((r) => setTimeout(r, 5));
        await ask({ phone: "+91 98450 12345" });
        const rows = await prisma.downloadLead.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe(first.id);
        expect(rows[0]?.createdAt).toEqual(first.createdAt);
        expect(rows[0]!.lastRequestedAt.getTime()).toBeGreaterThan(
            first.lastRequestedAt.getTime(),
        );
    });

    it("two downloads make two rows", async () => {
        await ask({ phone: "9845012345" });
        await ask({ phone: "9845012345" }, "another-download");
        expect(await prisma.downloadLead.count()).toBe(2);
    });

    it("a row with both or neither contact is refused by the table", async () => {
        const row = {
            contactKey: "k",
            slug: SLUG,
            source: `download:${SLUG}`,
            consentVersion: DOWNLOAD_CONSENT_VERSION,
        };
        await expect(
            prisma.downloadLead.create({ data: row }),
        ).rejects.toThrow();
        await expect(
            prisma.downloadLead.create({
                data: {
                    ...row,
                    email: "a@example.com",
                    phone: "+919845012345",
                },
            }),
        ).rejects.toThrow();
    });

    it("keeps the tools' per-address cap: past it the file is still given, no email", async () => {
        for (let i = 0; i < EMAILS_PER_DAY; i += 1) {
            await ask({ email: "cap@example.com" });
        }
        await expect(ask({ email: "cap@example.com" })).resolves.toEqual({
            unlocked: true,
            emailed: "limited",
        });
        expect(send).toHaveBeenCalledTimes(EMAILS_PER_DAY);
        const [lead] = await prisma.downloadLead.findMany();
        expect(lead?.emailCount).toBe(EMAILS_PER_DAY);
    });

    it("counts the tools' emails to the same address against its cap", async () => {
        await prisma.waitlistSignup.create({
            data: {
                email: "cap@example.com",
                emailKey: "cap@example.com",
                source: "qr-maker",
                reportEmailDay: utcDay(new Date()),
                reportEmailCount: EMAILS_PER_DAY,
            },
        });
        await expect(ask({ email: "cap@example.com" })).resolves.toEqual({
            unlocked: true,
            emailed: "limited",
        });
        expect(send).not.toHaveBeenCalled();
    });
});

describe("a refused request writes nothing", () => {
    const challenge = {
        configured: true,
        siteKey: "k",
        verify: jest.fn().mockResolvedValue(true),
    };
    const controller = () =>
        new DownloadGateController(
            gate,
            challenge as unknown as ChallengeVerifier,
        );
    const dto = (b: Partial<DownloadUnlockDto>) =>
        Object.assign(new DownloadUnlockDto(), { slug: SLUG, ...b });

    it("for every refusal", async () => {
        const c = controller();
        await expect(
            c.unlock(dto({ slug: "nope", email: "a@example.com" }), relay),
        ).rejects.toThrow();
        await expect(c.unlock(dto({}), relay)).rejects.toThrow();
        await expect(
            c.unlock(dto({ phone: "12345" }), relay),
        ).rejects.toThrow();
        challenge.verify.mockResolvedValueOnce(false);
        await expect(
            c.unlock(dto({ email: "a@example.com" }), relay),
        ).rejects.toThrow();
        expect(await prisma.downloadLead.count()).toBe(0);
    });

    it("the 6th in a minute from one contact", async () => {
        const c = controller();
        for (let i = 0; i < 5; i += 1) {
            await c.unlock(dto({ phone: "9845012345" }), {
                ...relay,
                clientHash: `ip${i}`,
            });
        }
        await prisma.downloadLead.deleteMany({});
        await expect(
            c.unlock(dto({ phone: "9845012345" }), {
                ...relay,
                clientHash: "ip9",
            }),
        ).rejects.toThrow("Too many");
        expect(await prisma.downloadLead.count()).toBe(0);
    });
});

describe("the retention sweep", () => {
    it("deletes a lead 12 months after its last request, keeps a newer one", async () => {
        const now = new Date();
        await ask({ phone: "9845012345" });
        await ask({ phone: "9845012346" });
        await prisma.downloadLead.updateMany({
            where: { phone: "+919845012345" },
            data: { lastRequestedAt: new Date(now.getTime() - 366 * DAY_MS) },
        });
        await expect(new WaitlistRetentionHandler().sweep(now)).resolves.toBe(
            1,
        );
        const left = await prisma.downloadLead.findMany();
        expect(left.map((l) => l.phone)).toEqual(["+919845012346"]);
    });
});
