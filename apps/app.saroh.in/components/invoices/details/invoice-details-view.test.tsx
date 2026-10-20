// @vitest-environment jsdom
/**
 * One invoice's details (DEC-173, U9 #1121): the page and the list's side
 * sheet draw the same view. Each state's money card says one thing with
 * its one main button; Share and More hold the rest; "What happened" has
 * the ledger in it; and every action the rules can name does something
 * here (§15: nothing today's page offers is lost).
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionDoes } from "@/components/invoices/details/action-bar";
import type { InvoiceActionId } from "@/lib/invoices/detail-actions";
import type { InvoiceDetails } from "@/lib/invoices/details";
import type { Invoice, InvoicePayment } from "@/lib/invoices/service";

import { InvoiceDetailsView } from "./invoice-details-view";
import { useDetailsActions } from "./use-details-actions";

vi.mock("@/lib/invoices/actions", () => ({
    issueInvoice: vi.fn(),
    setInvoiceLineRates: vi.fn(),
    creditInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    recordPayment: vi.fn(),
    removePayment: vi.fn(),
    chequeCleared: vi.fn(),
    chequeBounced: vi.fn(),
    reissueInvoice: vi.fn(),
    voidInvoice: vi.fn(),
    createPayLink: vi.fn(),
    createViewLink: vi.fn(),
    sendInvoice: vi.fn(),
    remindInvoice: vi.fn(),
    shareInvoice: vi.fn(),
}));
vi.mock("@/lib/gst-rates/actions", () => ({ saveGstRates: vi.fn() }));
vi.mock("@/components/organizations/use-business-details-step", () => ({
    useBusinessDetailsStep: () => ({
        run: <R,>(action: () => Promise<R>) => action(),
        step: null,
    }),
}));
vi.mock("@/components/qr/qr-button", () => ({ QrButton: () => null }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
// The menus open in a portal jsdom can't press: their items are drawn in
// place, each a button that does what its item's onSelect does.
vi.mock("@saroh/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
        <div data-test-menu="">{children}</div>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
        children,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
        <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
        children,
        onSelect,
        disabled,
        asChild,
        variant: _variant,
        ...rest
    }: {
        children: React.ReactNode;
        onSelect?: () => void;
        disabled?: boolean;
        asChild?: boolean;
        variant?: string;
    }) =>
        asChild ? (
            <div role="menuitem">{children}</div>
        ) : (
            <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => onSelect?.()}
                {...rest}
            >
                {children}
            </button>
        ),
}));

const DAY = 86_400_000;
const NOW = Date.now();
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

function invoice(over: Partial<Invoice> = {}): Invoice {
    return {
        id: "inv_1",
        number: "RC/26-27/0106",
        status: "ISSUED",
        standing: "OVERDUE",
        kind: "INVOICE",
        contact: { id: "c_1", name: "Vivek Nair", email: "vivek@example.com" },
        billTo: { name: "Vivek Nair", email: "vivek@example.com" },
        currency: "INR",
        subtotal: "8400.00",
        tax: "0.00",
        total: "8400.00",
        leftToPay: "8400.00",
        paidSoFar: "0.00",
        partlyPaid: false,
        chequeWaiting: false,
        payments: [],
        issuedAt: at(-28),
        dueAt: at(-13),
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        payment: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissuedAsId: null,
        issuedAutomatically: false,
        createdAt: at(-29),
        updatedAt: at(-1),
        summary: null,
        lines: [
            {
                id: "l1",
                description: "Sourdough loaf (trade)",
                quantity: 12,
                unitPrice: "700.00",
                amount: "8400.00",
            },
        ],
        online: {
            providerConnected: true,
            payLinkActive: false,
            payments: [],
        },
        send: {
            channels: [],
            reason: "NO_EMAIL_PROVIDER",
            payOnline: true,
            nextReminderAt: null,
        },
        sent: [],
        shared: [],
        ...over,
    };
}

function details(
    over: Partial<Invoice> = {},
    can = { read: true, write: true },
): InvoiceDetails {
    return {
        invoice: invoice(over),
        others: [],
        business: null,
        businessName: "Rye & Co.",
        can,
        registered: false,
        paymentsOn: true,
        emailNote: null,
    };
}

function cash(over: Partial<InvoicePayment> = {}): InvoicePayment {
    return {
        id: "pay_1",
        amount: "4000.00",
        currency: "INR",
        method: "CASH",
        reference: null,
        note: null,
        receivedAt: at(-8),
        recordedAt: at(-8),
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

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

function show(d: InvoiceDetails, layout: "page" | "sheet" = "page") {
    act(() =>
        root.render(
            <InvoiceDetailsView
                details={d}
                layout={layout}
                onChanged={vi.fn()}
                foot={(menus) => (
                    <>
                        {menus}
                        <button type="button">Next overdue</button>
                    </>
                )}
            />,
        ),
    );
}

const card = () => document.querySelector("[data-money-card]");
const button = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent.trim() === name,
    );
const menu = (kind: "share" | "more") =>
    document
        .querySelector(`[data-menu="${kind}"]`)
        ?.closest("[data-test-menu]")
        ?.querySelector('[role="menu"]');
const items = (kind: "share" | "more") =>
    Array.from(menu(kind)?.querySelectorAll('[role="menuitem"]') ?? []).map(
        (i) => i.firstElementChild?.firstElementChild?.textContent ?? "",
    );

describe("an overdue invoice", () => {
    it("says what to collect, with Record payment and Share on WhatsApp", () => {
        show(details());
        expect(card()?.getAttribute("data-money-card")).toBe("late");
        expect(card()?.textContent).toContain("₹8,400 to collect");
        expect(card()?.textContent).toMatch(/\d+ days late/);
        const main = button("Record payment", card() ?? document);
        expect(main?.disabled).toBe(false);
        expect(button("Share on WhatsApp", card() ?? document)).toBeTruthy();
        // No email of its own: one note under the money, with the way.
        expect(card()?.textContent).toContain("email");
        expect(document.body.textContent).toContain("Next step is yours");
        // Share and More hold the rest.
        expect(items("share")).toEqual(
            expect.arrayContaining(["Email it", "Copy link", "Print"]),
        );
        expect(items("more")).toEqual(
            expect.arrayContaining(["Cancel or correct", "Make a new link"]),
        );
        // The header says how late.
        expect(document.body.textContent).toMatch(/Overdue · \d+ days/);
    });

    it("opens Record payment over the details", () => {
        show(details());
        act(() => button("Record payment", card() ?? document)?.click());
        const dialog = document.querySelector('[role="dialog"]');
        expect(dialog?.textContent).toContain("Record payment");
    });

    it("for a role without money: Record payment is off, and says why", () => {
        show(details({}, { read: true, write: false }));
        const main = button("Record payment", card() ?? document);
        expect(main?.disabled).toBe(true);
        expect(document.body.textContent).toContain(
            "Recording money isn't part of your role.",
        );
        expect(main?.getAttribute("aria-describedby")).toBeTruthy();
        expect(document.body.textContent).not.toContain("Next step is yours");
    });
});

describe("a draft", () => {
    it("issues, edits, and deletes from More with the one confirm", () => {
        show(details({ standing: "DRAFT", status: "DRAFT", number: null }));
        expect(button("Issue it", card() ?? document)).toBeTruthy();
        const edit = Array.from(document.querySelectorAll("a")).find(
            (a) => a.textContent === "Edit",
        );
        expect(edit?.getAttribute("href")).toBe("/billing/invoices/inv_1/edit");
        expect(items("more")).toEqual(["Delete draft"]);
        act(() =>
            menu("more")
                ?.querySelector<HTMLButtonElement>('[data-action="delete"]')
                ?.click(),
        );
        expect(
            document.querySelector('[role="alertdialog"]')?.textContent,
        ).toContain("Delete this draft?");
    });

    it("issues and shares in one step where it can be sent", () => {
        show(
            details({
                standing: "DRAFT",
                status: "DRAFT",
                number: null,
                send: {
                    channels: ["email"],
                    emailTo: "vivek@example.com",
                    payOnline: true,
                    nextReminderAt: null,
                },
            }),
        );
        expect(button("Issue and share", card() ?? document)).toBeTruthy();
        expect(items("more")).toEqual(["Issue it", "Delete draft"]);
    });
});

describe("a paid invoice", () => {
    it("shares the receipt, downloads the PDF, and keeps Refund… in More", () => {
        show(
            details({
                standing: "PAID",
                status: "PAID",
                paidAt: at(-5),
                leftToPay: "0.00",
                paidSoFar: "8400.00",
                payments: [
                    cash({
                        amount: "8400.00",
                        method: "BANK_TRANSFER",
                        reference: "UTR 4581",
                    }),
                ],
            }),
        );
        expect(card()?.getAttribute("data-money-card")).toBe("paid");
        expect(card()?.textContent).toContain("Paid ₹8,400");
        expect(button("Share receipt", card() ?? document)).toBeTruthy();
        expect(button("Download PDF", card() ?? document)).toBeTruthy();
        expect(items("more")).toEqual(
            expect.arrayContaining(["Refund…", "Copy view link", "Print"]),
        );
    });
});

describe("What happened", () => {
    it("strikes a removed payment through, and offers Remove on a live one", () => {
        show(
            details({
                partlyPaid: true,
                leftToPay: "4400.00",
                paidSoFar: "4000.00",
                payments: [
                    cash({
                        id: "gone",
                        amount: "1000.00",
                        canRemove: false,
                        removed: { at: at(-6), reason: "Recorded by mistake" },
                    }),
                    cash(),
                ],
            }),
        );
        const struck = document.querySelector(".line-through");
        expect(struck?.textContent).toContain("Part payment ₹1,000 · cash");
        expect(document.body.textContent).toContain(
            "Payment of ₹1,000 removed · Recorded by mistake",
        );
        const remove = Array.from(document.querySelectorAll("button")).filter(
            (b) => b.textContent === "Remove this payment",
        );
        expect(remove).toHaveLength(1);
        act(() => remove[0]?.click());
        const dialog = document.querySelector('[role="dialog"]');
        expect(dialog?.textContent).toContain("Remove this payment");
        expect(dialog?.textContent).toContain("₹4,000 by cash");
    });

    it("a reader sees no Remove", () => {
        show(details({ payments: [cash()] }, { read: true, write: false }));
        expect(document.body.textContent).not.toContain("Remove this payment");
    });
});

describe("in the side sheet", () => {
    it("draws the same card, the paper under it, and the menus in its foot", () => {
        show(details(), "sheet");
        expect(document.querySelector("[data-invoice-sheet]")).toBeTruthy();
        expect(card()?.textContent).toContain("₹8,400 to collect");
        expect(
            document.querySelector('[aria-label="The invoice"]')?.textContent,
        ).toContain("Sourdough loaf (trade)");
        const foot = document.querySelector("[data-sheet-foot]");
        expect(foot?.querySelector('[data-menu="share"]')).toBeTruthy();
        expect(foot?.querySelector('[data-menu="more"]')).toBeTruthy();
        expect(foot?.textContent).toContain("Next overdue");
        // No page header inside a sheet.
        expect(document.querySelector("h1")).toBeNull();
    });
});

/** Every action the rules can name (`InvoiceActionId`). */
const EVERY: InvoiceActionId[] = [
    "issueAndShare",
    "issue",
    "edit",
    "delete",
    "recordPayment",
    "whatsapp",
    "send",
    "remind",
    "emailReceipt",
    "copyLink",
    "copyViewLink",
    "newLink",
    "pdf",
    "print",
    "cancel",
    "shareReceipt",
    "markCleared",
    "markBounced",
    "removePayment",
    "refund",
    "refundOrder",
    "writeAgain",
];

describe("every action does something (§15)", () => {
    it("each id the rules name has a press or a link here", () => {
        let does: ActionDoes | null = null;
        function Probe() {
            does = useDetailsActions({
                details: details({ order: { id: "o_1", number: "12" } }),
                onChanged: vi.fn(),
                print: vi.fn(),
            }).does;
            return null;
        }
        act(() => root.render(<Probe />));
        const got = does as ActionDoes | null;
        const missing = EVERY.filter((id) => !got?.[id] && !got?.hrefs?.[id]);
        expect(missing).toEqual([]);
    });
});
