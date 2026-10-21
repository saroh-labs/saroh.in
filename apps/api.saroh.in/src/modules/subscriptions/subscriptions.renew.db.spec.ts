/**
 * A renewal's invoice is sent without anyone pressing Send (automatic
 * notices U10, DEC-174 R3), against a real Postgres with the fake payment
 * and email providers: the renewal queues `invoice.auto-send` on its own
 * transaction unless live autopay will charge it, and only while the
 * business's "Renewal invoices" switch is on; an early renewal (charged on
 * the renewal date) that autopay won't take is sent on its early day.
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
import { INVOICE_AUTO_SEND_TYPE } from "../invoices/invoice-auto-send";

const h = renewalHarness();

beforeEach(() => h.reset());

const sendJobs = (organizationId: string, invoiceId: string) =>
    h.jobsAbout(organizationId, INVOICE_AUTO_SEND_TYPE, invoiceId);

describe("a renewal's invoice is sent automatically (U10)", () => {
    it("with no autopay: queued on the renewal, for the renewal day", async () => {
        const biz = await h.business();
        const who = await h.member(biz);
        const { outcome, invoice } = await h.renew(who);
        expect(outcome).toBe("renewed");
        expect(invoice).toMatchObject({
            status: "ISSUED",
            source: "SUBSCRIPTION",
        });
        const jobs = await sendJobs(biz.owner.organizationId, invoice!.id);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].payload).toEqual({
            invoiceId: invoice!.id,
            reason: "RENEWAL",
        });
        expect(jobs[0].runAt.getTime()).toBe(h.clock.now.getTime());
    });

    it("with the switch off: issued, not sent, and nothing queued", async () => {
        const biz = await h.business();
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: biz.owner.organizationId,
                kind: "RENEWAL_INVOICE",
                enabled: false,
            },
        });
        const who = await h.member(biz);
        const { invoice } = await h.renew(who);
        expect(invoice?.status).toBe("ISSUED");
        expect(
            await sendJobs(biz.owner.organizationId, invoice!.id),
        ).toHaveLength(0);
    });

    it("with live autopay: not sent as a request to pay; the charge is queued instead", async () => {
        const biz = await h.business();
        const who = await h.autopayMember(biz);
        const { invoice } = await h.renew(who);
        const org = biz.owner.organizationId;
        expect(await sendJobs(org, invoice!.id)).toHaveLength(0);
        expect(
            await h.jobsAbout(org, "subscription.charge", invoice!.id),
        ).toHaveLength(1);
    });

    it("above the autopay limit: not charged, so it is sent", async () => {
        const biz = await h.business();
        const who = await h.autopayMember(biz, 50_000);
        const { invoice } = await h.renew(who);
        const org = biz.owner.organizationId;
        expect(
            await prisma.subscriptionEvent.count({
                where: {
                    subscriptionId: who.subscriptionId,
                    kind: "MANDATE_LIMIT_LOW",
                },
            }),
        ).toBe(1);
        expect(await sendJobs(org, invoice!.id)).toHaveLength(1);
    });

    it("a renewal run twice queues one send: the second run finds the period renewed", async () => {
        const biz = await h.business();
        const who = await h.member(biz);
        const { invoice } = await h.renew(who);
        expect(
            await h.subscriptions.renewOne(who.subscriptionId, h.clock.now),
        ).toBe("skipped");
        expect(
            await sendJobs(biz.owner.organizationId, invoice!.id),
        ).toHaveLength(1);
    });
});

describe("the early renewal, charged on the renewal date (D13B)", () => {
    it("with autopay to take it: issued early, and not sent", async () => {
        const biz = await h.business();
        await h.setTiming(biz, "ON_RENEWAL_DATE");
        const who = await h.autopayMember(biz);
        expect(await h.earlyPass(who.renewal)).toBe(1);
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: {
                subscriptionId: who.subscriptionId,
                periodStart: who.renewal,
            },
        });
        expect(
            await sendJobs(biz.owner.organizationId, invoice.id),
        ).toHaveLength(0);
    });

    it("above the autopay limit: sent on its early day", async () => {
        const biz = await h.business();
        await h.setTiming(biz, "ON_RENEWAL_DATE");
        const who = await h.autopayMember(biz, 50_000);
        expect(await h.earlyPass(who.renewal)).toBe(1);
        const issuedOn = h.clock.now;
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: {
                subscriptionId: who.subscriptionId,
                periodStart: who.renewal,
            },
        });
        const [job] = await sendJobs(biz.owner.organizationId, invoice.id);
        expect(job?.runAt.getTime()).toBe(issuedOn.getTime());
        expect(job!.runAt.getTime()).toBeLessThan(who.renewal.getTime());

        // The renewal date finds it live: no second invoice, no second send.
        expect((await h.renew(who)).outcome).toBe("advanced");
        expect(
            await sendJobs(biz.owner.organizationId, invoice.id),
        ).toHaveLength(1);
    });
});
