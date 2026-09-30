import { env } from "../../env";
import type { InvoiceSendService } from "../invoices/invoice-send.service";
import type { InvoiceSendView } from "../invoices/send-view";
import type { OrgAction } from "../organizations/organization-actions";
import type { InlinePorts } from "./home-inline";
import { handoverOf, HomeInlineService, retryVia } from "./home-inline";
import {
    firstNameOf,
    markSentWords,
    reminderWords,
    replyWords,
    retryWords,
} from "./home-inline-words";
import type { HomeAction, HomeEvidence, HomeInput } from "./home-model";
import { flattenNeeds } from "./home-needs";

/**
 * Home's inline actions (round 2, F4): which rows offer Mark sent, Retry,
 * Send reminder and Reply, to whom, and what each one says it will do.
 * Mocked reads; each action's write is its target's own endpoint, tested
 * with that endpoint.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T06:00:00.000Z");
const ORG = "org_1";

const OWNER: HomeInput = { organizationId: ORG, organizationRole: "OWNER" };
const MEMBER: HomeInput = { organizationId: ORG, organizationRole: "MEMBER" };

/** Someone holding exactly these actions. */
function holding(...actions: OrgAction[]): HomeInput {
    return {
        organizationId: ORG,
        organizationRole: "MEMBER",
        organizationActions: new Set(actions),
    };
}

function ev(id: string, over: Partial<HomeEvidence> = {}): HomeEvidence {
    return {
        id,
        title: id,
        subtitle: "Farah Khan",
        at: null,
        amountMinor: null,
        currency: null,
        href: `/x/${id}`,
        ...over,
    };
}

function action(code: string, evidence: HomeEvidence[]): HomeAction {
    return {
        code,
        title: code,
        href: "/",
        severity: "OVERDUE",
        count: evidence.length,
        evidence,
    };
}

interface OrderRow {
    id: string;
    stage: string;
    status: string;
    paymentStatus: string;
    fulfilment: string;
    customerId: string | null;
    customerAccountId: string | null;
}

function order(id: string, over: Partial<OrderRow> = {}): OrderRow {
    return {
        id,
        stage: "READY",
        status: "PROCESSING",
        paymentStatus: "PAID",
        fulfilment: "SHIPPING",
        customerId: "cust_1",
        customerAccountId: null,
        ...over,
    };
}

function setup(opts: {
    orders?: OrderRow[];
    providers?: number;
    send?: Partial<InvoiceSendView> | ((id: string) => InvoiceSendView);
    reach?: InlinePorts["orderReach"];
    signsIn?: boolean;
    noSending?: boolean;
    /** D13: each renewal's autopay, by subscription. */
    charges?: Record<string, "CHARGING" | "MANDATE">;
    /** D14: the business offers autopay now. */
    autopayOffered?: boolean;
}) {
    const db = {
        order: { findMany: jest.fn().mockResolvedValue(opts.orders ?? []) },
        merchantPaymentProvider: {
            count: jest.fn().mockResolvedValue(opts.providers ?? 1),
        },
    };
    const readFor = jest.fn(async (_org: string, id: string) => ({
        send:
            typeof opts.send === "function"
                ? opts.send(id)
                : {
                      channels: ["email"],
                      emailTo: "farah@example.com",
                      nextReminderAt: null,
                      ...opts.send,
                  },
        sent: [],
    }));
    const sending = { readFor } as unknown as InvoiceSendService;
    const ports: InlinePorts = {
        orderReach: opts.reach ?? jest.fn().mockResolvedValue("EMAIL"),
        signsIn: jest.fn().mockResolvedValue(opts.signsIn ?? true),
        ...(opts.charges
            ? {
                  renewalCharges: jest
                      .fn()
                      .mockResolvedValue(new Map(Object.entries(opts.charges))),
              }
            : {}),
        ...(opts.autopayOffered === undefined
            ? {}
            : {
                  autopayOffered: jest
                      .fn()
                      .mockResolvedValue(opts.autopayOffered),
              }),
    };
    const service = new HomeInlineService(
        opts.noSending ? undefined : sending,
        db as never,
        ports,
    );
    return { service, db, readFor, ports };
}

