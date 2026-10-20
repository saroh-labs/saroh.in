import { describe, expect, it } from "vitest";

import type {
    ActionsContext,
    ActionsInvoice,
    DetailActionId,
    DetailActionState,
    InvoiceAction,
    InvoiceActionId,
    InvoiceActions,
} from "./detail-actions";
import {
    actionsFor,
    allActions,
    detailActions,
    invoiceCan,
} from "./detail-actions";
import type { InvoicePayment } from "./service";

/**
 * Invoice Detail's buttons (after "Saroh Invoice Detail"), and what DEC-070
 * changes: without online payment Send reads "Send invoice" and there is no
 * "Copy payment link"; with it, today's buttons.
 */

const base: DetailActionState = {
    standing: "ISSUED",
    credit: false,
    fromOrder: false,
    canWrite: true,
    sendable: true,
    reminding: false,
    reminderWaits: false,
    payOnline: true,
    charging: false,
    hasPdf: true,
    linkBusy: false,
    pdfBusy: false,
};

const labels = (over: Partial<DetailActionState>) =>
    detailActions({ ...base, ...over }).map((a) => a.label);
const primary = (over: Partial<DetailActionState>) =>
    detailActions({ ...base, ...over }).find((a) => a.primary)?.label;

describe("detailActions' payment link after a reload (UX-048)", () => {
    it("says Make a new link when the link out can't be shown", () => {
        const got = labels({ linkUnseen: true });
        expect(got).toContain("Make a new link");
        expect(got).not.toContain("Copy payment link");
    });

    it("still says it is working while the link is made", () => {
        expect(labels({ linkUnseen: true, linkBusy: true })).toContain(
            "Making…",
        );
    });

    it("offers no link at all while autopay is charging", () => {
        expect(labels({ linkUnseen: true, charging: true })).not.toContain(
            "Make a new link",
        );
    });
});

describe("detailActions", () => {
    it("an unpaid invoice that pays online: Send with payment link and Copy payment link, as today", () => {
        expect(labels({})).toEqual([
            "Send with payment link",
            "Copy payment link",
            "Record payment",
            "Print",
            "Download PDF",
            "Cancel invoice",
        ]);
        expect(primary({})).toBe("Send with payment link");
    });

    it("payOnline false: Send invoice, and no Copy payment link (DEC-070)", () => {
        const got = labels({ payOnline: false });
        expect(got[0]).toBe("Send invoice");
        expect(got).not.toContain("Copy payment link");
        expect(got).not.toContain("Send with payment link");
        expect(primary({ payOnline: false })).toBe("Send invoice");
    });

    it("payOnline false and nothing to send it by: Record payment leads, and Copy view link hands over the invoice (#833)", () => {
        const got = labels({ payOnline: false, sendable: false });
        expect(got).toEqual([
            "Copy view link",
            "Record payment",
            "Print",
            "Download PDF",
            "Cancel invoice",
        ]);
        expect(primary({ payOnline: false, sendable: false })).toBe(
            "Record payment",
        );
    });

    it("a draft: Send invoice issues and sends without online payment", () => {
        expect(labels({ standing: "DRAFT", payOnline: false })).toEqual([
            "Send invoice",
            "Issue it",
            "Edit",
            "Delete draft",
        ]);
        expect(labels({ standing: "DRAFT" })[0]).toBe("Send with payment link");
        expect(primary({ standing: "DRAFT", sendable: false })).toBe(
            "Issue it",
        );
    });

    it("once sent, Send reminder, held while one went today", () => {
        const got = detailActions({
            ...base,
            payOnline: false,
            reminding: true,
            reminderWaits: true,
        });
        expect(got[0]).toMatchObject({
            id: "remind",
            label: "Send reminder",
            disabled: true,
        });
    });

    it("no payment link while autopay is charging it (D13)", () => {
        expect(labels({ charging: true })).not.toContain("Copy payment link");
        expect(labels({ charging: true, payOnline: false })).not.toContain(
            "Copy view link",
        );
    });

    it("Copy view link only where no payment link can be made (#833)", () => {
        expect(labels({})).not.toContain("Copy view link");
        expect(labels({ payOnline: false })).toContain("Copy view link");
        expect(labels({ payOnline: false, canWrite: false })).not.toContain(
            "Copy view link",
        );
        expect(labels({ payOnline: false, linkBusy: true })).toContain(
            "Making…",
        );
    });

    it("paid: Print, Copy view link and Refund, or Refund on the order", () => {
        expect(labels({ standing: "PAID" })).toEqual([
            "Print",
            "Copy view link",
            "Download PDF",
            "Refund…",
        ]);
        expect(labels({ standing: "PAID", fromOrder: true })).toContain(
            "Refund on the order",
        );
        expect(labels({ standing: "PAID", canWrite: false })).toEqual([
            "Print",
            "Download PDF",
        ]);
    });

    it("a paid invoice keeps Copy view link, online payment or not (UX-080)", () => {
        expect(labels({ standing: "PAID" })).toContain("Copy view link");
        expect(labels({ standing: "PAID", payOnline: false })).toContain(
            "Copy view link",
        );
        // An order's paper is handed over on the order; a credit note
        // isn't paid.
        expect(labels({ standing: "PAID", fromOrder: true })).not.toContain(
            "Copy view link",
        );
        expect(labels({ standing: "PAID", credit: true })).not.toContain(
            "Copy view link",
        );
    });

    it("a role that only reads an owed invoice sees Record payment disabled, with why (FB-1, DEC-098)", () => {
        expect(labels({ canWrite: false })).toEqual([
            "Record payment",
            "Print",
            "Download PDF",
        ]);
        const pay = detailActions({ ...base, canWrite: false }).find(
            (a) => a.id === "pay",
        );
        expect(pay).toMatchObject({
            disabled: true,
            reason: "Recording money isn't part of your role.",
        });
    });

    it("a role that only reads a paid invoice gets Print and the PDF", () => {
        expect(labels({ canWrite: false, standing: "PAID" })).toEqual([
            "Print",
            "Download PDF",
        ]);
    });
});

