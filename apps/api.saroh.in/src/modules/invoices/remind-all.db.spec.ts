/**
 * Remind all on Home's unpaid bills (DEC-171, Home plan U8, #1085) against
 * a real Postgres, through Remind many (`POST invoices/reminders/preview`
 * and `POST invoices/reminders`, U5 #1117) with `quietDays: 3`: Home hands
 * it the overdue bills (`overdueBillIds`), the preview says who gets a
 * reminder and who waits (reminded in the last 3 days, by email, the
 * account thread or WhatsApp) or can't be reached, with the words they
 * get; the send reads every bill again, so a bill reminded elsewhere while
 * the ten seconds ran, or paid meanwhile, is not sent and is named. A
 * role without `invoice:write` is refused; amounts and the words need
 * `payment:read`; one business's bills are never reminded from another.
 *
 * Only the app env is stubbed; the email provider is the network-free
 * fake. Runs in the integration project, plain and under `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { overdueInvoices } from "../home/home-money-sources";
import type { OrgAction } from "../organizations/organization-policy";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { InvoiceSendService } from "./invoice-send.service";
import { BulkRemindersDto } from "./invoice-share.dto";
import { InvoicesService } from "./invoices.service";
import { overdueBillIds, REMIND_ALL_QUIET_DAYS } from "./overdue-bills";

const comms = new CommunicationsService();
const invoices = new InvoicesService(new InvoicePaymentsService());
const sending = new InvoiceSendService(invoices, comms);
const reminders = new InvoiceRemindersService(sending);

/** What Home's Remind all asks: its overdue bills, waiting 3 days. */
async function ask(ctx: OrganizationContext, ids?: string[]) {
    return {
        invoiceIds:
            ids ??
            (await overdueBillIds(prisma, ctx.organizationId, new Date())),
        quietDays: REMIND_ALL_QUIET_DAYS,
    };
}
const ways = (rows: { invoiceId: string; way: string }[], way: string) =>
    rows.filter((r) => r.way === way).map((r) => r.invoiceId);

const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function business(
    name: string,
    email = true,
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("remind-all") },
    });
    await giveBusinessDetails(org.id);
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    if (email) {
        await comms.connectProvider(owner, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
    }
    return owner;
}

/** An issued bill to a new contact, `late` days past its due date. */
async function overdue(
    ctx: OrganizationContext,
    who: {
        first: string;
        last: string;
        email: string | null;
        phone?: string;
    },
    late: number,
    amount = "480",
): Promise<string> {
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            firstName: who.first,
            lastName: who.last,
            email: who.email ?? `${who.first.toLowerCase()}@example.com`,
            phone: who.phone ?? null,
        },
    });
    const draft = await invoices.createDraft(ctx, {
        contactId: contact.id,
        currency: "INR",
        lines: [
            { description: "Trade loaves", quantity: 1, unitPrice: amount },
        ],
    });
    await invoices.issue(ctx, draft.id);
    await prisma.invoice.update({
        where: { id: draft.id },
        data: {
            dueAt: new Date(Date.now() - late * DAY),
            // No email on the bill: nothing to reach them by.
            ...(who.email ? {} : { billToEmail: null }),
        },
    });
    return draft.id;
}

/** A reminder that went `daysAgo` days ago, as the per-bill remind writes. */
async function remindedAgo(
    ctx: OrganizationContext,
    invoiceId: string,
    daysAgo: number,
): Promise<void> {
    await prisma.message.create({
        data: {
            organizationId: ctx.organizationId,
            channel: "EMAIL",
            toAddress: "someone@example.com",
            subject: "Reminder",
            body: "Reminder",
            status: "SENT",
            invoiceId,
            template: "INVOICE_REMINDER",
            createdAt: new Date(Date.now() - daysAgo * DAY - 60_000),
        },
    });
}

async function sentFor(invoiceId: string): Promise<number> {
    return prisma.message.count({
        where: {
            invoiceId,
            template: "INVOICE_REMINDER",
            status: { in: ["QUEUED", "SENT"] },
        },
    });
}

