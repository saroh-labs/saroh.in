/**
 * A failed autopay charge tells the customer (automatic notices U10,
 * DEC-174 R3), against a real Postgres with the fake payment, webhook and
 * email providers: a decline writes RENEWAL_FAILED and the team's alert as
 * before, and queues `customer.notify` AUTOPAY_FAILED, whose email, through
 * the business's own provider, says "We couldn't take ₹1,200.00 for ‹plan›"
 * with a fresh pay link that works (minted as it goes, DEC-110; never
 * stored). With the switch off, only the team hears. An invoice paid
 * before the notice runs tells nobody, and a charge that stood aside for
 * the customer's own checkout isn't a failure to tell.
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

import { prisma } from "@saroh/database";

import { renewalHarness } from "../../../test/fixtures/renewal-notices";
import { SECRET_LINK_SLOT } from "../communications/transactional";
import { hashPayToken } from "../invoices/pay-token";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import { enqueueAutopayFailedNotice } from "../site-accounts/notices/autopay-failed";
import { failMandateChargeInTx } from "./mandate-charge-outcome";

const h = renewalHarness();

beforeEach(() => h.reset());

const noticeJobs = (organizationId: string, invoiceId: string) =>
    h.jobsAbout(organizationId, CUSTOMER_NOTIFY_TYPE, invoiceId);

const teamAlerts = (organizationId: string, paymentIntentId: string) =>
    prisma.job.count({
        where: {
            organizationId,
            type: "team.alert",
            payload: { path: ["paymentIntentId"], equals: paymentIntentId },
        },
    });

/** A member's renewal, charged by autopay as far as the bank, then declined. */
async function declined(opts: { switchOff?: boolean } = {}) {
    const biz = await h.business();
    const org = biz.owner.organizationId;
    if (opts.switchOff) {
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: org,
                kind: "AUTOPAY_FAILED",
                enabled: false,
            },
        });
    }
    const who = await h.autopayMember(biz);
    const { invoice } = await h.renew(who);
    const { intentId, orderId } = await h.chargeToBank(biz, invoice!.id);
    h.fake.answerCharge(orderId, "FAILED");
    await h.webhook(biz.owner, {
        eventType: "payment.failed",
        outcome: "FAILED",
        providerIntentId: orderId,
    });
    return { biz, org, who, invoiceId: invoice!.id, intentId };
}

