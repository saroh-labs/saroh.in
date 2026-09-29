import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CheckoutOutcome,
    CheckoutRequest,
    OpenCheckout,
} from "../booking-flow/checkout";
import { BuyPackSheet } from "./buy-pack-sheet";
import type { AccountPlanTab, AccountView } from "./model";
import type {
    AccountPackAttempt,
    AccountPackCheckout,
    AccountPackOnSale,
    AccountPacksOnSale,
    PacksApi,
} from "./packs-api";
import { packTermsLine } from "./packs-api";
import type { PlanApi } from "./plan-api";
import { PlanTab } from "./plan-tab";

/**
 * Buying a class pack from the account's Plan tab in jsdom (round-2 plan
 * A, A11): "Buy a pack" only when packs are on sale, the design's pack
 * sheet, the provider window opened on the server's payment, the wait for
 * the webhook, and the refusals said in the customer's words. The look is
 * the browser pass's.
 */

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account/plan",
}));

// The page's own provider window, answered by whichever test set it.
const pageWindow: { open: OpenCheckout | null } = { open: null };
vi.mock("../booking-flow/checkout", () => ({
    openProviderCheckout: ((request) => {
        if (!pageWindow.open) throw new Error("no window set");
        return pageWindow.open(request);
    }) as OpenCheckout,
}));

beforeEach(() => {
    router.push.mockReset();
    router.refresh.mockReset();
    pageWindow.open = null;
});

