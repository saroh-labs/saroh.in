/**
 * `invoice.auto-send` (automatic notices U10, DEC-174 R3) against a real
 * Postgres: a renewal's invoice is emailed by the business's own provider
 * with its PDF and a working pay link, the history says Saroh sent it
 * (AUTO_SENT, actor JOB), and a Send by hand afterwards says it was
 * already sent. It sends nothing for an invoice paid at the desk, voided
 * or under an autopay charge since, or with the switch turned off; and a
 * send that can't go (no provider, no address) is written on the history
 * with why, never thrown. A hand-made invoice is never sent by it.
 *
 * Only the app env is stubbed (for the credential key and the renderer).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { renewalHarness } from "../../../test/fixtures/renewal-notices";
import { SECRET_LINK_SLOT } from "../communications/transactional";
import { INVOICE_AUTO_SEND_TYPE } from "./invoice-auto-send";
import { hashPayToken } from "./pay-token";

const h = renewalHarness();

beforeEach(() => h.reset());

/** A member's renewal, issued, and its one waiting send. */
async function renewed(opts: { email?: boolean } = {}) {
    const biz = await h.business(opts);
    const who = await h.member(biz);
    const { invoice } = await h.renew(who);
    const org = biz.owner.organizationId;
    const [job] = await h.jobsAbout(org, INVOICE_AUTO_SEND_TYPE, invoice!.id);
    expect(job).toBeDefined();
    return { biz, who, org, invoiceId: invoice!.id, job: job! };
}

const run = (org: string, invoiceId: string) =>
    h.autoSend.run(org, { invoiceId, reason: "RENEWAL" }, h.clock.now);

const eventsOf = (invoiceId: string) =>
    prisma.invoiceEvent.findMany({
        where: { invoiceId },
        orderBy: { createdAt: "asc" },
    });

