import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    mutate: vi.fn(),
    orgBase: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch: http.apiFetch,
    mutate: http.mutate,
    orgBase: http.orgBase,
}));

import type { CustomerEmail, CustomerEmails } from "./customer-emails";
import {
    CUSTOMER_EMAIL_LABELS,
    CUSTOMER_EMAILS_NO_EMAIL,
    CUSTOMER_EMAILS_READ_ONLY,
    customerEmailLabel,
    customerEmailLocked,
    customerEmailSaved,
    customerEmailsNote,
    customerEmailsRow,
    customerEmailsSheetLine,
    customerEmailWhy,
    isCustomerEmails,
    withCustomerEmail,
} from "./customer-emails";
import {
    readCustomerEmails,
    setCustomerEmail,
} from "./customer-emails-service";

const email = (
    kind: string,
    over: Partial<CustomerEmail> = {},
): CustomerEmail => ({
    kind,
    label: CUSTOMER_EMAIL_LABELS[kind] ?? kind,
    says: `What ${kind} sends.`,
    on: kind !== "OVERDUE_REMINDERS",
    default: kind !== "OVERDUE_REMINDERS",
    offered: true,
    reason: null,
    why: null,
    ...over,
});

const state = (over: Partial<CustomerEmails> = {}): CustomerEmails => ({
    notices: [
        email("RENEWAL_INVOICE"),
        email("MEMBERSHIP"),
        email("REFUND"),
        email("OVERDUE_REMINDERS"),
    ],
    canChange: true,
    emailConnected: true,
    ...over,
});

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
    http.apiFetch.mockReset();
    http.mutate.mockReset();
    http.orgBase.mockReset();
    http.orgBase.mockResolvedValue("/organizations/org_1");
});

describe("when the row is drawn", () => {
    it("only while the business is offered at least one email", () => {
        expect(customerEmailsRow(state())).not.toBe(null);
        // None Saroh sends yet, or every one's module off: no row at all,
        // so nobody is shown a switch that does nothing.
        expect(customerEmailsRow(state({ notices: [] }))).toBe(null);
        // Unread: never guessed.
        expect(customerEmailsRow(null)).toBe(null);
        expect(customerEmailsRow(undefined)).toBe(null);
    });
});

describe("what the row says", () => {
    it("how many are on, and which are not sent", () => {
        expect(customerEmailsRow(state())).toEqual({
            status: "3 on, 1 off",
            allOff: false,
            says: "Not sent: Overdue reminders.",
            line: null,
        });
    });

    it("every one on", () => {
        const all = state({
            notices: [email("MEMBERSHIP"), email("REFUND")],
        });
        expect(customerEmailsRow(all)).toMatchObject({
            status: "All on",
            says: "Each one is sent as it happens.",
            allOff: false,
        });
    });

    it("every one off, said as a warning", () => {
        const none = state({
            notices: [
                email("MEMBERSHIP", { on: false }),
                email("REFUND", { on: false }),
            ],
        });
        expect(customerEmailsRow(none)).toMatchObject({
            status: "All off",
            says: "Your customers get none of these.",
            allOff: true,
            line: null,
        });
    });

    it("names up to three that are off, then counts the rest", () => {
        const off = (kinds: string[]) =>
            customerEmailsRow(
                state({
                    notices: [
                        email("TEAM_REPLY"),
                        ...kinds.map((k) => email(k, { on: false })),
                    ],
                }),
            )?.says;
        expect(off(["REFUND", "MEMBERSHIP"])).toBe(
            "Not sent: Refunds and Membership emails.",
        );
        expect(off(["REFUND", "MEMBERSHIP", "COURSE"])).toBe(
            "Not sent: Refunds, Membership emails and Course emails.",
        );
        expect(off(["REFUND", "MEMBERSHIP", "COURSE", "PACK_CREDITS"])).toBe(
            "Not sent: Refunds, Membership emails and 2 more.",
        );
    });

    it("with no email provider, one quiet line: none go out yet", () => {
        expect(customerEmailsRow(state({ emailConnected: false }))?.line).toBe(
            CUSTOMER_EMAILS_NO_EMAIL,
        );
        expect(CUSTOMER_EMAILS_NO_EMAIL).toBe(
            "None of these go out until your email is connected.",
        );
    });

    it("someone who can't change them reads why, unless the email line is already there", () => {
        expect(customerEmailsRow(state({ canChange: false }))?.line).toBe(
            "Your role can read these emails but not change them. An owner or admin can change this in Settings › Team.",
        );
        // One line, never two: no email first.
        expect(
            customerEmailsRow(
                state({ canChange: false, emailConnected: false }),
            )?.line,
        ).toBe(CUSTOMER_EMAILS_NO_EMAIL);
    });

    it("all off with no email provider: nothing to warn about going out", () => {
        const none = state({
            emailConnected: false,
            notices: [email("REFUND", { on: false })],
        });
        expect(customerEmailsRow(none)?.line).toBe(null);
    });
});