async function press(element: Element | undefined | null) {
    if (!element) throw new Error("nothing to press");
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

const ACCOUNT: AccountView = {
    name: "Farah Khan",
    email: "farah@example.in",
    phone: null,
    businessName: "Pulse Fitness",
    tabs: [
        { key: "home", label: "Home" },
        { key: "plan", label: "Plan" },
        { key: "me", label: "Me" },
    ],
    offers: { appointments: true, orders: false, plans: true },
    bookingsLabel: "Bookings",
    healthNotes: false,
};

const TEN: AccountPackOnSale = {
    ref: "pack_10",
    name: "10-class pack",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "4500.00",
    currency: "INR",
};

const FIVE: AccountPackOnSale = {
    ref: "pack_5",
    name: "Drop-in 5",
    description: "Any class, any day.",
    credits: 5,
    validityDays: 30,
    price: "2500.00",
    currency: "INR",
};

const EMPTY_TAB: AccountPlanTab = {
    subscriptions: { ok: true, value: [] },
    packs: { ok: true, value: [] },
    pauseWeeks: [2, 4, 8],
};

const STARTED: AccountPackCheckout = {
    ref: "inv_1",
    pack: { name: "10-class pack", credits: 10, validityDays: 60 },
    total: "4500.00",
    currency: "INR",
    payment: {
        provider: "RAZORPAY",
        amountCents: 450000,
        currency: "INR",
        providerIntentId: "order_1",
        publicKey: "rzp_test_1",
        clientParams: { razorpayOrderId: "order_1" },
    },
};

const BOUGHT: AccountPackAttempt = {
    state: "bought",
    pack: { name: "10-class pack", credits: 10 },
    expiresAt: "2026-11-30T10:00:00.000Z",
};

const PLAN_API: PlanApi = {
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    payNow: vi.fn(),
};

function packsApi(over: Partial<PacksApi> = {}): PacksApi {
    return {
        buy: vi.fn().mockResolvedValue({ ok: true, data: STARTED }),
        standing: vi.fn().mockResolvedValue({ ok: true, data: BOUGHT }),
        ...over,
    };
}

/** A provider window the test answers by hand. */
function fakeWindow() {
    const requests: CheckoutRequest[] = [];
    let answer: (outcome: CheckoutOutcome) => void = () => undefined;
    const open: OpenCheckout = (request) => {
        requests.push(request);
        return {
            outcome: new Promise<CheckoutOutcome>((resolve) => {
                answer = resolve;
            }),
            close: vi.fn(),
        };
    };
    return {
        open,
        requests,
        answer: async (outcome: CheckoutOutcome) => {
            await act(async () => {
                answer(outcome);
                await Promise.resolve();
            });
        },
    };
}

function sheet(
    onSale: AccountPacksOnSale,
    api: PacksApi,
    win = fakeWindow(),
    onBought = vi.fn(),
) {
    render(
        <BuyPackSheet
            open
            onClose={vi.fn()}
            onSale={onSale}
            businessName="Pulse Fitness"
            customer={{ name: "Farah Khan", email: "farah@example.in" }}
            api={api}
            onBought={onBought}
            openCheckout={win.open}
        />,
    );
    return { win, onBought };
}

describe("Buy a pack on the Plan tab", () => {
    it("shows the Class packs card with no packs held, and Buy a pack, when packs are on sale", async () => {
        render(
            <PlanTab
                account={ACCOUNT}
                tab={EMPTY_TAB}
                api={PLAN_API}
                packs={{
                    onSale: { payOnline: true, packs: [TEN] },
                    api: packsApi(),
                }}
            />,
        );
        const card = screen
            .getByRole("heading", { name: "Class packs" })
            .closest("section");
        if (!(card instanceof HTMLElement)) throw new Error("no packs card");
        expect(within(card).getByText("No packs.")).toBeTruthy();
        await press(screen.getByRole("button", { name: "Buy a pack" }));
        expect(
            screen.getByRole("dialog", { name: "10-class pack" }),
        ).toBeTruthy();
    });

    it("has no Buy a pack, nor a packs card, when nothing is on sale", () => {
        render(
            <PlanTab
                account={ACCOUNT}
                tab={EMPTY_TAB}
                api={PLAN_API}
                packs={{
                    onSale: { payOnline: true, packs: [] },
                    api: packsApi(),
                }}
            />,
        );
        expect(screen.queryByText("Class packs")).toBeNull();
        expect(screen.queryByRole("button", { name: "Buy a pack" })).toBeNull();
    });

    it("says the pack is bought and reads the tab again once the payment lands", async () => {
        const win = fakeWindow();
        pageWindow.open = win.open;
        const api = packsApi();
        render(
            <PlanTab
                account={ACCOUNT}
                tab={EMPTY_TAB}
                api={PLAN_API}
                packs={{ onSale: { payOnline: true, packs: [TEN] }, api }}
                apiUrl="https://api.test"
            />,
        );
        await press(screen.getByRole("button", { name: "Buy a pack" }));
        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));
        await win.answer("paid");

        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toBe(
                "10-class pack bought. Book a class to use one.",
            ),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(router.refresh).toHaveBeenCalled();
        // The window's return goes to the API (P1).
        expect(win.requests[0]?.apiUrl).toBe("https://api.test");
    });
});