describe("a failed autopay charge (U10)", () => {
    it("tells the team as before, and the customer by email with a pay link that works", async () => {
        const { org, who, invoiceId, intentId } = await declined();
        expect(
            await prisma.subscriptionEvent.findFirst({
                where: {
                    subscriptionId: who.subscriptionId,
                    kind: "RENEWAL_FAILED",
                },
            }),
        ).toMatchObject({ data: { reason: "DECLINED" } });
        expect(await teamAlerts(org, intentId)).toBe(1);

        const [job] = await noticeJobs(org, invoiceId);
        expect(job?.payload).toEqual({
            kind: "AUTOPAY_FAILED",
            eventKey: `autopay-failed:${intentId}`,
            invoiceId,
        });
        const before = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        await h.runJob(job!, h.notices.handle);

        const message = await prisma.message.findFirstOrThrow({
            where: { organizationId: org, template: "AUTOPAY_FAILED" },
            orderBy: { createdAt: "desc" },
        });
        expect(message).toMatchObject({
            status: "QUEUED",
            invoiceId,
            contactId: who.contactId,
            createdByUserId: null,
        });
        expect(message.subject).toMatch(/^We couldn't take your payment for /);
        expect(message.body).toContain("We couldn&#39;t take ₹1,200");
        expect(message.body).toContain("Pay it by UPI or card here:");
        // The token is never stored: the body holds the slot.
        expect(message.body).toContain(SECRET_LINK_SLOT);

        await h.deliverEmails(org);
        const sentBody = h.email.calls.at(-1)?.body ?? "";
        const token = /https:\/\/saroh\.app\/pay\/([A-Za-z0-9_-]{43})/.exec(
            sentBody,
        )?.[1];
        expect(token).toBeDefined();
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        // A fresh link: the one shared before stops (DEC-110).
        expect(after.payTokenHash).toBe(hashPayToken(token!));
        expect(after.payTokenHash).not.toBe(before.payTokenHash);

        // On the subscription's history and the invoice's.
        expect(
            await prisma.subscriptionEvent.findFirst({
                where: {
                    subscriptionId: who.subscriptionId,
                    kind: "PAY_LINK_EMAILED",
                },
            }),
        ).toMatchObject({
            actorKind: "JOB",
            invoiceId,
            data: { reason: "AUTOPAY_FAILED" },
        });
        expect(
            await prisma.invoiceEvent.count({
                where: { invoiceId, kind: "LINK_MADE", actorKind: "JOB" },
            }),
        ).toBe(1);

        // Once per charge: run again, nothing more.
        await h.notices.handle(job!);
        expect(
            await prisma.message.count({
                where: { organizationId: org, template: "AUTOPAY_FAILED" },
            }),
        ).toBe(1);
    });

    it("with the switch off: the team is told, the customer isn't", async () => {
        const { org, invoiceId, intentId } = await declined({
            switchOff: true,
        });
        expect(await teamAlerts(org, intentId)).toBe(1);
        expect(await noticeJobs(org, invoiceId)).toHaveLength(0);
    });

    it("paid before the notice ran: nobody is told", async () => {
        const { org, invoiceId } = await declined();
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "PAID", paidAt: new Date() },
        });
        const [job] = await noticeJobs(org, invoiceId);
        await h.runJob(job!, h.notices.handle);
        expect(
            await prisma.message.count({
                where: { organizationId: org, template: "AUTOPAY_FAILED" },
            }),
        ).toBe(0);
    });

    it("a customer who turned email off: suppressed, and the link already shared still works", async () => {
        const { biz, org, who, invoiceId } = await declined();
        await h.comms.setConsent(biz.owner, {
            contactId: who.contactId,
            channel: "EMAIL",
            status: "REVOKED",
        });
        const before = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        const [job] = await noticeJobs(org, invoiceId);
        await h.runJob(job!, h.notices.handle);
        expect(
            await prisma.message.findFirst({
                where: { organizationId: org, template: "AUTOPAY_FAILED" },
            }),
        ).toMatchObject({ status: "SUPPRESSED" });
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        expect(after.payTokenHash).toBe(before.payTokenHash);
        expect(
            await prisma.subscriptionEvent.count({
                where: {
                    subscriptionId: who.subscriptionId,
                    kind: "PAY_LINK_EMAILED",
                },
            }),
        ).toBe(0);
    });

    it("a give-up by the charge job (the notice never delivered) tells them too, once", async () => {
        const biz = await h.business();
        const org = biz.owner.organizationId;
        const who = await h.autopayMember(biz);
        const { invoice } = await h.renew(who);
        // The renewal's own charge, given up on before its debit.
        const intent = await prisma.paymentIntent.findFirstOrThrow({
            where: { invoiceId: invoice!.id, viaMandateId: { not: null } },
        });
        await prisma.$transaction((tx) =>
            failMandateChargeInTx(tx, org, intent.id, "NOTICE_NOT_DELIVERED"),
        );
        // A second failure of the same charge moves nothing and tells nobody.
        await prisma.$transaction((tx) =>
            failMandateChargeInTx(tx, org, intent.id, "NOTICE_NOT_DELIVERED"),
        );
        const jobs = await noticeJobs(org, invoice!.id);
        expect(jobs.map((j) => j.payload)).toEqual([
            expect.objectContaining({
                eventKey: `autopay-failed:${intent.id}`,
            }),
        ]);
    });

    it("only a decline is told: standing aside for a checkout, or a capture at the wrong amount, isn't", async () => {
        const biz = await h.business();
        const org = biz.owner.organizationId;
        for (const reason of ["CHECKOUT_OPEN", "AMOUNT_MISMATCH"]) {
            expect(
                await prisma.$transaction((tx) =>
                    enqueueAutopayFailedNotice(tx, org, {
                        invoiceId: "inv_x",
                        paymentIntentId: `pi_${reason}`,
                        reason,
                    }),
                ),
            ).toBe(false);
        }
        expect(
            await prisma.job.count({
                where: { organizationId: org, type: CUSTOMER_NOTIFY_TYPE },
            }),
        ).toBe(0);
    });
});