/* ------------------------------------------------------------------------
 * actionsFor: one main button per state, then Share, then More (DEC-173,
 * U7 #1119), for every state and every built-in role.
 * ---------------------------------------------------------------------- */

const READ = ["invoice:read"];
const WRITE = ["invoice:read", "invoice:write"];
const MONEY = ["payment:read", "payment:manage"];
/** The built-in roles' defaults, as the API resolves them (DEC-098). */
const ROLES = {
    owner: { actions: [...WRITE, ...MONEY, "org:delete"] },
    admin: { actions: [...WRITE, ...MONEY] },
    // Neither reaches invoices by default: money stays with a permission.
    member: { actions: ["org:read", "booking:read", "booking:write"] },
    reviewer: { actions: ["site:read", "site:approve"] },
} as const;
/** A role the business made that reads invoices and records nothing. */
const READS_ONLY = { actions: READ };

const SEND: NonNullable<ActionsInvoice["send"]> = {
    channels: ["email"],
    payOnline: true,
    nextReminderAt: null,
};
const ONLINE: NonNullable<ActionsInvoice["online"]> = {
    providerConnected: true,
    payLinkActive: false,
    payments: [],
};

function payment(over: Partial<InvoicePayment> = {}): InvoicePayment {
    return {
        id: "pay_1",
        amount: "4000.00",
        currency: "INR",
        method: "CASH",
        reference: null,
        note: null,
        receivedAt: "2026-10-12T05:00:00.000Z",
        recordedAt: "2026-10-12T05:00:00.000Z",
        cheque: null,
        bankStatus: null,
        clearedAt: null,
        bouncedAt: null,
        bounceReason: null,
        removed: null,
        canRemove: true,
        ...over,
    };
}

const CHEQUE = payment({
    id: "pay_chq",
    amount: "8400.00",
    method: "CHEQUE",
    cheque: { number: "004512", bank: "HDFC Bank" },
    bankStatus: "WAITING",
});

const issued: ActionsInvoice = {
    standing: "ISSUED",
    kind: "INVOICE",
    source: "MANUAL",
    number: "RC/26-27/0106",
    reissuedAsId: null,
    order: null,
    partlyPaid: false,
    chequeWaiting: false,
    payments: [],
    send: SEND,
    sent: [],
    online: ONLINE,
};