describe("a renewal's invoice, sent by Saroh", () => {
    it("is emailed with its PDF and a working pay link; the history says automatically; a Send by hand is refused", async () => {
        const { biz, org, invoiceId, job } = await renewed();
        await h.runJob(job, h.autoSend.handle);

        const message = await prisma.message.findFirstOrThrow({
            where: { organizationId: org, invoiceId, template: "INVOICE_SENT" },
        });
        expect(message.status).toBe("QUEUED");
        expect(message.createdByUserId).toBeNull();
        expect(message.body).toContain(SECRET_LINK_SLOT);
        expect(message.body).toContain("₹1,200");
        const [send] = await prisma.job.findMany({
            where: {
                organizationId: org,
                type: "message.send",
                payload: { path: ["messageId"], equals: message.id },
            },
        });
        // Its PDF goes with it (DEC-083).
        expect(send.payload).toMatchObject({ attach: expect.anything() });

        await h.deliverEmails(org);
        const sentBody = h.email.calls.at(-1)?.body ?? "";
        const token = /https:\/\/saroh\.app\/pay\/([A-Za-z0-9_-]{43})/.exec(
            sentBody,
        )?.[1];
        expect(token).toBeDefined();
        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        expect(invoice.payTokenHash).toBe(hashPayToken(token!));

        const events = await eventsOf(invoiceId);
        expect(events.map((e) => e.kind)).toEqual(["ISSUED", "AUTO_SENT"]);
        expect(events[1]).toMatchObject({
            actorKind: "JOB",
            actorUserId: null,
            channel: "EMAIL",
            messageId: message.id,
        });

        // A Send by hand now: already sent.
        await expect(h.sending.send(biz.owner, invoiceId)).rejects.toThrow(
            new ConflictException(
                "This invoice has been sent. Send a reminder instead.",
            ),
        );
        const read = await h.sending.readFor(org, invoiceId);
        expect(read.sent).toEqual([
            expect.objectContaining({ reminder: false, status: "SENT" }),
        ]);
    });

    it("a job delivered twice sends once", async () => {
        const { org, invoiceId } = await renewed();
        expect(await run(org, invoiceId)).toBe("SENT");
        expect(await run(org, invoiceId)).toBe("ALREADY_SENT");
        expect(
            await prisma.message.count({
                where: { invoiceId, template: "INVOICE_SENT" },
            }),
        ).toBe(1);
    });

    it("sent by hand before it ran: nothing more", async () => {
        const { biz, org, invoiceId } = await renewed();
        await h.sending.send(biz.owner, invoiceId);
        expect(await run(org, invoiceId)).toBe("ALREADY_SENT");
        expect((await eventsOf(invoiceId)).map((e) => e.kind)).toEqual([
            "ISSUED",
            "SENT",
        ]);
    });

    it("paid at the desk before it ran: nothing is sent", async () => {
        const { org, invoiceId } = await renewed();
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "PAID", paidAt: new Date() },
        });
        expect(await run(org, invoiceId)).toBe("NOT_OWED");
        expect(await prisma.message.count({ where: { invoiceId } })).toBe(0);
        expect((await eventsOf(invoiceId)).map((e) => e.kind)).toEqual([
            "ISSUED",
        ]);
    });

    it("the switch turned off after it was queued: nothing is sent", async () => {
        const { org, invoiceId } = await renewed();
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: org,
                kind: "RENEWAL_INVOICE",
                enabled: false,
            },
        });
        expect(await run(org, invoiceId)).toBe("OFF");
        expect(await prisma.message.count({ where: { invoiceId } })).toBe(0);
    });

    it("no email provider and no account thread: written on the history as not sent, with why, and never thrown", async () => {
        const { org, invoiceId, job } = await renewed({ email: false });
        await expect(h.runJob(job, h.autoSend.handle)).resolves.toBeUndefined();
        expect(await prisma.message.count({ where: { invoiceId } })).toBe(0);
        const failed = (await eventsOf(invoiceId)).find(
            (e) => e.kind === "SEND_FAILED",
        );
        expect(failed).toMatchObject({
            actorKind: "JOB",
            data: { reason: "NO_EMAIL_PROVIDER", template: "INVOICE_SENT" },
        });
        // The team can still send it by hand once they connect one.
        expect((await h.sending.readFor(org, invoiceId)).send.reason).toBe(
            "NO_EMAIL_PROVIDER",
        );
    });

    it("no address to send to: written on the history as not sent", async () => {
        const { org, invoiceId } = await renewed();
        // A walk-in kept no email, and has no site account.
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { billToEmail: null },
        });
        expect(await run(org, invoiceId)).toBe("REFUSED");
        expect(
            (await eventsOf(invoiceId)).find((e) => e.kind === "SEND_FAILED")
                ?.data,
        ).toMatchObject({ reason: "NO_EMAIL_ADDRESS" });
    });

    it("an invoice made by hand is never sent by it", async () => {
        const biz = await h.business();
        const who = await h.member(biz);
        const draft = await h.invoices.createDraft(biz.owner, {
            contactId: who.contactId,
            currency: "INR",
            lines: [{ description: "Mat", quantity: 1, unitPrice: "500" }],
        });
        await h.invoices.issue(biz.owner, draft.id);
        const org = biz.owner.organizationId;
        expect(
            await h.jobsAbout(org, INVOICE_AUTO_SEND_TYPE, draft.id),
        ).toHaveLength(0);
        expect(await run(org, draft.id)).toBe("SKIPPED");
        expect(
            await prisma.message.count({ where: { invoiceId: draft.id } }),
        ).toBe(0);
    });

    it("under an autopay charge: left to the charge, and its receipt", async () => {
        const biz = await h.business();
        const who = await h.autopayMember(biz);
        const { invoice } = await h.renew(who);
        const org = biz.owner.organizationId;
        expect(await run(org, invoice!.id)).toBe("AUTOPAY");
        expect(
            await prisma.message.count({ where: { invoiceId: invoice!.id } }),
        ).toBe(0);
    });
});