function withOnly(
    ctx: OrganizationContext,
    actions: OrgAction[],
): OrganizationContext {
    return { ...ctx, role: "MEMBER", actions: new Set(actions) };
}

const PEOPLE = [
    ["Shruti", "Menon"],
    ["Priya", "Raman"],
    ["Vivek", "Nair"],
    ["Isha", "Kulkarni"],
    ["Tara", "Pillai"],
    ["Om", "Prakash"],
    ["Lata", "Iyer"],
    ["Arjun", "Mehta"],
    ["Meera", "Nair"],
    ["Kiran", "Rao"],
] as const;

describe("Remind all (real database)", () => {
    it("10 overdue, 3 reminded 2 days ago: 7 go, 3 wait and are named", async () => {
        const rye = await business("Rye & Co.");
        const ids: string[] = [];
        for (const [i, [first, last]] of PEOPLE.entries()) {
            ids.push(
                await overdue(
                    rye,
                    {
                        first,
                        last,
                        email: `${first.toLowerCase()}@example.com`,
                    },
                    30 - i,
                ),
            );
        }
        for (const id of ids.slice(7)) await remindedAgo(rye, id, 2);

        // Home's bills: all ten, oldest due first.
        const picked = await ask(rye);
        expect(picked.invoiceIds).toEqual(ids);

        const preview = await reminders.preview(rye, picked);
        expect(ways(preview.invoices, "EMAIL")).toEqual(ids.slice(0, 7));
        expect(preview.invoices[0]).toMatchObject({
            invoiceId: ids[0],
            name: "Shruti Menon",
            leftToPay: "480.00",
            email: "shruti@example.com",
        });
        expect(preview.invoices[0].lateDays).toBeGreaterThanOrEqual(29);
        const waiting = preview.invoices.filter((r) => r.way === "WAIT");
        expect(waiting.map((r) => r.invoiceId)).toEqual(ids.slice(7));
        expect(waiting[0]).toMatchObject({
            reason: "REMINDED_RECENTLY",
            lastWords: "Reminded 2 days ago",
        });
        // The next can go once the 3 days are up.
        expect(new Date(waiting[0].retryAt ?? 0).getTime()).toBeGreaterThan(
            Date.now(),
        );
        // The words the first of them gets: the reminder email's own.
        expect(preview.message).toContain("Hi Shruti,");
        expect(preview.message).toContain("₹480");
        expect(preview.message).toContain("[their own link]");

        const res = await reminders.send(
            rye,
            await ask(rye, ways(preview.invoices, "EMAIL")),
        );
        expect(res.invoices.map((r) => r.outcome)).toEqual(
            Array(7).fill("EMAILED"),
        );
        for (const id of ids.slice(0, 7)) expect(await sentFor(id)).toBe(1);
        // The three reminded 2 days ago got nothing new.
        for (const id of ids.slice(7)) expect(await sentFor(id)).toBe(1);

        // Sent now, so the next Remind all waits all ten, and has no words.
        const again = await reminders.preview(rye, await ask(rye));
        expect(ways(again.invoices, "WAIT")).toHaveLength(10);
        expect(again.message).toBeNull();
    });

    it("a bill reminded 4 days ago goes again; one reminded today waits", async () => {
        const rye = await business("Rye four days");
        const old = await overdue(
            rye,
            { first: "Tara", last: "Pillai", email: "tara@example.com" },
            12,
        );
        const today = await overdue(
            rye,
            { first: "Om", last: "Prakash", email: "om@example.com" },
            12,
        );
        await remindedAgo(rye, old, 4);
        await remindedAgo(rye, today, 0);
        const preview = await reminders.preview(rye, await ask(rye));
        expect(ways(preview.invoices, "EMAIL")).toEqual([old]);
        expect(
            preview.invoices.find((r) => r.invoiceId === today),
        ).toMatchObject({
            way: "WAIT",
            reason: "REMINDED_TODAY",
            lastWords: "Reminded today",
        });
    });

    it("without quietDays, one reminded 2 days ago goes: one a day, as before", async () => {
        const rye = await business("Rye one a day");
        const id = await overdue(
            rye,
            { first: "Lata", last: "Iyer", email: "lata@example.com" },
            9,
        );
        await remindedAgo(rye, id, 2);
        const preview = await reminders.preview(rye, { invoiceIds: [id] });
        expect(preview.invoices[0]).toMatchObject({ way: "EMAIL" });
        expect(preview.invoices[0].lastWords).toBeUndefined();
    });

    it("a WhatsApp reminder 2 days ago counts as heard from", async () => {
        const rye = await business("Rye WhatsApp heard");
        const id = await overdue(
            rye,
            { first: "Kiran", last: "Rao", email: "kiran@example.com" },
            9,
        );
        await prisma.invoiceShare.create({
            data: {
                organizationId: rye.organizationId,
                invoiceId: id,
                channel: "WHATSAPP",
                kind: "REMINDER",
                createdAt: new Date(Date.now() - 2 * DAY - 60_000),
            },
        });
        const preview = await reminders.preview(rye, await ask(rye));
        expect(preview.invoices[0]).toMatchObject({
            way: "WAIT",
            reason: "REMINDED_RECENTLY",
            lastWords: "Reminded 2 days ago",
        });
    });

    it("a reminder sent elsewhere during the hold is not sent twice", async () => {
        const rye = await business("Rye during the hold");
        const a = await overdue(
            rye,
            { first: "Vivek", last: "Nair", email: "vivek@example.com" },
            10,
        );
        const b = await overdue(
            rye,
            { first: "Isha", last: "Kulkarni", email: "isha@example.com" },
            8,
        );
        const preview = await reminders.preview(rye, await ask(rye));
        expect(ways(preview.invoices, "EMAIL")).toEqual([a, b]);

        // Someone sends Vivek's reminder from the invoice in the ten seconds.
        await sending.remind(rye, a);

        const res = await reminders.send(rye, await ask(rye, [a, b]));
        expect(res.invoices).toEqual([
            expect.objectContaining({
                invoiceId: a,
                name: "Vivek Nair",
                way: "WAIT",
                outcome: "NOT_SENT",
            }),
            expect.objectContaining({ invoiceId: b, outcome: "EMAILED" }),
        ]);
        expect(await sentFor(a)).toBe(1);
    });

    it("a bill paid during the hold is not sent", async () => {
        const rye = await business("Rye paid meanwhile");
        const id = await overdue(
            rye,
            { first: "Lata", last: "Iyer", email: "lata@example.com" },
            6,
        );
        await prisma.invoice.update({
            where: { id },
            data: { status: "PAID", paidAt: new Date() },
        });
        const res = await reminders.send(rye, await ask(rye, [id]));
        expect(res.invoices).toEqual([
            expect.objectContaining({
                invoiceId: id,
                way: "NONE",
                reason: "PAID",
                outcome: "NOT_SENT",
            }),
        ]);
        expect(await sentFor(id)).toBe(0);
    });

    it("no email: named, with a phone for WhatsApp or none, and never emailed", async () => {
        const rye = await business("Rye no email");
        const reachable = await overdue(
            rye,
            { first: "Priya", last: "Raman", email: "priya@example.com" },
            13,
        );
        const unreachable = await overdue(
            rye,
            { first: "Rahul", last: "Bose", email: null },
            11,
        );
        const phoneOnly = await overdue(
            rye,
            {
                first: "Dev",
                last: "Shah",
                email: null,
                phone: "+919800000001",
            },
            9,
        );
        const preview = await reminders.preview(rye, await ask(rye));
        expect(ways(preview.invoices, "EMAIL")).toEqual([reachable]);
        expect(
            preview.invoices.find((r) => r.invoiceId === unreachable),
        ).toMatchObject({
            name: "Rahul Bose",
            way: "NONE",
            reason: "UNREACHABLE",
        });
        expect(
            preview.invoices.find((r) => r.invoiceId === phoneOnly),
        ).toMatchObject({ way: "WHATSAPP", phone: "+919800000001" });

        const res = await reminders.send(
            rye,
            await ask(rye, [reachable, unreachable, phoneOnly]),
        );
        expect(
            res.invoices
                .filter((r) => r.outcome === "EMAILED")
                .map((r) => r.invoiceId),
        ).toEqual([reachable]);
        expect(await sentFor(unreachable)).toBe(0);
        expect(await sentFor(phoneOnly)).toBe(0);
    });

    it("a role without invoice:write is refused, preview and send", async () => {
        const rye = await business("Rye member");
        const id = await overdue(
            rye,
            { first: "Kiran", last: "Rao", email: "kiran@example.com" },
            4,
        );
        const member = withOnly(rye, ["invoice:read", "payment:read"]);
        await expect(
            reminders.preview(member, await ask(rye, [id])),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            reminders.send(member, await ask(rye, [id])),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await sentFor(id)).toBe(0);
    });

    it("without payment:read the list has no amounts and no words", async () => {
        const rye = await business("Rye no money");
        const id = await overdue(
            rye,
            { first: "Meera", last: "Nair", email: "meera@example.com" },
            4,
        );
        const writer = withOnly(rye, ["invoice:read", "invoice:write"]);
        const preview = await reminders.preview(writer, await ask(rye, [id]));
        expect(preview.invoices[0]).toMatchObject({ way: "EMAIL" });
        expect(preview.invoices[0].leftToPay).toBeUndefined();
        // The email names the amount, so its words aren't shown either.
        expect(preview.message).toBeNull();
    });

    it("another business's bills are never listed or reminded", async () => {
        const rye = await business("Rye own bills");
        const pulse = await business("Pulse other bills");
        const ours = await overdue(
            rye,
            { first: "Asha", last: "Rao", email: "asha@example.com" },
            7,
        );
        const theirs = await overdue(
            pulse,
            { first: "Dev", last: "Shah", email: "dev@example.com" },
            7,
        );
        expect((await ask(rye)).invoiceIds).toEqual([ours]);

        const res = await reminders.send(rye, await ask(rye, [theirs]));
        // Not named back: it was never this business's to see.
        expect(res.invoices).toEqual([
            {
                invoiceId: theirs,
                way: "NONE",
                reason: "NOT_FOUND",
                outcome: "NOT_SENT",
            },
        ]);
        expect(await sentFor(theirs)).toBe(0);
    });

    it("refuses quiet days that aren't a whole number from 1 to 14", async () => {
        const errors = async (quietDays: unknown) =>
            (
                await validate(
                    plainToInstance(BulkRemindersDto, {
                        invoiceIds: ["inv_1"],
                        quietDays,
                    }),
                )
            ).length;
        expect(await errors(3)).toBe(0);
        expect(await errors(undefined)).toBe(0);
        expect(await errors(0)).toBeGreaterThan(0);
        expect(await errors(15)).toBeGreaterThan(0);
        expect(await errors(2.5)).toBeGreaterThan(0);
    });

    it("Home's bill row says when it was last reminded this week", async () => {
        const rye = await business("Rye home row");
        const yesterday = await overdue(
            rye,
            { first: "Arjun", last: "Mehta", email: "arjun@example.com" },
            27,
        );
        const never = await overdue(
            rye,
            { first: "Priya", last: "Raman", email: "priya@example.com" },
            13,
        );
        const longAgo = await overdue(
            rye,
            { first: "Om", last: "Prakash", email: "om@example.com" },
            40,
        );
        await remindedAgo(rye, yesterday, 1);
        await remindedAgo(rye, longAgo, 9);
        const action = await overdueInvoices(
            prisma,
            rye.organizationId,
            new Date(),
            "Asia/Kolkata",
        );
        const by = new Map(action?.evidence?.map((e) => [e.id, e]));
        expect(by.get(yesterday)?.reminded).toBe("Reminded yesterday");
        expect(by.get(never)?.reminded).toBeUndefined();
        // Older than a week isn't said.
        expect(by.get(longAgo)?.reminded).toBeUndefined();
    });
});