/** Every state the screens draw, as the detail read sends it. */
const STATES = {
    draft: { ...issued, standing: "DRAFT", number: null },
    issued,
    partlyPaid: {
        ...issued,
        partlyPaid: true,
        payments: [payment()],
    },
    overdue: { ...issued, standing: "OVERDUE" },
    paid: {
        ...issued,
        standing: "PAID",
        send: { ...SEND, channels: [], reason: "NOT_OWED" },
        payments: [payment({ amount: "8400.00" })],
    },
    paidChequeWaiting: {
        ...issued,
        standing: "PAID",
        chequeWaiting: true,
        send: { ...SEND, channels: [], reason: "NOT_OWED" },
        payments: [CHEQUE],
    },
    void: { ...issued, standing: "VOID" },
    credited: { ...issued, standing: "CREDITED" },
    orderInvoice: {
        ...issued,
        standing: "PAID",
        source: "ORDER",
        order: { id: "ord_1", number: "1020" },
        send: { ...SEND, channels: [], reason: "NOT_OWED" },
    },
    creditNote: {
        ...issued,
        kind: "CREDIT_NOTE",
        send: { ...SEND, channels: [], reason: "NOT_OWED" },
    },
} satisfies Record<string, ActionsInvoice>;

interface Shape {
    main: string | null;
    beside: string[];
    share: string[];
    more: string[];
}

/** The labels a set draws, by place. */
function shape(a: InvoiceActions): Shape {
    return {
        main: a.main?.label ?? null,
        beside: a.beside.map((x) => x.label),
        share: a.share.map((x) => x.label),
        more: a.more.map((x) => x.label),
    };
}

/** What an owner or admin sees, the customer's phone known (INVPageA). */
const WRITER: Record<keyof typeof STATES, Shape> = {
    draft: {
        main: "Issue and share",
        beside: ["Edit"],
        share: [],
        more: ["Issue it", "Delete draft"],
    },
    issued: {
        main: "Record payment",
        beside: ["Share on WhatsApp"],
        share: ["Email it", "Copy link", "Download PDF", "Print"],
        more: ["Cancel or correct", "Make a new link"],
    },
    partlyPaid: {
        main: "Record the rest",
        beside: [],
        share: [
            "Share on WhatsApp",
            "Email it",
            "Copy link",
            "Download PDF",
            "Print",
        ],
        more: ["Cancel or correct", "Make a new link"],
    },
    overdue: {
        main: "Record payment",
        beside: ["Share on WhatsApp"],
        share: ["Email it", "Copy link", "Download PDF", "Print"],
        more: ["Cancel or correct", "Make a new link"],
    },
    paid: {
        main: "Share receipt",
        beside: ["Download PDF"],
        share: [],
        more: ["Refund…", "Copy view link", "Print"],
    },
    paidChequeWaiting: {
        main: "Mark as in the bank",
        beside: ["Bounced"],
        share: [
            "Share on WhatsApp",
            "Email the receipt",
            "Copy view link",
            "Download PDF",
            "Print",
        ],
        more: ["Refund…", "Remove payment"],
    },
    void: {
        main: "Download PDF",
        beside: [],
        share: ["Print"],
        more: ["Write again"],
    },
    credited: { main: "Download PDF", beside: [], share: ["Print"], more: [] },
    orderInvoice: {
        main: "Download PDF",
        beside: [],
        share: ["Print"],
        more: ["Refund on the order"],
    },
    creditNote: {
        main: "Download PDF",
        beside: [],
        share: ["Print"],
        more: [],
    },
};