describe("BuyPackSheet", () => {
    it("draws the design's pack sheet: name, terms, price and Buy", () => {
        sheet({ payOnline: true, packs: [TEN] }, packsApi());
        const dialog = screen.getByRole("dialog", { name: "10-class pack" });
        expect(
            within(dialog).getByText("10 credits to use within 60 days."),
        ).toBeTruthy();
        expect(within(dialog).getByText("Price")).toBeTruthy();
        expect(within(dialog).getByText("₹4,500")).toBeTruthy();
        expect(
            within(dialog).getByRole("button", { name: "Buy · ₹4,500" }),
        ).toBeTruthy();
        // Saroh names no ways to pay (DEC-059).
        expect(dialog.textContent).not.toMatch(/UPI|card/i);
    });

    it("opens the provider window on the server's payment, then waits for the webhook", async () => {
        const api = packsApi();
        const { win, onBought } = sheet({ payOnline: true, packs: [TEN] }, api);

        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));

        expect(api.buy).toHaveBeenCalledWith("pack_10", expect.any(String));
        expect(win.requests).toHaveLength(1);
        expect(win.requests[0]).toMatchObject({
            handoff: STARTED.payment,
            business: "Pulse Fitness",
            description: "10-class pack · 10 classes",
            booker: { name: "Farah Khan", email: "farah@example.in" },
        });
        expect(
            screen.getByRole("button", { name: "Payment window open…" }),
        ).toBeTruthy();

        await win.answer("paid");
        await waitFor(() =>
            expect(onBought).toHaveBeenCalledWith(
                "10-class pack bought. Book a class to use one.",
            ),
        );
        expect(api.standing).toHaveBeenCalledWith("inv_1");
    });

    it("opens the same payment again after the window was closed", async () => {
        const api = packsApi();
        const { win } = sheet({ payOnline: true, packs: [TEN] }, api);
        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));
        await win.answer("closed");

        expect(
            screen.getByText("The payment window closed before you paid."),
        ).toBeTruthy();
        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));
        expect(api.buy).toHaveBeenCalledTimes(1);
        expect(win.requests).toHaveLength(2);
    });

    it("says a refused payment plainly, and nothing was taken", async () => {
        const { win } = sheet({ payOnline: true, packs: [TEN] }, packsApi());
        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));
        await win.answer("failed");
        expect(screen.getByRole("alert").textContent).toBe(
            "The payment didn't go through. Nothing was taken — try again.",
        );
    });

    it("says when the payment closed before it was confirmed", async () => {
        const api = packsApi({
            standing: vi.fn().mockResolvedValue({
                ok: true,
                data: { ...BOUGHT, state: "closed", expiresAt: null },
            }),
        });
        const { win, onBought } = sheet({ payOnline: true, packs: [TEN] }, api);
        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));
        await win.answer("paid");
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toMatch(
                /This payment has closed, so nothing was bought/,
            ),
        );
        expect(onBought).not.toHaveBeenCalled();
    });

    it("shows the server's refusal in the customer's words", async () => {
        const api = packsApi({
            buy: vi.fn().mockResolvedValue({
                ok: false,
                message: "You've started paying for 3 packs without finishing.",
            }),
        });
        const { win } = sheet({ payOnline: true, packs: [TEN] }, api);
        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));
        expect(screen.getByRole("alert").textContent).toBe(
            "You've started paying for 3 packs without finishing.",
        );
        expect(win.requests).toHaveLength(0);
    });

    it("lets the customer pick among several packs in the same sheet", async () => {
        const api = packsApi();
        sheet({ payOnline: true, packs: [FIVE, TEN] }, api);
        expect(screen.getByRole("dialog", { name: "Buy a pack" })).toBeTruthy();
        const group = screen.getByRole("radiogroup", { name: "Pack" });
        expect(within(group).getAllByRole("radio")).toHaveLength(2);
        expect(screen.getByText("Any class, any day.")).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Buy · ₹2,500" }),
        ).toBeTruthy();

        await press(
            within(group).getByRole("radio", { name: /10-class pack/ }),
        );
        await press(screen.getByRole("button", { name: "Buy · ₹4,500" }));
        expect(api.buy).toHaveBeenCalledWith("pack_10", expect.any(String));
    });

    it("sends the customer to the desk, with no pay button, when the business takes no payment online", () => {
        sheet({ payOnline: false, packs: [TEN] }, packsApi());
        expect(
            screen.getByText(
                "Pulse Fitness sells packs at the desk. Your credits start when you pay there.",
            ),
        ).toBeTruthy();
        expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
    });
});

describe("the pack sheet's words", () => {
    it("says the credits and the days, singular or plural", () => {
        expect(packTermsLine({ credits: 10, validityDays: 60 })).toBe(
            "10 credits to use within 60 days.",
        );
        expect(packTermsLine({ credits: 1, validityDays: 1 })).toBe(
            "1 credit to use within 1 day.",
        );
    });
});