describe("the words", () => {
    it("takes a first name, and has none for a row without a name", () => {
        expect(firstNameOf("Farah Khan")).toBe("Farah");
        expect(firstNameOf("  ")).toBeNull();
        expect(firstNameOf(null)).toBeNull();
    });

    it("Mark sent says who is told and how, from A14's reach", () => {
        expect(markSentWords("Anika", true, "EMAIL")).toMatchObject({
            confirm: "This tells Anika by email that the order is on its way.",
            yes: "Mark sent and tell Anika",
            sends: true,
        });
        expect(markSentWords("Anika", true, "EMAIL_AND_ACCOUNT").confirm).toBe(
            "This tells Anika by email and in their account on your site that the order is on its way.",
        );
        expect(markSentWords("Anika", true, "ACCOUNT").confirm).toContain(
            "Nothing is emailed.",
        );
        expect(markSentWords("Anika", true, "ON_SIGN_IN")).toMatchObject({
            confirm:
                "Anika sees that the order is on its way when they sign in on your site. Nothing is emailed.",
            sends: true,
        });
    });

    it("Mark sent claims no message where none goes", () => {
        const none = markSentWords("Anika", true, "NONE");
        expect(none).toMatchObject({
            confirm: "Nothing is sent to Anika. The order shows as sent.",
            yes: "Mark sent",
            done: "Marked sent",
            sends: false,
        });
        // A digital order's "sent" has no notice at all.
        expect(markSentWords(null, false, "EMAIL")).toMatchObject({
            confirm:
                "Nothing is sent to the customer. The order shows as sent.",
            sends: false,
        });
    });

    it("Retry by pay link says nothing is sent, and the old link stops", () => {
        const words = retryWords("Farah");
        expect(words.sends).toBe(false);
        expect(words.confirm).toContain("Saroh doesn't send it");
        expect(words.confirm).toContain("the link sent before stops working");
        expect(words.label).toBe("Retry by pay link");
    });

    it("Send reminder names each channel D17's send flag names", () => {
        expect(
            reminderWords("Farah", ["email"], "farah@example.com").confirm,
        ).toBe(
            "This reminds Farah by email at farah@example.com that the bill is still to pay, with a new pay link. A link you shared before stops working.",
        );
        expect(reminderWords("Farah", ["thread"]).confirm).toBe(
            "This reminds Farah in their account on your site that the bill is still to pay, with a way to pay it. Nothing is emailed.",
        );
        expect(
            reminderWords("Farah", ["email", "thread"], "f@x.in").confirm,
        ).toContain("by email at f@x.in and in their account on your site");
        expect(reminderWords("Farah", ["email"]).sends).toBe(true);
    });

    it("Reply says it shows in their account, and nothing is emailed", () => {
        expect(replyWords("Farah", true).confirm).toBe(
            "Farah sees your reply in Messages when they're signed in on your site. Nothing is emailed or texted.",
        );
        expect(replyWords("Farah", false).confirm).toContain(
            "They'll see your reply when they sign in there.",
        );
        expect(replyWords("Farah", true).sends).toBe(true);
    });
});

describe("handoverOf", () => {
    it("is the handover step when that's the order's next step", () => {
        expect(handoverOf(order("o"))).toBe("HANDED_TO_COURIER");
        expect(handoverOf(order("o", { fulfilment: "LOCAL_DELIVERY" }))).toBe(
            "OUT_FOR_DELIVERY",
        );
        expect(
            handoverOf(
                order("o", {
                    fulfilment: "DIGITAL",
                    stage: "NEW",
                    status: "PENDING",
                }),
            ),
        ).toBe("SENT");
    });

    it("is none before it is ready, for a pick-up, or once unpaid or cancelled", () => {
        expect(handoverOf(order("o", { stage: "PREPARING" }))).toBeNull();
        expect(handoverOf(order("o", { fulfilment: "PICKUP" }))).toBeNull();
        expect(handoverOf(order("o", { status: "CANCELLED" }))).toBeNull();
        expect(
            handoverOf(
                order("o", {
                    fulfilment: "DIGITAL",
                    stage: "NEW",
                    status: "PENDING",
                    paymentStatus: "UNPAID",
                }),
            ),
        ).toBeNull();
    });
});

describe("retryVia", () => {
    it("is a pay link once the renewal is past due, and nothing before", () => {
        expect(
            retryVia({ at: new Date(NOW.getTime() - DAY).toISOString() }, NOW),
        ).toBe("PAY_LINK");
        expect(
            retryVia({ at: new Date(NOW.getTime() + DAY).toISOString() }, NOW),
        ).toBeNull();
        expect(retryVia({ at: null }, NOW)).toBeNull();
    });

    it("takes a renewal whose autopay failed before its due date (D13)", () => {
        const ahead = new Date(NOW.getTime() + DAY).toISOString();
        expect(retryVia({ at: ahead, tag: "Payment failed" }, NOW)).toBe(
            "PAY_LINK",
        );
        expect(retryVia({ at: ahead, tag: "Autopay limit too low" }, NOW)).toBe(
            "PAY_LINK",
        );
    });

    it("charges autopay again when the mandate can take it, else a link only for someone who may make one", () => {
        const past = new Date(NOW.getTime() - DAY).toISOString();
        expect(retryVia({ at: past }, NOW, { mandate: true })).toBe("MANDATE");
        expect(
            retryVia({ at: past }, NOW, { mandate: false, payLink: false }),
        ).toBeNull();
    });
});