/** A role that reads invoices and can't record money (DEC-098). */
const READER: Record<keyof typeof STATES, Shape> = {
    draft: { main: null, beside: [], share: ["Print"], more: [] },
    issued: {
        main: "Record payment",
        beside: [],
        share: ["Download PDF", "Print"],
        more: [],
    },
    partlyPaid: {
        main: "Record the rest",
        beside: [],
        share: ["Download PDF", "Print"],
        more: [],
    },
    overdue: {
        main: "Record payment",
        beside: [],
        share: ["Download PDF", "Print"],
        more: [],
    },
    paid: { main: "Download PDF", beside: [], share: ["Print"], more: [] },
    paidChequeWaiting: {
        main: "Mark as in the bank",
        beside: [],
        share: ["Download PDF", "Print"],
        more: [],
    },
    void: { main: "Download PDF", beside: [], share: ["Print"], more: [] },
    credited: { main: "Download PDF", beside: [], share: ["Print"], more: [] },
    orderInvoice: {
        main: "Download PDF",
        beside: [],
        share: ["Print"],
        more: [],
    },
    creditNote: {
        main: "Download PDF",
        beside: [],
        share: ["Print"],
        more: [],
    },
};

const NOTHING: Shape = { main: null, beside: [], share: [], more: [] };

describe("actionsFor: every state, for every role (U7, DEC-173)", () => {
    for (const state of Object.keys(STATES) as (keyof typeof STATES)[]) {
        const invoice: ActionsInvoice = STATES[state];
        for (const [role, org] of Object.entries(ROLES)) {
            it(`${state}, ${role}`, () => {
                const got = shape(
                    actionsFor(invoice, invoiceCan(org), { phone: true }),
                );
                const writes = role === "owner" || role === "admin";
                expect(got).toEqual(writes ? WRITER[state] : NOTHING);
            });
        }
        it(`${state}, a role that only reads invoices`, () => {
            expect(
                shape(
                    actionsFor(invoice, invoiceCan(READS_ONLY), {
                        phone: true,
                    }),
                ),
            ).toEqual(READER[state]);
        });
    }

    it("names the state each set is for", () => {
        const owner = invoiceCan(ROLES.owner);
        expect(actionsFor(STATES.partlyPaid, owner).state).toBe("partlyPaid");
        expect(actionsFor(STATES.paidChequeWaiting, owner).state).toBe(
            "paidChequeWaiting",
        );
        expect(actionsFor(STATES.creditNote, owner).state).toBe("creditNote");
    });
});

