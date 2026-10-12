import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AutopayOutcome } from "../autopay/api";
import { AutopayDone } from "../autopay/done";
import type { OpenCheckout } from "../booking-flow/checkout";
import type { GstOnPrice } from "../lib/gst-price";
import { AccountHome } from "./account-home";
import { BuyPackSheet } from "./buy-pack-sheet";
import type { AccountInvoiceDue } from "./details-model";
import { invoiceGstLine, invoiceLine, invoiceTitle } from "./details-model";
import { InvoicesDue } from "./invoices-due";
import type {
    AccountPlan,
    AccountSubscription,
    AccountView,
    AccountHome as HomeData,
} from "./model";
import { planGstLine, planPrice } from "./model";
import type { AccountPackOnSale, PacksApi } from "./packs-api";
import { PlanTab } from "./plan-tab";

/**
 * GST in the customer's account, said before they pay: the plan's next
 * renewal as it will be charged (the Plan tab and Home), an invoice still
 * to pay, the Buy a pack sheet, and the amount autopay takes next. Each way
 * a business can price, and unchanged where the API says nothing about
 * GST. The numbers are the API's: ₹2,000 at 18% added is ₹2,360, and
 * ₹2,000 including 18% has ₹305.08 of GST inside.
 */

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account/plan",
}));

beforeEach(() => {
    router.refresh.mockReset();
});

async function press(element: Element) {
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

const ADDED: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 200000,
    gstCents: 36000,
    payCents: 236000,
};
const INCLUDED: GstOnPrice = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 200000,
    gstCents: 30508,
    payCents: 200000,
};

const ACCOUNT: AccountView = {
    name: "Farah Khan",
    email: "farah.khan@example.com",
    phone: null,
    businessName: "Pulse Fitness",
    tabs: [
        { key: "home", label: "Home" },
        { key: "plan", label: "Plan" },
        { key: "me", label: "Your details" },
    ],
    offers: { appointments: true, orders: false, plans: true },
    bookingsLabel: "Bookings",
    healthNotes: false,
};

const PLAN: AccountPlan = {
    ref: "sub_1",
    name: "Monthly 8",
    price: "2000.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    // The start of 18 Oct in Kolkata.
    renewsAt: "2026-10-17T18:30:00.000Z",
    pausedUntil: null,
    endsAt: null,
    timezone: "Asia/Kolkata",
};

const SUB: AccountSubscription = {
    ...PLAN,
    classes: null,
    payNow: null,
    canPause: true,
    canResume: false,
    canCancel: true,
};

const PLAN_API = {
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    payNow: vi.fn(),
};

function planTab(sub: AccountSubscription) {
    return render(
        <PlanTab
            account={ACCOUNT}
            tab={{
                subscriptions: { ok: true, value: [sub] },
                packs: { ok: true, value: [] },
                pauseWeeks: [2, 4, 8],
            }}
            api={PLAN_API}
        />,
    );
}

describe("the plan's words in the account", () => {
    it("each renewal's amount to pay, and the GST in or on it", () => {
        expect(planPrice({ ...PLAN, gst: ADDED })).toBe("₹2,360 / month");
        expect(planGstLine({ ...PLAN, gst: ADDED })).toBe(
            "₹2,000 + ₹360 GST (18%)",
        );
        expect(planPrice({ ...PLAN, gst: INCLUDED })).toBe("₹2,000 / month");
        expect(planGstLine({ ...PLAN, gst: INCLUDED })).toBe(
            "Includes ₹305.08 GST (18%)",
        );
    });

    it("nothing said: the price as before, and no line", () => {
        for (const gst of [undefined, null, "18", { mode: "ADDED" }]) {
            const plan = { ...PLAN, gst } as AccountPlan;
            expect(planPrice(plan)).toBe("₹2,000 / month");
            expect(planGstLine(plan)).toBeNull();
        }
    });
});