describe("HomeInlineService.decorate", () => {
    const original = env.SITE_ACCOUNT_AREA;
    afterEach(() => {
        env.SITE_ACCOUNT_AREA = original;
    });

    it("offers Mark sent on an order ready to hand over, and it carries into the row", async () => {
        const { service } = setup({
            orders: [order("o_1"), order("o_2", { stage: "PREPARING" })],
        });
        const actions = [
            action("COMMERCE_OPEN_ORDERS", [
                ev("o_1", { subtitle: "Anika Rao" }),
                ev("o_2"),
            ]),
        ];
        await service.decorate(actions, OWNER, NOW);
        const [ready, preparing] = actions[0].evidence ?? [];
        expect(ready.inline).toMatchObject({
            kind: "MARK_SENT",
            target: "o_1",
            stage: "HANDED_TO_COURIER",
            sends: true,
            undoable: true,
            yes: "Mark sent and tell Anika",
        });
        expect(preparing.inline).toBeUndefined();

        const { needs } = flattenNeeds(actions, "Asia/Kolkata");
        expect(needs[0].inline?.kind).toBe("MARK_SENT");
        expect(needs[1].inline).toBeUndefined();
    });

    it("offers no Mark sent to a role without order:stage", async () => {
        const { service, db } = setup({ orders: [order("o_1")] });
        const actions = [action("COMMERCE_OPEN_ORDERS", [ev("o_1")])];
        await service.decorate(actions, holding("order:read"), NOW);
        expect(actions[0].evidence?.[0].inline).toBeUndefined();
        expect(db.order.findMany).not.toHaveBeenCalled();
    });

    it("offers no Mark sent when how they'd be told can't be read", async () => {
        const { service } = setup({
            orders: [order("o_1")],
            reach: jest.fn().mockRejectedValue(new Error("down")),
        });
        const actions = [action("COMMERCE_OPEN_ORDERS", [ev("o_1")])];
        await service.decorate(actions, OWNER, NOW);
        expect(actions[0].evidence?.[0].inline).toBeUndefined();
    });

    it("keeps a walk-in's Mark sent quiet: nobody to tell", async () => {
        const { service } = setup({
            orders: [order("o_1", { customerId: null })],
            reach: jest.fn().mockResolvedValue("NONE"),
        });
        const actions = [action("COMMERCE_OPEN_ORDERS", [ev("o_1")])];
        await service.decorate(actions, OWNER, NOW);
        expect(actions[0].evidence?.[0].inline).toMatchObject({
            sends: false,
            undoable: true,
        });
    });

    it("offers Retry by pay link on a past-due renewal, never Undo", async () => {
        const { service } = setup({});
        const past = new Date(NOW.getTime() - 2 * DAY).toISOString();
        const future = new Date(NOW.getTime() + DAY).toISOString();
        const actions = [
            action("PAYMENTS_FAILED_RENEWALS", [
                ev("sub_1", { at: past }),
                ev("sub_2", { at: future, tag: "Payment failed" }),
            ]),
        ];
        await service.decorate(actions, OWNER, NOW);
        expect(actions[0].evidence?.[0].inline).toMatchObject({
            kind: "RETRY",
            via: "PAY_LINK",
            target: "sub_1",
            sends: false,
            undoable: false,
        });
        // Not yet due, but its autopay failed (D13): it can be retried.
        expect(actions[0].evidence?.[1].inline).toMatchObject({
            kind: "RETRY",
            via: "PAY_LINK",
            target: "sub_2",
        });
    });

    it("offers no Retry while an autopay charge is under way (D13)", async () => {
        const { service } = setup({ charges: { sub_1: "CHARGING" } });
        const past = new Date(NOW.getTime() - 2 * DAY).toISOString();
        const actions = [
            action("PAYMENTS_FAILED_RENEWALS", [ev("sub_1", { at: past })]),
        ];
        await service.decorate(actions, OWNER, NOW);
        expect(actions[0].evidence?.[0].inline).toBeUndefined();
    });

    it("retries by autopay when the mandate can take it, in its own words (D13)", async () => {
        const { service } = setup({ charges: { sub_1: "MANDATE" } });
        const past = new Date(NOW.getTime() - 2 * DAY).toISOString();
        const actions = [
            action("PAYMENTS_FAILED_RENEWALS", [ev("sub_1", { at: past })]),
        ];
        // Charging autopay needs subscription:write only, not invoice:write.
        await service.decorate(actions, holding("subscription:write"), NOW);
        expect(actions[0].evidence?.[0].inline).toMatchObject({
            kind: "RETRY",
            via: "MANDATE",
            label: "Charge autopay again",
            sends: false,
            undoable: false,
        });
    });

    it("offers no Retry without subscription:write and invoice:write, or without a payment provider", async () => {
        const past = new Date(NOW.getTime() - DAY).toISOString();
        const make = () => [
            action("PAYMENTS_FAILED_RENEWALS", [ev("sub_1", { at: past })]),
        ];

        const a = make();
        await setup({}).service.decorate(a, holding("subscription:write"), NOW);
        expect(a[0].evidence?.[0].inline).toBeUndefined();

        const b = make();
        await setup({ providers: 0 }).service.decorate(b, OWNER, NOW);
        expect(b[0].evidence?.[0].inline).toBeUndefined();
    });

    it("offers Send a set-up link beside Retry when the autopay limit is too low (D14)", async () => {
        const { service } = setup({ autopayOffered: true });
        const future = new Date(NOW.getTime() + DAY).toISOString();
        const actions = [
            action("PAYMENTS_FAILED_RENEWALS", [
                ev("sub_1", { at: future, tag: "Autopay limit too low" }),
                ev("sub_2", { at: future, tag: "Payment failed" }),
            ]),
        ];
        await service.decorate(actions, OWNER, NOW);
        const [low, failed] = actions[0].evidence ?? [];
        expect(low.link).toEqual({
            label: "Send a set-up link",
            href: "/billing/subscriptions/sub_1?do=autopay-link",
        });
        // Retry by pay link stays: the renewal can still be paid today.
        expect(low.inline).toMatchObject({ kind: "RETRY", via: "PAY_LINK" });
        // A decline needs no new authorisation.
        expect(failed.link).toBeUndefined();

        // It rides onto the row.
        const { needs } = flattenNeeds(actions, "Asia/Kolkata");
        expect(needs.find((n) => n.id.endsWith("sub_1"))?.link).toEqual(
            low.link,
        );
    });

    it("offers no set-up link without subscription:write, without autopay, or while a charge is under way", async () => {
        const future = new Date(NOW.getTime() + DAY).toISOString();
        const make = (tag = "Autopay limit too low") => [
            action("PAYMENTS_FAILED_RENEWALS", [
                ev("sub_1", { at: future, tag }),
            ]),
        ];

        const a = make();
        await setup({ autopayOffered: true }).service.decorate(
            a,
            holding("invoice:write", "subscription:read"),
            NOW,
        );
        expect(a[0].evidence?.[0].link).toBeUndefined();

        const b = make();
        await setup({ autopayOffered: false }).service.decorate(b, OWNER, NOW);
        expect(b[0].evidence?.[0].link).toBeUndefined();

        // No way to read the offer (a Home built by hand): nothing promised.
        const c = make();
        await setup({}).service.decorate(c, OWNER, NOW);
        expect(c[0].evidence?.[0].link).toBeUndefined();

        // A charge under way re-tags the row; it offers nothing.
        const d = make("Autopay charge in progress · 29 Sep");
        await setup({ autopayOffered: true }).service.decorate(d, OWNER, NOW);
        expect(d[0].evidence?.[0].link).toBeUndefined();
    });

    it("offers Send reminder from D17's send flag, in its words", async () => {
        const { service, readFor } = setup({});
        const actions = [action("PAYMENTS_OVERDUE_INVOICES", [ev("inv_1")])];
        await service.decorate(actions, OWNER, NOW);
        expect(readFor).toHaveBeenCalledWith(ORG, "inv_1", NOW);
        expect(actions[0].evidence?.[0].inline).toMatchObject({
            kind: "SEND_REMINDER",
            target: "inv_1",
            sends: true,
            undoable: true,
            confirm: expect.stringContaining("by email at farah@example.com"),
        });
    });

    it("leaves the invoice a link when no channel can carry it, or a reminder went today", async () => {
        const none = [action("PAYMENTS_OVERDUE_INVOICES", [ev("inv_1")])];
        await setup({
            send: { channels: [], reason: "NO_EMAIL_PROVIDER" },
        }).service.decorate(none, OWNER, NOW);
        expect(none[0].evidence?.[0].inline).toBeUndefined();

        const today = [action("PAYMENTS_OVERDUE_INVOICES", [ev("inv_1")])];
        await setup({
            send: {
                nextReminderAt: new Date(NOW.getTime() + DAY / 2).toISOString(),
            },
        }).service.decorate(today, OWNER, NOW);
        expect(today[0].evidence?.[0].inline).toBeUndefined();
    });

    it("offers Send reminder only with invoice:write", async () => {
        const { service, readFor } = setup({});
        const actions = [action("PAYMENTS_OVERDUE_INVOICES", [ev("inv_1")])];
        await service.decorate(actions, holding("invoice:read"), NOW);
        expect(actions[0].evidence?.[0].inline).toBeUndefined();
        expect(readFor).not.toHaveBeenCalled();
    });

    it("offers Reply only while the account area is on, and to message:write", async () => {
        const make = () => [
            action("CRM_UNANSWERED_MESSAGES", [ev("contact_1")]),
        ];

        env.SITE_ACCOUNT_AREA = "on";
        const on = make();
        await setup({}).service.decorate(on, OWNER, NOW);
        expect(on[0].evidence?.[0].inline).toMatchObject({
            kind: "REPLY",
            target: "contact_1",
            sends: true,
        });

        const reader = make();
        await setup({}).service.decorate(reader, holding("message:read"), NOW);
        expect(reader[0].evidence?.[0].inline).toBeUndefined();

        env.SITE_ACCOUNT_AREA = "off";
        const off = make();
        await setup({}).service.decorate(off, OWNER, NOW);
        expect(off[0].evidence?.[0].inline).toBeUndefined();
    });

    it("offers Reply on a low-star review to product-review:write, saying nothing is emailed", async () => {
        const make = () => [
            action("COMMERCE_LOW_STAR_REVIEWS", [
                ev("review_1", { subtitle: "Dev S." }),
            ]),
        ];

        const owner = make();
        await setup({}).service.decorate(owner, OWNER, NOW);
        expect(owner[0].evidence?.[0].inline).toMatchObject({
            kind: "REVIEW_REPLY",
            label: "Reply",
            target: "review_1",
            person: "Dev",
            sends: true,
            yes: "Post reply",
        });
        expect(owner[0].evidence?.[0].inline?.confirm).toBe(
            "Your reply shows under Dev's review on your site, where anyone can read it. Nothing is emailed.",
        );

        // Reading reviews isn't answering them.
        const reader = make();
        await setup({}).service.decorate(
            reader,
            holding("product-review:read"),
            NOW,
        );
        expect(reader[0].evidence?.[0].inline).toBeUndefined();

        const writer = make();
        await setup({}).service.decorate(
            writer,
            holding("product-review:write"),
            NOW,
        );
        expect(writer[0].evidence?.[0].inline?.kind).toBe("REVIEW_REPLY");
    });

    it("gives a Member none of them by default", async () => {
        env.SITE_ACCOUNT_AREA = "on";
        const past = new Date(NOW.getTime() - DAY).toISOString();
        const actions = [
            action("PAYMENTS_FAILED_RENEWALS", [ev("sub_1", { at: past })]),
            action("PAYMENTS_OVERDUE_INVOICES", [ev("inv_1")]),
            action("CRM_UNANSWERED_MESSAGES", [ev("contact_1")]),
        ];
        await setup({}).service.decorate(actions, MEMBER, NOW);
        for (const a of actions) {
            expect(a.evidence?.[0].inline).toBeUndefined();
        }
    });

    it("leaves one source's rows as links when its read fails, and the rest still offer theirs", async () => {
        const { service } = setup({
            send: () => {
                throw new Error("send flag down");
            },
        });
        const past = new Date(NOW.getTime() - DAY).toISOString();
        const actions = [
            action("PAYMENTS_OVERDUE_INVOICES", [ev("inv_1")]),
            action("PAYMENTS_FAILED_RENEWALS", [ev("sub_1", { at: past })]),
        ];
        await expect(
            service.decorate(actions, OWNER, NOW),
        ).resolves.toBeUndefined();
        expect(actions[0].evidence?.[0].inline).toBeUndefined();
        expect(actions[1].evidence?.[0].inline?.kind).toBe("RETRY");
    });

    it("offers no Send reminder without the send service", async () => {
        const { service } = setup({ noSending: true });
        const actions = [action("PAYMENTS_OVERDUE_INVOICES", [ev("inv_1")])];
        await service.decorate(actions, OWNER, NOW);
        expect(actions[0].evidence?.[0].inline).toBeUndefined();
    });
});
