/**
 * Overdue reminders, opt-in (automatic notices U20, DEC-174 D3, #1151)
 * against a real Postgres: with "Overdue reminders" on, an overdue invoice
 * is reminded through the business's own email 3 days and 10 days after
 * its due date in the business's time zone, and never after; each is
 * AUTO_REMINDED on its history and claimed once, so a sweep that runs
 * twice (or twice at once) sends once. Off, nothing. A reminder by hand or
 * a WhatsApp share in the last day moves the automatic one to a later run,
 * and it isn't counted. Paid, voided or credited (even between the read
 * and the send), an order's invoice, no provider, or outside 9 am to 8 pm:
 * nothing.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`. Only the
 * app env is stubbed (for the credential key and the renderer).
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

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesService } from "./invoices.service";
import { OVERDUE_REMIND_TYPE } from "./overdue-remind";
import { OverdueRemindHandler } from "./overdue-remind.handler";

const comms = new CommunicationsService();
const invoices = new InvoicesService(new InvoicePaymentsService());
const sending = new InvoiceSendService(invoices, comms);
const sweep = new OverdueRemindHandler(sending);

const DAY = 24 * 60 * 60 * 1000;
// 21 Oct 2026, 12:00 in India: inside the sending hours.
const NOW = new Date("2026-10-21T06:30:00.000Z");
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function business(
    opts: {
        on?: boolean | null;
        email?: boolean;
        zone?: string;
    } = {},
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("overdue") },
    });
    await giveBusinessDetails(org.id);
    await prisma.businessProfile.update({
        where: { organizationId: org.id },
        data: { timezone: opts.zone ?? "Asia/Kolkata" },
    });
    const ctx = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    if (opts.email !== false) {
        await comms.connectProvider(ctx, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
    }
    const on = opts.on === undefined ? true : opts.on;
    if (on !== null) {
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: org.id,
                kind: "OVERDUE_REMINDERS",
                enabled: on,
            },
        });
    }
    return ctx;
}

/** An issued invoice for ₹2,240, due `dueAt`. */
async function owed(
    ctx: OrganizationContext,
    dueAt: Date,
    extra: { orderId?: string; paidCents?: number; status?: string } = {},
): Promise<string> {
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            firstName: "Asha",
            email: `asha.${++n}@example.com`,
            phone: "+919800000001",
        },
    });
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number: uniq("RC"),
            status: extra.status ?? "ISSUED",
            currency: "INR",
            subtotal: "2240.00",
            total: "2240.00",
            paidCents: extra.paidCents ?? 0,
            contactId: contact.id,
            billToName: "Asha",
            billToEmail: contact.email,
            issuedAt: new Date(dueAt.getTime() - 7 * DAY),
            dueAt,
            orderId: extra.orderId ?? null,
            source: extra.orderId ? "ORDER" : "MANUAL",
        },
        select: { id: true },
    });
    return row.id;
}

const dueDaysBefore = (days: number) => new Date(NOW.getTime() - days * DAY);

const reminders = (invoiceId: string) =>
    prisma.message.findMany({
        where: { invoiceId, template: "INVOICE_REMINDER" },
        orderBy: { createdAt: "asc" },
    });

const autoReminded = (invoiceId: string) =>
    prisma.invoiceEvent.findMany({
        where: { invoiceId, kind: "AUTO_REMINDED" },
    });

/** Push every reminder of the invoice back a day, as if sent yesterday. */
async function aDayPasses(invoiceId: string) {
    const rows = await prisma.message.findMany({ where: { invoiceId } });
    for (const m of rows) {
        await prisma.message.update({
            where: { id: m.id },
            data: { createdAt: new Date(m.createdAt.getTime() - 2 * DAY) },
        });
    }
    const shares = await prisma.invoiceShare.findMany({ where: { invoiceId } });
    for (const s of shares) {
        await prisma.invoiceShare.update({
            where: { id: s.id },
            data: { createdAt: new Date(s.createdAt.getTime() - 2 * DAY) },
        });
    }
}

afterEach(() => jest.restoreAllMocks());

