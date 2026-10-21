import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
    AccountDataRequest,
    AskDataRequest,
    DataRequestResult,
} from "./data-request";
import { confirmWords, DataRequestCard, sentWords } from "./data-request";
import type { MeApi } from "./me";
import { Me } from "./me";
import type { AccountView } from "./model";

/**
 * "Ask to remove my data" on Your details (DEC-172, #1107; U14), in
 * jsdom: the confirmation is a real dialog that says receipts and invoices
 * are kept as the law requires, Cancel gives the keyboard back to the
 * button, Send shows the sent state, a refusal is said inside the dialog,
 * and an open request is drawn sent from the start.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/account/me",
}));

async function press(element: HTMLElement) {
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

const BUSINESS = "Prana Yoga";

const OPEN: AccountDataRequest = {
    ref: "cdr_1",
    status: "open",
    askedAt: "2026-10-19T06:00:00.000Z",
    handledAt: null,
};

function card(
    request: { ok: true; value: AccountDataRequest | null } | { ok: false },
    ask: AskDataRequest = vi
        .fn<AskDataRequest>()
        .mockResolvedValue({ ok: true, request: OPEN }),
) {
    render(
        <DataRequestCard request={request} businessName={BUSINESS} ask={ask} />,
    );
    return ask;
}

const askButton = () =>
    screen.getByRole("button", { name: "Ask to remove my data" });

describe("Ask to remove my data", () => {
    it("says what the business can remove, and that receipts and invoices are kept", () => {
        card({ ok: true, value: null });
        const region = screen.getByRole("region", { name: "Your data" });
        expect(region).toHaveTextContent(
            "Prana Yoga can remove your account and details. Receipts and invoices are kept as the law requires.",
        );
        expect(askButton()).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens a dialog that says receipts and invoices are kept as the law requires", async () => {
        card({ ok: true, value: null });
        await press(askButton());
        const dialog = screen.getByRole("dialog", {
            name: "Ask Prana Yoga to remove your data?",
        });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleDescription(confirmWords(BUSINESS));
        expect(confirmWords(BUSINESS)).toBe(
            "We'll ask Prana Yoga to remove your details. We'll email you to confirm, and again when it's done. Receipts and invoices are kept as the law requires.",
        );
        expect(
            within(dialog).getByRole("button", { name: "Send request" }),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole("button", { name: "Cancel" }),
        ).toBeInTheDocument();
    });

    it("Cancel closes it, sends nothing and gives focus back to the button", async () => {
        const ask = card({ ok: true, value: null });
        const button = askButton();
        button.focus();
        await press(button);
        await press(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(ask).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(askButton());
    });

    it("Escape closes it too", async () => {
        card({ ok: true, value: null });
        await press(askButton());
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Send request asks once, then shows the sent state with its date", async () => {
        const ask = card({ ok: true, value: null });
        await press(askButton());
        await press(screen.getByRole("button", { name: "Send request" }));
        expect(ask).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).toBeNull();
        const region = screen.getByRole("region", { name: "Your data" });
        expect(region).toHaveTextContent("Request sent.");
        expect(region).toHaveTextContent(
            "Request sent on 19 Oct 2026. We've emailed you a confirmation.",
        );
        // Nothing to ask again while it is open.
        expect(
            screen.queryByRole("button", { name: "Ask to remove my data" }),
        ).toBeNull();
    });

    it("a refused send is said inside the dialog, which stays open to try again", async () => {
        const ask = vi.fn<AskDataRequest>().mockResolvedValue({
            ok: false,
            message:
                "You've asked several times already. Try again tomorrow, or contact the business.",
        });
        card({ ok: true, value: null }, ask);
        await press(askButton());
        await press(screen.getByRole("button", { name: "Send request" }));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByRole("alert")).toHaveTextContent(
            "You've asked several times already.",
        );
        expect(
            within(dialog).getByRole("button", { name: "Send request" }),
        ).toBeEnabled();
        // The card still offers it: nothing was sent.
        expect(
            screen.getByRole("region", { name: "Your data" }),
        ).not.toHaveTextContent("Request sent.");
    });

    it("a send that couldn't reach the business says so, without losing the dialog", async () => {
        const ask = vi
            .fn<AskDataRequest>()
            .mockRejectedValue(new Error("offline"));
        card({ ok: true, value: null }, ask);
        await press(askButton());
        await press(screen.getByRole("button", { name: "Send request" }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't reach the business. Try again in a moment.",
        );
    });

    it("an open request is drawn sent from the start, with no button", () => {
        card({ ok: true, value: OPEN });
        const region = screen.getByRole("region", { name: "Your data" });
        expect(region).toHaveTextContent(sentWords(OPEN.askedAt));
        expect(
            screen.queryByRole("button", { name: "Ask to remove my data" }),
        ).toBeNull();
    });

    it("a request closed without removal shows its date and offers the button again", () => {
        card({
            ok: true,
            value: {
                ref: "cdr_1",
                status: "closed",
                askedAt: "2026-10-10T06:00:00.000Z",
                handledAt: "2026-10-12T06:00:00.000Z",
            },
        });
        const region = screen.getByRole("region", { name: "Your data" });
        expect(region).toHaveTextContent(
            "Prana Yoga closed your request of 10 Oct 2026 on 12 Oct 2026 without removing your data. You can ask again.",
        );
        expect(askButton()).toBeInTheDocument();
    });

    it("a read that failed says so, and still lets them ask", () => {
        card({ ok: false });
        expect(
            screen.getByText(/Your request couldn't be loaded/),
        ).toBeInTheDocument();
        expect(askButton()).toBeInTheDocument();
    });

    it("the button is a secondary one: the card never takes the page's filled button", () => {
        card({ ok: true, value: null });
        expect(askButton().className).not.toContain("bg-site-accent");
    });
});

const ACCOUNT: AccountView = {
    name: "Asha",
    email: "asha@example.com",
    phone: null,
    businessName: BUSINESS,
    tabs: [{ key: "me", label: "Your details" }],
    offers: { appointments: true, orders: false, plans: true },
    bookingsLabel: "Bookings",
    healthNotes: false,
};

function meApi(extra: Partial<MeApi> = {}): MeApi {
    const nope = () => Promise.resolve({ ok: false as const, message: "" });
    return {
        updateDetails: nope,
        emailChange: {
            requestCode: vi.fn(),
            verifyCode: vi.fn(),
        },
        addNote: nope,
        signOut: () => Promise.resolve({ ok: true }),
        signOutEverywhere: () => Promise.resolve({ ok: true }),
        payInvoice: nope,
        saveNotices: nope,
        ...extra,
    };
}

const OPTIONS = {
    businessName: BUSINESS,
    phone: null,
    challenge: { required: false, siteKey: null },
};

describe("Your details with the request", () => {
    it("draws the Your data card when the page passes the request and the action", () => {
        render(
            <Me
                account={ACCOUNT}
                receipts={{ ok: true, value: [] }}
                notes={null}
                dataRequest={{ ok: true, value: null }}
                options={OPTIONS}
                api={meApi({
                    askDataRemoval: vi.fn<AskDataRequest>().mockResolvedValue({
                        ok: true,
                        request: OPEN,
                    } satisfies DataRequestResult),
                })}
            />,
        );
        expect(
            screen.getByRole("region", { name: "Your data" }),
        ).toBeInTheDocument();
    });

    it("an older caller without them draws no card", () => {
        render(
            <Me
                account={ACCOUNT}
                receipts={{ ok: true, value: [] }}
                notes={null}
                options={OPTIONS}
                api={meApi()}
            />,
        );
        expect(screen.queryByRole("region", { name: "Your data" })).toBeNull();
    });
});