describe("the Plan tab", () => {
    it("GST added: the renewal as it will be charged, and the sum under it", () => {
        planTab({ ...SUB, gst: ADDED });
        expect(
            screen.getByText("Monthly 8 · ₹2,360 / month"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Next payment 18 Oct 2026"),
        ).toBeInTheDocument();
        expect(screen.getByText("₹2,000 + ₹360 GST (18%)")).toBeInTheDocument();
    });

    it("GST included: the price they are on, and the GST inside it", () => {
        planTab({ ...SUB, gst: INCLUDED });
        expect(
            screen.getByText("Monthly 8 · ₹2,000 / month"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Includes ₹305.08 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("nothing said about GST: the markup it always was", () => {
        const before = planTab(SUB).container.innerHTML;
        expect(before).not.toMatch(/GST/);
        expect(before).not.toContain("data-price-gst");
        const after = planTab({ ...SUB, gst: null }).container.innerHTML;
        expect(after).toBe(before);
    });
});

function home(plan: AccountPlan): HomeData {
    return {
        nextBooking: { ok: true, value: null },
        classes: { ok: true, value: null },
        orders: { ok: true, value: [] },
        plan: { ok: true, value: plan },
    };
}

const HOME_API = {
    payInvoice: vi.fn().mockResolvedValue({ ok: false, message: "" }),
    leaveLine: vi.fn().mockResolvedValue({ ok: false, message: "" }),
};

function homePlan(plan: AccountPlan) {
    const view = render(
        <AccountHome account={ACCOUNT} home={home(plan)} api={HOME_API} />,
    );
    return {
        card: screen.getByRole("region", { name: "Membership" }),
        view,
    };
}

describe("Home's plan", () => {
    it("GST added: the renewal as it will be charged, and the sum under it", () => {
        const { card } = homePlan({ ...PLAN, gst: ADDED });
        expect(
            within(card).getByText("Monthly 8 · ₹2,360 / month"),
        ).toBeInTheDocument();
        expect(card).toHaveTextContent("Next payment 18 Oct 2026");
        expect(
            within(card).getByText("₹2,000 + ₹360 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("GST included: the GST inside the price", () => {
        const { card } = homePlan({ ...PLAN, gst: INCLUDED });
        expect(
            within(card).getByText("Monthly 8 · ₹2,000 / month"),
        ).toBeInTheDocument();
        expect(
            within(card).getByText("Includes ₹305.08 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("nothing said about GST: the markup it always was", () => {
        const before = homePlan(PLAN);
        const was = before.card.outerHTML;
        expect(was).not.toMatch(/GST/);
        before.view.unmount();
        expect(homePlan({ ...PLAN, gst: null }).card.outerHTML).toBe(was);
    });
});

const INVOICE: AccountInvoiceDue = {
    ref: "inv_1",
    number: "INV-0042",
    what: "Monthly 8, November",
    issuedAt: "2026-10-01T05:00:00.000Z",
    dueAt: "2026-10-08T05:00:00.000Z",
    overdue: false,
    total: "2360.00",
    currency: "INR",
    billOfSupply: false,
    pay: "online",
};

function toPay(invoice: AccountInvoiceDue) {
    const view = render(
        <InvoicesDue
            invoices={{ ok: true, value: [invoice] }}
            businessName="Pulse Fitness"
            payNow={vi.fn()}
        />,
    );
    return { card: screen.getByRole("region", { name: "To pay" }), view };
}

describe("a To pay row", () => {
    it("GST added: the amount to pay in the title, and the sum under its line", () => {
        const { card } = toPay({ ...INVOICE, gst: ADDED });
        expect(
            within(card).getByText("Invoice INV-0042 · ₹2,360"),
        ).toBeInTheDocument();
        expect(card).toHaveTextContent("Monthly 8, November · Due 8 Oct 2026");
        expect(
            within(card).getByText("₹2,000 + ₹360 GST (18%)"),
        ).toBeInTheDocument();
        expect(
            within(card).getByRole("button", {
                name: "Pay invoice INV-0042 now",
            }),
        ).toBeInTheDocument();
    });

    it("GST included: the GST inside the amount", () => {
        const { card } = toPay({
            ...INVOICE,
            total: "2000.00",
            gst: INCLUDED,
        });
        expect(
            within(card).getByText("Invoice INV-0042 · ₹2,000"),
        ).toBeInTheDocument();
        expect(
            within(card).getByText("Includes ₹305.08 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("the words, each way and with nothing said", () => {
        expect(invoiceGstLine({ ...INVOICE, gst: ADDED })).toBe(
            "₹2,000 + ₹360 GST (18%)",
        );
        expect(invoiceGstLine({ ...INVOICE, gst: INCLUDED })).toBe(
            "Includes ₹305.08 GST (18%)",
        );
        for (const gst of [undefined, null, { mode: "INCLUDED" }]) {
            const invoice = { ...INVOICE, gst } as AccountInvoiceDue;
            expect(invoiceGstLine(invoice)).toBeNull();
            // The title and the line never change with it.
            expect(invoiceTitle(invoice)).toBe("Invoice INV-0042 · ₹2,360");
            expect(invoiceLine(invoice, "Pulse Fitness")).toBe(
                "Monthly 8, November · Due 8 Oct 2026",
            );
        }
    });

    it("nothing said about GST: the markup it always was", () => {
        const before = toPay(INVOICE);
        const was = before.card.outerHTML;
        expect(was).not.toMatch(/GST/);
        before.view.unmount();
        expect(toPay({ ...INVOICE, gst: null }).card.outerHTML).toBe(was);
    });
});

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
    description: null,
    credits: 5,
    validityDays: 30,
    price: "2000.00",
    currency: "INR",
};
const TEN_ADDED: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 450000,
    gstCents: 81000,
    payCents: 531000,
};
const TEN_INCLUDED: GstOnPrice = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 450000,
    gstCents: 68644,
    payCents: 450000,
};

/** A provider window that stays open, so the sheet stays on screen. */
const openWindow: OpenCheckout = () => ({
    outcome: new Promise<never>(() => undefined),
    close: vi.fn(),
});

function packSheet(packs: AccountPackOnSale[], api?: Partial<PacksApi>) {
    const buy = vi.fn<PacksApi["buy"]>();
    const view = render(
        <BuyPackSheet
            open
            onClose={vi.fn()}
            onSale={{ payOnline: true, packs }}
            businessName="Pulse Fitness"
            customer={{ name: "Farah Khan", email: "farah.khan@example.com" }}
            api={{ buy, standing: vi.fn(), ...api }}
            onBought={vi.fn()}
            openCheckout={openWindow}
        />,
    );
    return { dialog: screen.getByRole("dialog"), view, buy };
}

describe("the Buy a pack sheet", () => {
    it("GST added: the amount to pay, the sum under it, and Buy names what is paid", () => {
        const { dialog } = packSheet([{ ...TEN, gst: TEN_ADDED }]);
        expect(within(dialog).getByText("₹5,310")).toBeInTheDocument();
        expect(
            within(dialog).getByText("₹4,500 + ₹810 GST (18%)"),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole("button", { name: "Buy · ₹5,310" }),
        ).toBeInTheDocument();
    });

    it("GST included: the price, the GST inside it, and the same amount on Buy", () => {
        const { dialog } = packSheet([{ ...TEN, gst: TEN_INCLUDED }]);
        expect(within(dialog).getByText("₹4,500")).toBeInTheDocument();
        expect(
            within(dialog).getByText("Includes ₹686.44 GST (18%)"),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole("button", { name: "Buy · ₹4,500" }),
        ).toBeInTheDocument();
    });

    it("with several packs, each choice names its amount to pay and the GST follows the one picked", async () => {
        const { dialog } = packSheet([
            { ...FIVE, gst: INCLUDED },
            { ...TEN, gst: TEN_ADDED },
        ]);
        const group = within(dialog).getByRole("radiogroup", { name: "Pack" });
        expect(group).toHaveTextContent(
            "5 classes · use within 30 days · ₹2,000",
        );
        expect(group).toHaveTextContent(
            "10 classes · use within 60 days · ₹5,310",
        );
        expect(
            within(dialog).getByText("Includes ₹305.08 GST (18%)"),
        ).toBeInTheDocument();
        await press(
            within(group).getByRole("radio", { name: /10-class pack/ }),
        );
        expect(
            within(dialog).getByText("₹4,500 + ₹810 GST (18%)"),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole("button", { name: "Buy · ₹5,310" }),
        ).toBeInTheDocument();
    });

    it("once the payment has started, says the server's own total and GST", async () => {
        // The sheet listed the pack before the business added GST to it.
        const { dialog, buy } = packSheet([TEN], {});
        buy.mockResolvedValue({
            ok: true,
            data: {
                ref: "inv_1",
                pack: { name: "10-class pack", credits: 10, validityDays: 60 },
                total: "5310.00",
                currency: "INR",
                gst: TEN_ADDED,
                payment: {
                    provider: "RAZORPAY",
                    amountCents: 531000,
                    currency: "INR",
                    providerIntentId: "order_1",
                    publicKey: "rzp_test_1",
                    clientParams: {},
                },
            },
        });
        await press(
            within(dialog).getByRole("button", { name: "Buy · ₹4,500" }),
        );
        expect(within(dialog).getByText("₹5,310")).toBeInTheDocument();
        expect(
            within(dialog).getByText("₹4,500 + ₹810 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("nothing said about GST: the markup it always was", () => {
        // React numbers each render's ids; they are not the sheet's words.
        const markup = (el: HTMLElement) =>
            el.outerHTML.replace(/_r_\w+_/g, "_id_");
        const before = packSheet([TEN, FIVE]);
        const was = markup(before.dialog);
        expect(was).not.toMatch(/GST/);
        before.view.unmount();
        const after = packSheet([
            { ...TEN, gst: null },
            { ...FIVE, gst: null },
        ]);
        expect(markup(after.dialog)).toBe(was);
    });
});

describe("the page after autopay is set up", () => {
    const OUTCOME: AutopayOutcome = {
        plan: "Monthly 8",
        autopay: {
            state: "ON",
            method: "UPI",
            hint: "fa•••@okicici",
            check: null,
        },
        paid: true,
        nextPaymentAt: "2026-11-17T18:30:00.000Z",
        // The amount to pay, GST and all, as the API sends it.
        nextAmount: "2360.00",
        currency: "INR",
        timezone: "Asia/Kolkata",
    };

    it("says the next payment as it will be charged", () => {
        const initial = { kind: "outcome" as const, outcome: OUTCOME };
        render(
            <AutopayDone
                businessName="Pulse Fitness"
                initial={initial}
                read={() => Promise.resolve(initial)}
                accountHref="/account/plan"
                retryHref="/account/plan"
            />,
        );
        expect(
            screen.getByText(
                "Autopay is on with UPI (fa•••@okicici). Next payment ₹2,360 on 18 Nov 2026.",
            ),
        ).toBeInTheDocument();
    });
});