describe("actionsFor: the details", () => {
    const owner = invoiceCan(ROLES.owner);
    const reader = invoiceCan(READS_ONLY);
    const ids = (a: InvoiceAction[]) => a.map((x) => x.id);
    const find = (a: InvoiceActions, id: string) =>
        allActions(a).find((x) => x.id === id);

    it("a role without money sees Record payment off, with the DEC-098 reason", () => {
        for (const state of ["issued", "overdue", "partlyPaid"] as const) {
            expect(actionsFor(STATES[state], reader).main).toMatchObject({
                id: "recordPayment",
                disabled: true,
                reason: "Recording money isn't part of your role.",
            });
        }
        expect(actionsFor(STATES.paidChequeWaiting, reader).main).toMatchObject(
            {
                id: "markCleared",
                disabled: true,
                reason: "Recording money isn't part of your role.",
            },
        );
    });

    it("an owner's Record payment is on", () => {
        const main = actionsFor(STATES.issued, owner).main;
        expect(main?.disabled).toBeFalsy();
        expect(main?.reason).toBeUndefined();
    });

    it("an order's invoice never offers Record payment, owed or paid (ADR-008)", () => {
        const order = STATES.orderInvoice;
        for (const standing of ["ISSUED", "OVERDUE", "PAID"] as const) {
            for (const can of [owner, reader]) {
                const got = allActions(actionsFor({ ...order, standing }, can));
                expect(ids(got)).not.toContain("recordPayment");
                expect(ids(got)).not.toContain("whatsapp");
            }
        }
        expect(
            ids(allActions(actionsFor({ ...order, standing: "PAID" }, owner))),
        ).toContain("refundOrder");
        // Its source alone says so, before the order is read.
        const bySource = actionsFor(
            { ...STATES.issued, source: "ORDER", order: null },
            owner,
        );
        expect(ids(allActions(bySource))).not.toContain("recordPayment");
    });

    it("with autopay under way, Share's send items are off with why; the paper isn't", () => {
        const charging = {
            ...STATES.overdue,
            online: {
                ...ONLINE,
                autopayCharge: { at: "2026-10-12T05:00:00Z" },
            },
            send: {
                ...SEND,
                channels: [],
                reason: "AUTOPAY_PENDING" as const,
            },
        };
        const got = actionsFor(charging, owner, { phone: true });
        const why =
            "An autopay charge is under way. Sharing waits until the bank answers.";
        for (const id of ["whatsapp", "send", "copyLink"]) {
            expect(find(got, id)).toMatchObject({
                disabled: true,
                reason: why,
            });
        }
        expect(find(got, "pdf")?.disabled).toBeFalsy();
        expect(find(got, "print")?.disabled).toBeFalsy();
        expect(find(got, "newLink")).toBeUndefined();
        // Recording money taken by hand still works.
        expect(got.main?.disabled).toBeFalsy();
    });

    it("no phone, and email can go: Send by email leads, WhatsApp moves into Share", () => {
        const got = actionsFor(STATES.issued, owner, { phone: false });
        expect(got.beside).toEqual([
            expect.objectContaining({ id: "send", label: "Send by email" }),
        ]);
        expect(ids(got.share)).toEqual([
            "whatsapp",
            "copyLink",
            "pdf",
            "print",
        ]);
    });

    it("no phone and no email provider: WhatsApp still leads, and the sheet asks for a number", () => {
        const got = actionsFor(
            {
                ...STATES.issued,
                send: {
                    ...SEND,
                    channels: [],
                    reason: "NO_EMAIL_PROVIDER",
                },
            },
            owner,
            { phone: false },
        );
        expect(got.beside[0]?.id).toBe("whatsapp");
        expect(find(got, "send")).toMatchObject({
            disabled: true,
            reason: "No email provider yet, so Saroh can't email it.",
        });
    });

    it("no email address: the email item says so", () => {
        const got = actionsFor(
            {
                ...STATES.issued,
                send: { ...SEND, channels: [], reason: "NO_EMAIL_ADDRESS" },
            },
            owner,
        );
        expect(find(got, "send")).toMatchObject({
            disabled: true,
            reason: "There's no email address on this invoice.",
        });
    });

    it("only the account thread: it is sent there, not emailed", () => {
        const got = actionsFor(
            { ...STATES.issued, send: { ...SEND, channels: ["thread"] } },
            owner,
        );
        expect(find(got, "send")?.label).toBe("Send it");
    });

    it("unknown phone: WhatsApp leads (the share sheet asks)", () => {
        expect(actionsFor(STATES.issued, owner).beside[0]?.id).toBe("whatsapp");
    });

    it("overdue, or sent before: WhatsApp opens on the reminder", () => {
        expect(actionsFor(STATES.overdue, owner).beside[0]?.kind).toBe(
            "REMINDER",
        );
        expect(actionsFor(STATES.issued, owner).beside[0]?.kind).toBe("NEW");
        const sent = {
            ...STATES.issued,
            sent: [
                {
                    id: "m1",
                    channel: "email" as const,
                    to: "vivek@example.com",
                    at: "2026-10-10T05:00:00Z",
                    reminder: false,
                    status: "SENT",
                },
            ],
        };
        const got = actionsFor(sent, owner);
        expect(got.beside[0]?.kind).toBe("REMINDER");
        expect(find(got, "remind")).toMatchObject({
            label: "Email a reminder",
            kind: "REMINDER",
        });
        expect(find(got, "send")).toBeUndefined();
    });

    it("reminded today, by email or WhatsApp: both reminders wait for tomorrow", () => {
        const got = actionsFor(
            {
                ...STATES.overdue,
                send: { ...SEND, nextReminderAt: "2026-10-21T05:00:00Z" },
                sent: [
                    {
                        id: "m1",
                        channel: "email",
                        to: "vivek@example.com",
                        at: "2026-10-20T05:00:00Z",
                        reminder: true,
                        status: "SENT",
                    },
                ],
            },
            owner,
        );
        const why = "Reminded today. Next one tomorrow.";
        expect(find(got, "whatsapp")).toMatchObject({
            disabled: true,
            reason: why,
        });
        expect(find(got, "remind")).toMatchObject({
            disabled: true,
            reason: why,
        });
        // A new-invoice share isn't a reminder, so it isn't held.
        const fresh = actionsFor(
            {
                ...STATES.issued,
                send: { ...SEND, nextReminderAt: "2026-10-21T05:00:00Z" },
            },
            owner,
        );
        expect(find(fresh, "whatsapp")?.disabled).toBeFalsy();
    });

    it("no online payment: the link is a view link (DEC-070, #833)", () => {
        const got = actionsFor(
            { ...STATES.issued, send: { ...SEND, payOnline: false } },
            owner,
        );
        expect(find(got, "copyViewLink")?.label).toBe("Copy link");
        expect(find(got, "copyLink")).toBeUndefined();
    });

    it("a link out that this tab can't show says Make a new link, once (UX-048)", () => {
        const got = actionsFor(STATES.issued, owner, { linkUnseen: true });
        expect(find(got, "copyLink")?.label).toBe("Make a new link");
        expect(find(got, "newLink")).toBeUndefined();
    });

    it("says it is working while a link or the PDF is made", () => {
        const got = actionsFor(STATES.issued, owner, {
            linkBusy: true,
            pdfBusy: true,
        });
        expect(find(got, "copyLink")).toMatchObject({
            label: "Making…",
            disabled: true,
        });
        expect(find(got, "pdf")).toMatchObject({
            label: "Making…",
            disabled: true,
        });
    });

    it("a draft with no way to share it: Issue it leads, Delete draft in More", () => {
        const got = actionsFor(
            {
                ...STATES.draft,
                send: { ...SEND, channels: [], reason: "NO_EMAIL_PROVIDER" },
            },
            owner,
        );
        expect(shape(got)).toEqual({
            main: "Issue it",
            beside: ["Edit"],
            share: [],
            more: ["Delete draft"],
        });
        // A phone makes it shareable on WhatsApp.
        expect(
            actionsFor(
                {
                    ...STATES.draft,
                    send: {
                        ...SEND,
                        channels: [],
                        reason: "NO_EMAIL_PROVIDER",
                    },
                },
                owner,
                { phone: true },
            ).main?.label,
        ).toBe("Issue and share");
    });

    it("a partly paid invoice can't be cancelled until its payments are removed", () => {
        expect(
            find(actionsFor(STATES.partlyPaid, owner), "cancel"),
        ).toMatchObject({
            disabled: true,
            reason: "Part of this invoice is paid. Remove its payments before cancelling it.",
        });
        expect(
            find(actionsFor(STATES.issued, owner), "cancel")?.disabled,
        ).toBeFalsy();
    });

    it("a part paid by a cheque still waiting: its bank status from More", () => {
        const got = actionsFor(
            {
                ...STATES.partlyPaid,
                chequeWaiting: true,
                payments: [{ ...CHEQUE, amount: "4000.00" }],
            },
            owner,
        );
        expect(got.main?.label).toBe("Record the rest");
        expect(ids(got.more)).toEqual([
            "cancel",
            "newLink",
            "markCleared",
            "markBounced",
        ]);
        expect(find(got, "markBounced")?.paymentId).toBe("pay_chq");
    });

    it("a waiting cheque's actions name the cheque's payment", () => {
        const got = actionsFor(STATES.paidChequeWaiting, owner);
        expect(got.main?.paymentId).toBe("pay_chq");
        expect(got.beside[0]?.paymentId).toBe("pay_chq");
        expect(find(got, "removePayment")?.paymentId).toBe("pay_chq");
        expect(find(got, "whatsapp")?.kind).toBe("RECEIPT");
    });

    it("the receipt by email is off, with why, without an email provider", () => {
        const got = actionsFor(STATES.paidChequeWaiting, owner, {
            emailConnected: false,
        });
        expect(find(got, "emailReceipt")).toMatchObject({
            disabled: true,
            reason: "No email provider yet, so Saroh can't email it.",
        });
    });

    it("paid: Share receipt opens the sheet on the receipt", () => {
        expect(actionsFor(STATES.paid, owner).main).toMatchObject({
            id: "shareReceipt",
            kind: "RECEIPT",
        });
    });

    it("a void invoice already written again offers no second copy", () => {
        expect(
            actionsFor({ ...STATES.void, reissuedAsId: "inv_2" }, owner).more,
        ).toEqual([]);
    });

    it("a list row without the detail read: no email item, a view link", () => {
        const row: ActionsInvoice = {
            standing: "ISSUED",
            kind: "INVOICE",
            source: "MANUAL",
            number: "RC/26-27/0107",
            reissuedAsId: null,
        };
        const got = actionsFor(row, owner);
        expect(got.main?.id).toBe("recordPayment");
        expect(ids(got.share)).toEqual(["copyViewLink", "pdf", "print"]);
    });

    it("invoiceCan asks the permissions, never the role's name (DEC-098)", () => {
        expect(invoiceCan({ actions: WRITE })).toEqual({
            read: true,
            write: true,
        });
        expect(invoiceCan({ actions: [] })).toEqual({
            read: false,
            write: false,
        });
        expect(invoiceCan(null)).toEqual({ read: false, write: false });
    });
});