describe("overdue reminders, turned on", () => {
    it("reminds 3 days after the due date, again at 10, and never after", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(3));
        const org = rye.organizationId;

        expect((await sweep.runBusiness(org, NOW)).get(id)).toBe("SENT");
        const [first] = await reminders(id);
        expect(first).toMatchObject({
            status: "QUEUED",
            createdByUserId: null,
        });
        expect(first.body).toContain("₹2,240");
        const [event] = await autoReminded(id);
        expect(event).toMatchObject({
            actorKind: "JOB",
            actorUserId: null,
            channel: "EMAIL",
            messageId: first.id,
        });
        expect(
            await prisma.customerNotice.findFirst({
                where: {
                    organizationId: org,
                    eventKey: `invoice-overdue:${id}:1`,
                },
            }),
        ).toMatchObject({ kind: "INVOICE_OVERDUE", messageId: first.id });

        // Days 4 to 9: the first went, nothing more.
        await aDayPasses(id);
        for (const day of [1, 3, 6]) {
            expect((await sweep.runBusiness(org, later(day))).size).toBe(0);
        }
        // Day 10: the second.
        expect((await sweep.runBusiness(org, later(7))).get(id)).toBe("SENT");
        await aDayPasses(id);
        // Day 11 and day 17 on: never again.
        for (const day of [8, 14, 30]) {
            expect((await sweep.runBusiness(org, later(day))).size).toBe(0);
        }
        expect(await reminders(id)).toHaveLength(2);
        expect(await autoReminded(id)).toHaveLength(2);
    });

    it("not yet 3 days late: nothing", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(2));
        expect((await sweep.runBusiness(rye.organizationId, NOW)).size).toBe(0);
        expect(await reminders(id)).toHaveLength(0);
    });

    it("turned on late: the reminder whose week it is goes, once", async () => {
        const rye = await business();
        const five = await owed(rye, dueDaysBefore(5));
        const twelve = await owed(rye, dueDaysBefore(12));
        const old = await owed(rye, dueDaysBefore(20));
        const out = await sweep.runBusiness(rye.organizationId, NOW);
        expect(out.get(five)).toBe("SENT");
        expect(out.get(twelve)).toBe("SENT");
        expect(out.has(old)).toBe(false);
        expect(
            await prisma.customerNotice.count({
                where: { eventKey: `invoice-overdue:${twelve}:2` },
            }),
        ).toBe(1);
    });

    it("a run delivered twice, or two at once, sends once", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(3));
        const org = rye.organizationId;
        const [a, b] = await Promise.all([
            sweep.runBusiness(org, NOW),
            sweep.runBusiness(org, NOW),
        ]);
        expect([a.get(id), b.get(id)]).toContain("SENT");
        expect((await sweep.runBusiness(org, NOW)).size).toBe(0);
        expect(await reminders(id)).toHaveLength(1);
        expect(await autoReminded(id)).toHaveLength(1);
    });

    it("a partly paid invoice is reminded for what is left", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(3), { paidCents: 100_000 });
        expect((await sweep.runBusiness(rye.organizationId, NOW)).get(id)).toBe(
            "SENT",
        );
        const [message] = await reminders(id);
        expect(message.body).toContain("₹1,240");
    });
});

describe("the one-reminder-a-day rule", () => {
    it("reminded by hand this morning: the automatic one waits, uncounted, and goes once a day has passed", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(3));
        const org = rye.organizationId;
        await sending.remind(rye, id);

        expect((await sweep.runBusiness(org, NOW)).get(id)).toBe("WAIT");
        expect(
            await prisma.customerNotice.count({
                where: { organizationId: org },
            }),
        ).toBe(0);
        expect(await autoReminded(id)).toHaveLength(0);

        await aDayPasses(id);
        expect((await sweep.runBusiness(org, later(1))).get(id)).toBe("SENT");
        const events = await prisma.invoiceEvent.findMany({
            where: {
                invoiceId: id,
                kind: { in: ["REMINDED", "AUTO_REMINDED"] },
            },
            orderBy: { createdAt: "asc" },
        });
        expect(events.map((e) => e.kind)).toEqual([
            "REMINDED",
            "AUTO_REMINDED",
        ]);
    });

    it("a WhatsApp reminder today counts the same", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(3));
        await prisma.invoiceShare.create({
            data: {
                organizationId: rye.organizationId,
                invoiceId: id,
                channel: "WHATSAPP",
                kind: "REMINDER",
            },
        });
        expect((await sweep.runBusiness(rye.organizationId, NOW)).get(id)).toBe(
            "WAIT",
        );
        expect(await reminders(id)).toHaveLength(0);
    });
});

