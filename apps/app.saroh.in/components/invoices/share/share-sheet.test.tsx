// @vitest-environment jsdom
/**
 * Share one invoice (DEC-173, INVShareA, U11 #1123): WhatsApp opens
 * `wa.me` with the API's message, the number is asked for when there is
 * none, one reminder a day holds the button until the time the API gave,
 * email goes only through the business's own provider, a copy says
 * "Copied" on its button, and a void, a draft or a role that only reads
 * gets the paper and the reason.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetLinks } from "@/lib/invoices/minted-links";
import type { ShareInvoice } from "@/lib/invoices/share";
import {
    CANT_SHARE,
    EMAIL_OWN_PROVIDER,
    NEXT_REMINDER_AFTER,
} from "@/lib/invoices/words";

import { ShareSheet } from "./share-sheet";

const actions = {
    shareInvoice: vi.fn(),
    sendInvoice: vi.fn(),
    remindInvoice: vi.fn(),
};
vi.mock("@/lib/invoices/actions", () => ({
    shareInvoice: (...a: unknown[]) => actions.shareInvoice(...a) as unknown,
    sendInvoice: (...a: unknown[]) => actions.sendInvoice(...a) as unknown,
    remindInvoice: (...a: unknown[]) => actions.remindInvoice(...a) as unknown,
    createPayLink: vi.fn(),
    createViewLink: vi.fn(),
    issueInvoice: vi.fn(),
    setInvoiceLineRates: vi.fn(),
}));
vi.mock("@/lib/gst-rates/actions", () => ({ saveGstRates: vi.fn() }));
vi.mock(
    "@/components/organizations/business-details/use-business-details-step",
    () => ({
        useBusinessDetailsStep: () => ({
            run: <R,>(action: () => Promise<R>) => action(),
            step: null,
        }),
    }),
);
vi.mock("@/components/gst-rates/use-gst-rate-step", () => ({
    useGstRateStep: () => ({
        run: <R,>(action: () => Promise<R>) => action(),
        step: null,
    }),
}));
vi.mock("@/components/qr/link-qr/qr-button", () => ({ QrButton: () => null }));
const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toast = {
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(() => "t1"),
};
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    showSuccess: (...a: unknown[]) => toast.showSuccess(...a) as unknown,
    showUndo: (...a: unknown[]) => toast.showUndo(...(a as [])) as unknown,
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));
const copied: string[] = [];
vi.mock("@saroh/ui/copy-button", () => ({
    copyText: (text: string) => {
        copied.push(text);
        return Promise.resolve(true);
    },
    copyFailedMessage: () => "Couldn't copy.",
}));

const PHONE = "+919845011234";
const MESSAGE =
    "Hi Vivek, this is Rye & Co. Your invoice RC/26-27/0106 for ₹8,400 was due on 7 Oct. You can see it and pay here: https://rye.saroh.app/i/7Kq2 Thank you.";

function inv(over: Partial<ShareInvoice> = {}): ShareInvoice {
    return {
        id: "inv_106",
        number: "RC/26-27/0106",
        standing: "OVERDUE",
        kind: "INVOICE",
        source: "MANUAL",
        currency: "INR",
        total: "8400.00",
        leftToPay: "8400.00",
        paidSoFar: "0.00",
        dueAt: "2026-10-07T06:30:00Z",
        contact: { id: "c_1", name: "Vivek Nair", email: "vivek@example.com" },
        billTo: { name: "Vivek Nair", email: "vivek@example.com" },
        updatedAt: "2026-10-19T06:30:00Z",
        send: {
            channels: [],
            reason: "NO_EMAIL_PROVIDER",
            payOnline: true,
            nextReminderAt: null,
            phone: PHONE,
        },
        online: { providerConnected: true, payLinkActive: false, payments: [] },
        sent: [],
        ...over,
    };
}

function shared(over: Record<string, unknown> = {}) {
    return {
        ok: true,
        data: {
            channel: "WHATSAPP",
            kind: "REMINDER",
            url: "https://rye.saroh.app/i/7Kq2",
            text: MESSAGE,
            phone: PHONE,
            whatsappUrl: `https://wa.me/919845011234?text=${encodeURIComponent(MESSAGE)}`,
            payOnline: true,
            email: null,
            sharedAt: "2026-10-20T06:30:00Z",
            ...over,
        },
    };
}

let root: Root;
let host: HTMLDivElement;
const onOpenChange = vi.fn();
const onDone = vi.fn();
const onPrint = vi.fn();
let tab: { opener: unknown; location: { href: string }; close: () => void };
const openSpy = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        ...Object.values(actions),
        toast.showError,
        toast.showSuccess,
        onOpenChange,
        onDone,
        onPrint,
        openSpy,
    ]) {
        fn.mockReset();
    }
    toast.showUndo.mockReset();
    toast.showUndo.mockReturnValue("t1");
    copied.length = 0;
    forgetLinks();
    tab = { opener: {}, location: { href: "about:blank" }, close: vi.fn() };
    openSpy.mockReturnValue(tab);
    window.open = openSpy;
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }),
    });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function flush() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
}

async function draw(props: Partial<Parameters<typeof ShareSheet>[0]> = {}) {
    await act(async () => {
        root.render(
            <ShareSheet
                open
                onOpenChange={onOpenChange}
                invoice={inv()}
                business="Rye & Co."
                can={{ write: true }}
                timeZone="Asia/Kolkata"
                onPrint={onPrint}
                onDone={onDone}
                {...props}
            />,
        );
        await flush();
    });
}

const sheet = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("The sheet is not open");
    return el as HTMLElement;
};

function button(name: string): HTMLButtonElement {
    const hit = Array.from(sheet().querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

async function press(name: string) {
    await act(async () => {
        button(name).click();
        await flush();
    });
}

async function openTab(name: string) {
    const hit = Array.from(
        sheet().querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ).find((b) => b.textContent.trim() === name);
    if (!hit) throw new Error(`No tab ${name}`);
    await act(async () => {
        hit.click();
        await flush();
    });
}

const radio = (name: string) => {
    const hit = Array.from(
        sheet().querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((b) => b.textContent.trim() === name);
    if (!hit) throw new Error(`No choice ${name}`);
    return hit;
};

function type(input: HTMLInputElement, value: string) {
    act(() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the input below
        const set = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set;
        set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("WhatsApp", () => {
    it("names the invoice, previews the reminder with its amount and due date, and opens wa.me with the API's message", async () => {
        actions.shareInvoice.mockResolvedValue(shared());
        await draw();
        const text = sheet().textContent;
        expect(text).toContain("Share RC/26-27/0106");
        expect(text).toContain("Vivek Nair · ₹8,400 ·");
        expect(radio("Reminder").getAttribute("aria-checked")).toBe("true");
        const preview = sheet().querySelector("[data-preview]")?.textContent;
        expect(preview).toContain("for ₹8,400 was due on 7 Oct.");
        expect(preview).toContain("link made when you share");
        expect(text).toContain("You press send there");
        expect(sheet().querySelector("[data-to]")?.textContent).toContain(
            "Vivek Nair",
        );

        await press("Open WhatsApp");
        expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank");
        expect(actions.shareInvoice).toHaveBeenCalledWith("inv_106", {
            channel: "WHATSAPP",
            kind: "REMINDER",
        });
        expect(tab.location.href.startsWith("https://wa.me/91")).toBe(true);
        expect(tab.location.href).toContain(encodeURIComponent(MESSAGE));
        expect(tab.opener).toBeNull();
        expect(onDone).toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("shares the message chosen: New invoice", async () => {
        actions.shareInvoice.mockResolvedValue(shared({ kind: "NEW" }));
        await draw();
        await act(async () => {
            radio("New invoice").click();
            await flush();
        });
        expect(sheet().querySelector("[data-preview]")?.textContent).toContain(
            "Here is your invoice RC/26-27/0106 for ₹8,400",
        );
        await press("Open WhatsApp");
        expect(actions.shareInvoice).toHaveBeenCalledWith("inv_106", {
            channel: "WHATSAPP",
            kind: "NEW",
        });
    });

    it("with no number, waits until one is typed, then opens a chat with it", async () => {
        actions.shareInvoice.mockResolvedValue(
            shared({ phone: null, whatsappUrl: null }),
        );
        await draw({
            invoice: inv({
                send: {
                    channels: [],
                    reason: "NO_EMAIL_PROVIDER",
                    payOnline: true,
                    nextReminderAt: null,
                },
            }),
        });
        expect(button("Open WhatsApp").disabled).toBe(true);
        expect(sheet().textContent).toContain(
            "Type Vivek's number to open WhatsApp.",
        );
        // Copy message still works without a number.
        expect(button("Copy message").disabled).toBe(false);
        const input = sheet().querySelector<HTMLInputElement>(
            'input[type="tel"], input[inputmode="tel"]',
        );
        if (!input) throw new Error("No number field");
        type(input, "98450 11234");
        expect(button("Open WhatsApp").disabled).toBe(false);
        await press("Open WhatsApp");
        expect(
            tab.location.href.startsWith("https://wa.me/919845011234?text="),
        ).toBe(true);
    });

    it("reminded today: the API's 429 turns the button off and says when the next can go", async () => {
        actions.shareInvoice.mockResolvedValue({
            ok: false,
            error: "One reminder a day. The next can go after tomorrow, 9:30 am.",
            retryAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        await draw();
        await press("Open WhatsApp");
        expect(tab.close).toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(button("Open WhatsApp").disabled).toBe(true);
        expect(sheet().textContent).toContain(NEXT_REMINDER_AFTER);
        // A new invoice's message isn't a reminder: it can still go.
        await act(async () => {
            radio("New invoice").click();
            await flush();
        });
        expect(button("Open WhatsApp").disabled).toBe(false);
    });

    it("reminded today by email, before anyone presses", async () => {
        await draw({
            invoice: inv({
                send: {
                    channels: ["email"],
                    emailTo: "vivek@example.com",
                    payOnline: true,
                    nextReminderAt: new Date(
                        Date.now() + 3_600_000,
                    ).toISOString(),
                    phone: PHONE,
                },
            }),
        });
        expect(button("Open WhatsApp").disabled).toBe(true);
        expect(sheet().textContent).toContain(NEXT_REMINDER_AFTER);
        expect(actions.shareInvoice).not.toHaveBeenCalled();
    });

    it("Copy message says Copied on its button, and Open WhatsApp then sends that same link", async () => {
        actions.shareInvoice.mockResolvedValue(shared());
        await draw();
        await press("Copy message");
        expect(copied).toEqual([MESSAGE]);
        expect(button("Copied")).toBeTruthy();
        expect(toast.showSuccess).not.toHaveBeenCalled();
        expect(sheet().querySelector("[data-preview]")?.textContent).toBe(
            MESSAGE,
        );
        await press("Open WhatsApp");
        expect(actions.shareInvoice).toHaveBeenCalledTimes(1);
        expect(tab.location.href).toContain("wa.me/919845011234");
    });

    it("a paid invoice opens on the thank-you, and New invoice is off with why", async () => {
        await draw({
            invoice: inv({
                standing: "PAID",
                paidSoFar: "8400.00",
                leftToPay: "0.00",
            }),
            kind: "RECEIPT",
        });
        expect(radio("Thank you, paid").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(radio("New invoice").disabled).toBe(true);
        expect(sheet().textContent).toContain(
            "This invoice is paid. Share the receipt instead.",
        );
        expect(sheet().querySelector("[data-preview]")?.textContent).toContain(
            "It is now paid in full.",
        );
    });
});

describe("Email", () => {
    it("with no provider: one message and Connect email, nothing to press", async () => {
        await draw();
        await openTab("Email");
        const note = sheet().querySelector("[data-no-provider]");
        expect(note?.textContent).toContain(EMAIL_OWN_PROVIDER);
        const connect = note?.querySelector("a");
        expect(connect?.textContent).toBe("Connect email");
        expect(connect?.getAttribute("href")).toBe("/settings/providers");
        expect(button("Email it").disabled).toBe(true);
    });

    it("a role that can't connect sees the message without the link", async () => {
        await draw({
            emailNote: { text: "Ask an owner to connect email.", action: null },
        });
        await openTab("Email");
        expect(sheet().querySelector("[data-no-provider] a")).toBeNull();
    });

    it("sends a reminder through the business's own email, held ten seconds with Undo", async () => {
        await draw({
            invoice: inv({
                send: {
                    channels: ["email"],
                    emailTo: "vivek@example.com",
                    payOnline: true,
                    nextReminderAt: null,
                },
                sent: [
                    {
                        id: "s1",
                        channel: "email",
                        to: "vivek@example.com",
                        at: "2026-10-10T06:30:00Z",
                        reminder: false,
                        status: "SENT",
                    },
                ],
            }),
        });
        await openTab("Email");
        expect(sheet().textContent).toContain("vivek@example.com");
        await press("Email a reminder");
        expect(toast.showUndo).toHaveBeenCalled();
        // Nothing goes until the ten seconds are up.
        expect(actions.remindInvoice).not.toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("emails the receipt of a paid invoice, held with Undo", async () => {
        await draw({
            invoice: inv({
                standing: "PAID",
                paidSoFar: "8400.00",
                leftToPay: "0.00",
            }),
            emailConnected: true,
        });
        await openTab("Email");
        await press("Email the receipt");
        expect(toast.showUndo).toHaveBeenCalled();
        expect(actions.shareInvoice).not.toHaveBeenCalled();
    });
});

describe("Link", () => {
    it("Copy link makes a fresh link, copies it, says Copied and shows it", async () => {
        actions.shareInvoice.mockResolvedValue(
            shared({ channel: "LINK", text: MESSAGE }),
        );
        await draw();
        await openTab("Link");
        await press("Copy link");
        expect(actions.shareInvoice).toHaveBeenCalledWith("inv_106", {
            channel: "LINK",
            kind: "REMINDER",
        });
        expect(copied).toEqual(["https://rye.saroh.app/i/7Kq2"]);
        expect(button("Copied")).toBeTruthy();
        expect(sheet().querySelector("[data-link-box]")?.textContent).toContain(
            "https://rye.saroh.app/i/7Kq2",
        );
    });

    it("a link out that this tab can't show is replaced only after the one confirm", async () => {
        await draw({
            invoice: inv({
                online: {
                    providerConnected: true,
                    payLinkActive: true,
                    payments: [],
                },
            }),
        });
        await openTab("Link");
        expect(sheet().textContent).toContain("can't be shown again");
        await press("Make a new link");
        expect(actions.shareInvoice).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain(
            "The link that's out stops working straight away",
        );
    });
});

describe("PDF", () => {
    it("Print logs the share and prints the paper", async () => {
        actions.shareInvoice.mockResolvedValue(
            shared({ channel: "PRINT", url: null, text: null }),
        );
        await draw();
        await openTab("PDF");
        await press("Print");
        expect(actions.shareInvoice).toHaveBeenCalledWith("inv_106", {
            channel: "PRINT",
            kind: "REMINDER",
        });
        expect(onPrint).toHaveBeenCalled();
    });
});

describe("what can't be shared", () => {
    it("a void invoice opens on its paper and says why", async () => {
        await draw({ invoice: inv({ standing: "VOID" }) });
        const selected = sheet().querySelector(
            '[role="tab"][aria-selected="true"]',
        );
        expect(selected?.textContent).toBe("PDF");
        expect(sheet().textContent).toContain(
            "A void invoice isn't shared. You can still download or print it.",
        );
        await openTab("WhatsApp");
        expect(button("Open WhatsApp").disabled).toBe(true);
        // Printing a void one isn't logged: the API refuses its share.
        await openTab("PDF");
        await press("Print");
        expect(actions.shareInvoice).not.toHaveBeenCalled();
        expect(onPrint).toHaveBeenCalled();
    });

    it("a draft has no PDF yet and isn't shared", async () => {
        await draw({ invoice: inv({ standing: "DRAFT", number: null }) });
        expect(sheet().textContent).toContain(
            "Issue the invoice before sharing it.",
        );
        expect(button("Download PDF").disabled).toBe(true);
    });

    it("a role that only reads gets the paper; sharing is off with why", async () => {
        await draw({ can: { write: false } });
        const selected = sheet().querySelector(
            '[role="tab"][aria-selected="true"]',
        );
        expect(selected?.textContent).toBe("PDF");
        expect(button("Download PDF").disabled).toBe(false);
        await openTab("WhatsApp");
        expect(button("Open WhatsApp").disabled).toBe(true);
        expect(sheet().textContent).toContain(CANT_SHARE);
        await openTab("Link");
        expect(button("Copy link").disabled).toBe(true);
        await openTab("Email");
        expect(sheet().textContent).toContain(CANT_SHARE);
    });
});