/**
 * §15: every action today's page offers keeps a home in the rebuilt set.
 * Today's ids are read off `detailActions` itself, across every state it
 * knows, so a new one added there fails here until it is placed.
 */
describe("actionsFor keeps every action today's page has (§15)", () => {
    const TODAY_TO_NEW: Record<DetailActionId, InvoiceActionId> = {
        draftSend: "issueAndShare",
        issue: "issue",
        edit: "edit",
        delete: "delete",
        send: "send",
        remind: "remind",
        copyLink: "copyLink",
        copyViewLink: "copyViewLink",
        pay: "recordPayment",
        print: "print",
        pdf: "pdf",
        cancel: "cancel",
        refund: "refund",
        refundOrder: "refundOrder",
    };

    const standings = [
        "DRAFT",
        "ISSUED",
        "OVERDUE",
        "PAID",
        "VOID",
        "CREDITED",
    ] as const;
    const today = new Set<DetailActionId>();
    for (const standing of standings) {
        for (const flags of [
            {},
            { payOnline: false },
            { sendable: false },
            { reminding: true },
            { fromOrder: true },
            { credit: true },
            { canWrite: false },
        ]) {
            for (const a of detailActions({ ...base, standing, ...flags })) {
                today.add(a.id);
            }
        }
    }

    const owner = invoiceCan(ROLES.owner);
    const variants: [ActionsInvoice, ActionsContext][] = [];
    for (const invoice of Object.values(STATES)) {
        variants.push([invoice, { phone: true }]);
        variants.push([invoice, { phone: false }]);
        variants.push([
            {
                ...invoice,
                send: invoice.send && { ...invoice.send, payOnline: false },
            },
            {},
        ]);
        variants.push([
            {
                ...invoice,
                sent: [
                    {
                        id: "m1",
                        channel: "email",
                        to: "a@example.com",
                        at: "2026-10-10T05:00:00Z",
                        reminder: false,
                        status: "SENT",
                    },
                ],
            },
            {},
        ]);
    }
    const rebuilt = new Set<InvoiceActionId>();
    for (const [invoice, ctx] of variants) {
        for (const a of allActions(actionsFor(invoice, owner, ctx))) {
            rebuilt.add(a.id);
        }
    }

    it("reads every one of today's actions", () => {
        expect(Array.from(today).sort()).toEqual(
            Object.keys(TODAY_TO_NEW).sort(),
        );
    });

    for (const [old, now] of Object.entries(TODAY_TO_NEW)) {
        it(`today's ${old} lives on as ${now}`, () => {
            expect(rebuilt.has(now)).toBe(true);
        });
    }

    it("Record payment is the one name: no state says Mark paid", () => {
        for (const [invoice, ctx] of variants) {
            for (const can of [owner, invoiceCan(READS_ONLY)]) {
                const labels = allActions(actionsFor(invoice, can, ctx)).map(
                    (a) => a.label,
                );
                expect(labels).not.toContain("Mark paid");
                expect(labels).not.toContain("Record a payment");
            }
        }
    });
});