describe("what the sheet says", () => {
    it("one note at most, and only with no email provider", () => {
        expect(customerEmailsNote(state())).toBe(null);
        expect(customerEmailsNote(state({ emailConnected: false }))).toBe(
            "None of these go out until your email is connected. What you choose here still saves.",
        );
        expect(
            customerEmailsNote(
                state({ emailConnected: false, canChange: false }),
            ),
        ).toBe(CUSTOMER_EMAILS_NO_EMAIL);
    });

    it("the line under the title: switches save as flipped, or why they can't", () => {
        expect(customerEmailsSheetLine(state())).toBe(
            "Each switch saves as you flip it.",
        );
        expect(customerEmailsSheetLine(state({ canChange: false }))).toBe(
            CUSTOMER_EMAILS_READ_ONLY,
        );
    });

    it("a switch not offered says why, unless the note already does", () => {
        const enquiry = email("ENQUIRY_REPLY", {
            offered: false,
            reason: "NO_EMAIL",
            why: "Connect your email first",
        });
        // No email: the sheet's note says it once.
        expect(
            customerEmailWhy(enquiry, state({ emailConnected: false })),
        ).toBe(null);
        // A reason the note doesn't cover is said on the row.
        expect(
            customerEmailWhy(
                { ...enquiry, reason: "OTHER", why: "Not yet" },
                state(),
            ),
        ).toBe("Not yet");
        expect(customerEmailWhy(email("REFUND"), state())).toBe(null);
    });

    it("a switch is fixed for someone who can't change it, or when not offered", () => {
        expect(customerEmailLocked(email("REFUND"), state())).toBe(false);
        expect(
            customerEmailLocked(email("REFUND"), state({ canChange: false })),
        ).toBe(true);
        expect(
            customerEmailLocked(email("REFUND", { offered: false }), state()),
        ).toBe(true);
        // No email provider alone doesn't fix it: the choice still saves.
        expect(
            customerEmailLocked(
                email("REFUND"),
                state({ emailConnected: false }),
            ),
        ).toBe(false);
    });

    it("the toast says which, and which way", () => {
        expect(customerEmailSaved("Membership emails", false)).toBe(
            "Membership emails turned off.",
        );
        expect(customerEmailSaved("Back in stock", true)).toBe(
            "Back in stock turned on.",
        );
    });

    it("moves one switch and leaves the rest", () => {
        const moved = withCustomerEmail(state(), {
            kind: "MEMBERSHIP",
            on: false,
        });
        expect(moved.notices.map((n) => n.on)).toEqual([
            true,
            false,
            true,
            false,
        ]);
        expect(state().notices[1]?.on).toBe(true);
    });
});

describe("the names Activity uses", () => {
    it("every kind the API lists has one, and nothing else does", () => {
        expect(Object.keys(CUSTOMER_EMAIL_LABELS)).toEqual([
            "RENEWAL_INVOICE",
            "AUTOPAY_FAILED",
            "MEMBERSHIP",
            "REFUND",
            "TEAM_REPLY",
            "ENQUIRY_REPLY",
            "ORDER_DELIVERY",
            "COURSE",
            "PACK_CREDITS",
            "BACK_IN_STOCK",
            "OVERDUE_REMINDERS",
        ]);
        expect(customerEmailLabel("REFUND")).toBe("Refunds");
        expect(customerEmailLabel("NOPE")).toBe(null);
        expect(customerEmailLabel(7)).toBe(null);
    });
});

describe("reading them", () => {
    it("reads the list, who may change it, and the email", async () => {
        http.apiFetch.mockResolvedValue(json(state()));
        expect(await readCustomerEmails()).toEqual(state());
        expect(http.apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/customer-notices/settings",
        );
    });

    it.each([
        ["a refusal", () => json({}, 403)],
        ["an API without it", () => new Response("", { status: 404 })],
        ["a failure", () => json({}, 500)],
        ["a body missing a fact", () => json({ notices: [], canChange: true })],
        [
            "a switch missing a fact",
            () =>
                json({
                    ...state(),
                    notices: [{ kind: "REFUND", on: true }],
                }),
        ],
        ["a body that isn't JSON", () => new Response("<html>")],
    ])("%s reads as nothing to draw", async (_what, answer) => {
        http.apiFetch.mockResolvedValue(answer());
        expect(await readCustomerEmails()).toBe(null);
    });

    it("an API that can't be reached, or no business open, reads as nothing", async () => {
        http.apiFetch.mockRejectedValue(new Error("offline"));
        expect(await readCustomerEmails()).toBe(null);
        http.orgBase.mockResolvedValue(null);
        expect(await readCustomerEmails()).toBe(null);
    });

    it("only a whole answer counts", () => {
        expect(isCustomerEmails(state())).toBe(true);
        expect(isCustomerEmails(state({ notices: [] }))).toBe(true);
        expect(isCustomerEmails(null)).toBe(false);
        expect(isCustomerEmails({ notices: "all" })).toBe(false);
    });
});

describe("saving one", () => {
    it("sends the kind and a real boolean", async () => {
        http.mutate.mockResolvedValue({ ok: true, data: state() });
        await setCustomerEmail({ kind: "MEMBERSHIP", on: false });
        expect(http.mutate).toHaveBeenCalledWith(
            "/customer-notices/settings",
            "PATCH",
            { kind: "MEMBERSHIP", on: false },
            "Couldn't save that. Try again.",
        );
    });
});