describe("nothing is sent", () => {
    it("when the business never turned it on, or turned it off", async () => {
        const never = await business({ on: null });
        const off = await business({ on: false });
        const a = await owed(never, dueDaysBefore(3));
        const b = await owed(off, dueDaysBefore(3));
        await sweep.sweep(NOW);
        expect(await reminders(a)).toHaveLength(0);
        expect(await reminders(b)).toHaveLength(0);
    });

    it("when it is turned off while the run is under way", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(3));
        const real = sending.remindAutomatic.bind(sending);
        jest.spyOn(sending, "remindAutomatic").mockImplementation(
            async (...args) => {
                await prisma.customerNoticeSetting.update({
                    where: {
                        organizationId_kind: {
                            organizationId: rye.organizationId,
                            kind: "OVERDUE_REMINDERS",
                        },
                    },
                    data: { enabled: false },
                });
                return real(...args);
            },
        );
        expect((await sweep.runBusiness(rye.organizationId, NOW)).get(id)).toBe(
            "OFF",
        );
        expect(await reminders(id)).toHaveLength(0);
    });

    it("when it was paid, voided or credited, even between the read and the send", async () => {
        const rye = await business();
        const paid = await owed(rye, dueDaysBefore(3), { status: "PAID" });
        const voided = await owed(rye, dueDaysBefore(3), { status: "VOID" });
        const credited = await owed(rye, dueDaysBefore(3), {
            status: "CREDITED",
        });
        const between = await owed(rye, dueDaysBefore(3));
        const real = sending.remindAutomatic.bind(sending);
        jest.spyOn(sending, "remindAutomatic").mockImplementation(
            async (...args) => {
                await prisma.invoice.update({
                    where: { id: between },
                    data: { status: "PAID", paidAt: new Date() },
                });
                return real(...args);
            },
        );
        const out = await sweep.runBusiness(rye.organizationId, NOW);
        expect(out.get(between)).toBe("NOT_OWED");
        for (const id of [paid, voided, credited])
            expect(out.has(id)).toBe(false);
        for (const id of [paid, voided, credited, between]) {
            expect(await reminders(id)).toHaveLength(0);
        }
        expect(
            await prisma.customerNotice.count({
                where: { organizationId: rye.organizationId },
            }),
        ).toBe(0);
    });

    it("for an order's invoice", async () => {
        const rye = await business();
        const store = await prisma.store.create({
            data: {
                organizationId: rye.organizationId,
                name: "Counter",
                slug: uniq("store"),
            },
        });
        const order = await prisma.order.create({
            data: {
                storeId: store.id,
                organizationId: rye.organizationId,
                orderId: uniq("ORD"),
                subtotal: "2240.00",
                total: "2240.00",
                currency: "INR",
            },
            select: { id: true },
        });
        const id = await owed(rye, dueDaysBefore(3), { orderId: order.id });
        expect((await sweep.runBusiness(rye.organizationId, NOW)).size).toBe(0);
        expect(await reminders(id)).toHaveLength(0);
    });

    it("with no email provider of its own: never from Saroh's address, nothing claimed, and tried again later", async () => {
        const rye = await business({ email: false });
        const id = await owed(rye, dueDaysBefore(3));
        expect((await sweep.runBusiness(rye.organizationId, NOW)).get(id)).toBe(
            "REFUSED",
        );
        expect(await prisma.message.count({ where: { invoiceId: id } })).toBe(
            0,
        );
        expect(
            await prisma.customerNotice.count({
                where: { organizationId: rye.organizationId },
            }),
        ).toBe(0);
        // Quietly: the history isn't filled with a failure every hour.
        expect(
            await prisma.invoiceEvent.count({
                where: { invoiceId: id, kind: "SEND_FAILED" },
            }),
        ).toBe(0);
    });

    it("outside 9 am to 8 pm in the business's time zone", async () => {
        const rye = await business();
        const id = await owed(rye, dueDaysBefore(3));
        // 22:00 and 03:00 in India.
        for (const at of [
            "2026-10-21T16:30:00.000Z",
            "2026-10-20T21:30:00.000Z",
        ]) {
            expect(
                (await sweep.runBusiness(rye.organizationId, new Date(at)))
                    .size,
            ).toBe(0);
        }
        expect(await reminders(id)).toHaveLength(0);
    });
});

it("two businesses in different zones are each reminded on their own day", async () => {
    const india = await business({ zone: "Asia/Kolkata" });
    const london = await business({ zone: "Europe/London" });
    // 18 Oct 20:00 UTC: 19 Oct in India, 18 Oct in London.
    const due = new Date("2026-10-18T20:00:00.000Z");
    const inIndia = await owed(india, due);
    const inLondon = await owed(london, due);
    // 21 Oct: 15:30 in India (2 days late), 11:00 in London (3 days late).
    const at = new Date("2026-10-21T10:00:00.000Z");
    await sweep.sweep(at);
    expect(await reminders(inIndia)).toHaveLength(0);
    expect(await reminders(inLondon)).toHaveLength(1);
    // The next day, India's turn.
    await sweep.sweep(new Date(at.getTime() + DAY));
    expect(await reminders(inIndia)).toHaveLength(1);
    expect(await reminders(inLondon)).toHaveLength(1);
});

describe("the chain", () => {
    it("keeps one waiting run, and the run leaves the next", async () => {
        await prisma.job.deleteMany({ where: { type: OVERDUE_REMIND_TYPE } });
        await Promise.all([sweep.schedule(NOW), sweep.schedule(NOW)]);
        await sweep.ensureScheduled(NOW);
        const waiting = await prisma.job.findMany({
            where: { type: OVERDUE_REMIND_TYPE, status: "PENDING" },
        });
        expect(waiting).toHaveLength(1);
        await prisma.job.update({
            where: { id: waiting[0].id },
            data: { status: "DONE" },
        });
        await sweep.handle(waiting[0]);
        const next = await prisma.job.findMany({
            where: { type: OVERDUE_REMIND_TYPE, status: "PENDING" },
        });
        expect(next).toHaveLength(1);
        expect(next[0].runAt.getTime()).toBeGreaterThan(
            Date.now() + 50 * 60 * 1000,
        );
    });
});
