import type { RenderedPacks, RenderedPlans } from "@saroh/block-contract";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PacksApi } from "../account/packs-api";
import type { PublicPack } from "../blocks/packs";
import PacksSection from "../blocks/packs";
import type { PublicPlan } from "../blocks/plans";
import PlansSection from "../blocks/plans";
import type { OpenCheckout } from "../booking-flow/checkout";
import type { GstOnPrice } from "../lib/gst-price";
import { TestReleaseProvider } from "../test-release/context";
import type { JoinApi, PlanJoinStarted, PricesActions } from "./api";
import { packBrowsePrice, packPayPrice, packPerClass } from "./pack-words";
import { planBrowsePrice, planPrice } from "./plan-words";

/**
 * GST on a plan and on a class pack, said before the customer pays: the
 * cards on the Prices page, the join sheet and the Buy a pack sheet, each
 * way a business can price (GST in its prices, or added to them), and
 * unchanged where the API says nothing about GST. The numbers are the
 * API's: ₹2,000 at 18% added is ₹2,360, and ₹2,000 including 18% has
 * ₹305.08 of GST inside.
 */

// The page's own provider window: left open, so the sheet stays on screen.
const pageWindow: { open: OpenCheckout | null } = { open: null };
vi.mock("../booking-flow/checkout", () => ({
    openProviderCheckout: ((request) => {
        if (!pageWindow.open) throw new Error("no window set");
        return pageWindow.open(request);
    }) as OpenCheckout,
}));

beforeEach(() => {
    pageWindow.open = vi.fn(() => ({
        outcome: new Promise<never>(() => undefined),
        close: vi.fn(),
    }));
});

async function press(element: Element | undefined | null) {
    if (!element) throw new Error("nothing to press");
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
const PACK_ADDED: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 450000,
    gstCents: 81000,
    payCents: 531000,
};
const PACK_INCLUDED: GstOnPrice = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 450000,
    gstCents: 68644,
    payCents: 450000,
};

const MONTHLY: PublicPlan = {
    id: "plan_monthly",
    name: "Monthly unlimited",
    description: "Every class, every day.",
    price: "2000.00",
    currency: "INR",
    interval: "MONTH",
    mostChosen: true,
};

const TEN: PublicPack = {
    id: "pack_10",
    name: "10 classes",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "4500.00",
    currency: "INR",
    kind: "CLASSES",
    singlePrice: "600.00",
};

const HANDOFF = {
    provider: "RAZORPAY",
    amountCents: 236000,
    currency: "INR",
    providerIntentId: "order_1",
    publicKey: "rzp_test_1",
    clientParams: { razorpayOrderId: "order_1" },
};

function actions(
    over: {
        started?: Partial<PlanJoinStarted>;
        checkout?: { total: string; gst?: GstOnPrice | null };
    } = {},
) {
    const join = vi.fn<JoinApi["join"]>(() =>
        Promise.resolve({
            ok: true as const,
            data: {
                ref: "inv_join",
                plan: { name: "Monthly unlimited", interval: "MONTH" },
                total: "2000.00",
                currency: "INR",
                payment: HANDOFF,
                ...over.started,
            },
        }),
    );
    const packs: PacksApi = {
        buy: vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                data: {
                    ref: "inv_pack",
                    pack: { name: "10 classes", credits: 10, validityDays: 60 },
                    total: "4500.00",
                    currency: "INR",
                    payment: HANDOFF,
                    ...over.checkout,
                },
            }),
        ),
        standing: vi.fn(),
    };
    const prices: PricesActions = {
        businessName: "Pulse Fitness",
        customer: { email: "asha.rao@example.com", name: "Asha" },
        signInOptions: {
            businessName: "Pulse Fitness",
            phone: null,
            challenge: { required: false, siteKey: null },
        },
        signIn: { requestCode: vi.fn(), verifyCode: vi.fn() },
        join: { join, standing: vi.fn() },
        packs,
        accountHref: "/account/plan",
    };
    return { prices, join, packs };
}

const PLANS: RenderedPlans = { variant: "default", title: "Memberships" };
const PACKS: RenderedPacks = { variant: "default", title: "Class packs" };

function planCard(plan: PublicPlan, prices: PricesActions | null) {
    render(
        <PlansSection
            content={PLANS}
            feed={{
                plans: [plan],
                joinHref: "/contact#enquiry",
                payOnline: true,
            }}
            prices={prices}
        />,
    );
    return screen.getByRole("listitem");
}

function packCard(pack: PublicPack, prices: PricesActions | null) {
    render(
        <PacksSection
            content={PACKS}
            feed={{
                packs: [pack],
                payOnline: true,
                askHref: "/contact#enquiry",
            }}
            prices={prices}
        />,
    );
    return screen.getByRole("listitem");
}

describe("a plan's price words", () => {
    it("the amount to pay each period is the API's when GST is added, else the price", () => {
        expect(planPrice({ ...MONTHLY, gst: ADDED })).toBe("₹2,360 / month");
        expect(planPrice({ ...MONTHLY, gst: INCLUDED })).toBe("₹2,000 / month");
        expect(planPrice(MONTHLY)).toBe("₹2,000 / month");
        expect(planPrice({ ...MONTHLY, gst: null })).toBe("₹2,000 / month");
        // Anything strange is nothing said.
        expect(planPrice({ ...MONTHLY, gst: { mode: "ADDED" } })).toBe(
            "₹2,000 / month",
        );
    });

    it("a browsed plan keeps the typed price, with + GST when it comes on top", () => {
        expect(planBrowsePrice({ ...MONTHLY, gst: ADDED })).toBe(
            "₹2,000 / month + GST",
        );
        expect(planBrowsePrice({ ...MONTHLY, gst: INCLUDED })).toBe(
            "₹2,000 / month",
        );
        expect(planBrowsePrice(MONTHLY)).toBe("₹2,000 / month");
    });
});

describe("the plan card beside Join", () => {
    it("GST added: names the amount to pay each period, and the sum under it", () => {
        const card = planCard({ ...MONTHLY, gst: ADDED }, actions().prices);
        expect(within(card).getByText("₹2,360 / month")).toBeInTheDocument();
        expect(
            within(card).getByText("₹2,000 + ₹360 GST (18%)"),
        ).toBeInTheDocument();
        expect(card.textContent).not.toContain("₹2,000 / month");
        expect(
            within(card).getByRole("button", {
                name: "Join: Monthly unlimited",
            }),
        ).toBeInTheDocument();
    });

    it("GST included: the price as typed, and the GST inside it", () => {
        const card = planCard({ ...MONTHLY, gst: INCLUDED }, actions().prices);
        expect(within(card).getByText("₹2,000 / month")).toBeInTheDocument();
        expect(
            within(card).getByText("Includes ₹305.08 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("says nothing about GST where the API says nothing, exactly as before", () => {
        for (const gst of [undefined, null, "18", { mode: "ADDED" }]) {
            const plan = { ...MONTHLY, gst } as PublicPlan;
            const card = planCard(plan, actions().prices);
            expect(within(card).getByText("₹2,000 / month")).toBeTruthy();
            expect(card.querySelector("[data-price-gst]")).toBeNull();
            expect(card.textContent).not.toMatch(/GST/);
            cleanup();
        }
    });

    it("the same card with no GST field is the markup it always was", () => {
        const before = planCard(MONTHLY, actions().prices).outerHTML;
        cleanup();
        const after = planCard({ ...MONTHLY, gst: null }, actions().prices);
        expect(after.outerHTML).toBe(before);
    });

    it("with prices hidden, the card says no amount and no GST", () => {
        render(
            <PlansSection
                content={{ ...PLANS, showPrices: false }}
                feed={{
                    plans: [{ ...MONTHLY, gst: ADDED }],
                    joinHref: null,
                    payOnline: true,
                }}
                prices={actions().prices}
            />,
        );
        expect(screen.getByRole("listitem").textContent).not.toMatch(/₹|GST/);
    });

    it("only browsed (Ask about joining): the typed price, + GST after it when added", () => {
        const card = planCard({ ...MONTHLY, gst: ADDED }, null);
        expect(
            within(card).getByText("₹2,000 / month + GST"),
        ).toBeInTheDocument();
        expect(card.querySelector("[data-price-gst]")).toBeNull();
        expect(
            within(card).getByRole("link", {
                name: "Ask about joining: Monthly unlimited",
            }),
        ).toBeInTheDocument();
    });

    it("only browsed, GST included: the price alone", () => {
        const card = planCard({ ...MONTHLY, gst: INCLUDED }, null);
        expect(within(card).getByText("₹2,000 / month")).toBeInTheDocument();
        expect(card.textContent).not.toMatch(/GST/);
    });

    it("a test release says the amount the live site takes", async () => {
        render(
            <TestReleaseProvider release={{ name: "Diwali menu" }}>
                <PlansSection
                    content={PLANS}
                    feed={{
                        plans: [{ ...MONTHLY, gst: ADDED }],
                        joinHref: null,
                        payOnline: true,
                    }}
                    prices={actions().prices}
                />
            </TestReleaseProvider>,
        );
        await press(screen.getByRole("button", { name: /^Join/ }));
        expect(screen.getByRole("dialog").textContent).toContain(
            "pays ₹2,360 / month to join Monthly unlimited",
        );
    });
});

describe("the join sheet", () => {
    async function open(plan: PublicPlan, over: Parameters<typeof actions>[0]) {
        const made = actions(over);
        planCard(plan, made.prices);
        await press(screen.getByRole("button", { name: /^Join/ }));
        return {
            ...made,
            sheet: screen.getByRole("dialog", { name: "Monthly unlimited" }),
        };
    }

    it("GST added: the amount to pay, the sum under it, and the button names what is paid", async () => {
        const { sheet } = await open({ ...MONTHLY, gst: ADDED }, {});
        expect(within(sheet).getByText("₹2,360")).toBeInTheDocument();
        expect(
            within(sheet).getByText("₹2,000 + ₹360 GST (18%)"),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByRole("button", {
                name: "Start Monthly unlimited · ₹2,360",
            }),
        ).toBeInTheDocument();
        expect(sheet.textContent).not.toContain("· ₹2,000");
    });

    it("GST included: the price, the GST inside it, and the same amount on the button", async () => {
        const { sheet } = await open({ ...MONTHLY, gst: INCLUDED }, {});
        expect(within(sheet).getByText("₹2,000")).toBeInTheDocument();
        expect(
            within(sheet).getByText("Includes ₹305.08 GST (18%)"),
        ).toBeInTheDocument();
        expect(
            within(sheet).getByRole("button", {
                name: "Start Monthly unlimited · ₹2,000",
            }),
        ).toBeInTheDocument();
    });

    it("nothing said about GST: the sheet as it was", async () => {
        const { sheet } = await open(MONTHLY, {});
        expect(sheet.querySelector("[data-price-gst]")).toBeNull();
        expect(sheet.textContent).not.toMatch(/GST/);
        expect(
            within(sheet).getByRole("button", {
                name: "Start Monthly unlimited · ₹2,000",
            }),
        ).toBeInTheDocument();
    });

    it("once the payment has started, says the server's own total and GST", async () => {
        // The page listed the plan before the business added GST to it.
        const { sheet, join } = await open(MONTHLY, {
            started: { total: "2360.00", gst: ADDED },
        });
        await press(
            within(sheet).getByRole("button", {
                name: "Start Monthly unlimited · ₹2,000",
            }),
        );
        expect(join).toHaveBeenCalledTimes(1);
        expect(within(sheet).getByText("₹2,360")).toBeInTheDocument();
        expect(
            within(sheet).getByText("₹2,000 + ₹360 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("with autopay on offer, each choice names the amount to pay", async () => {
        const made = actions();
        render(
            <PlansSection
                content={PLANS}
                feed={{
                    plans: [{ ...MONTHLY, gst: ADDED }],
                    joinHref: null,
                    payOnline: true,
                    autopayMethods: ["UPI"],
                }}
                prices={made.prices}
            />,
        );
        await press(screen.getByRole("button", { name: /^Join/ }));
        const sheet = screen.getByRole("dialog");
        expect(
            within(sheet).getByRole("button", {
                name: "Pay ₹2,360 and turn on autopay",
            }),
        ).toBeInTheDocument();
    });
});

describe("a pack's price words", () => {
    it("the amount to pay is the API's when GST is added, else the price", () => {
        expect(packPayPrice({ ...TEN, gst: PACK_ADDED })).toBe("₹5,310");
        expect(packPayPrice({ ...TEN, gst: PACK_INCLUDED })).toBe("₹4,500");
        expect(packPayPrice(TEN)).toBe("₹4,500");
        expect(packBrowsePrice({ ...TEN, gst: PACK_ADDED })).toBe(
            "₹4,500 + GST",
        );
        expect(packBrowsePrice({ ...TEN, gst: PACK_INCLUDED })).toBe("₹4,500");
        expect(packBrowsePrice(TEN)).toBe("₹4,500");
    });

    it("the line against a single class is left as it was, whatever the GST", () => {
        const line = "₹450 a class instead of ₹600";
        expect(packPerClass(TEN)).toBe(line);
        expect(packPerClass({ ...TEN, gst: PACK_ADDED })).toBe(line);
        expect(packPerClass({ ...TEN, gst: PACK_INCLUDED })).toBe(line);
    });
});

describe("the pack card beside Buy", () => {
    it("GST added: the amount to pay, and the sum under it", () => {
        const card = packCard({ ...TEN, gst: PACK_ADDED }, actions().prices);
        expect(within(card).getByText("₹5,310")).toBeInTheDocument();
        expect(
            within(card).getByText("₹4,500 + ₹810 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("GST included: the price, and the GST inside it", () => {
        const card = packCard({ ...TEN, gst: PACK_INCLUDED }, actions().prices);
        expect(within(card).getByText("₹4,500")).toBeInTheDocument();
        expect(
            within(card).getByText("Includes ₹686.44 GST (18%)"),
        ).toBeInTheDocument();
    });

    it("nothing said about GST: the markup it always was", () => {
        const before = packCard(TEN, actions().prices).outerHTML;
        expect(before).not.toMatch(/GST/);
        cleanup();
        const after = packCard({ ...TEN, gst: null }, actions().prices);
        expect(after.outerHTML).toBe(before);
    });

    it("only browsed (Ask about this pack): the typed price, + GST when added", () => {
        const card = packCard({ ...TEN, gst: PACK_ADDED }, null);
        expect(within(card).getByText("₹4,500 + GST")).toBeInTheDocument();
        expect(card.querySelector("[data-price-gst]")).toBeNull();
    });

    it("Buy opens the sheet with the same amount and GST, then the server's own", async () => {
        const made = actions({
            checkout: { total: "5310.00", gst: PACK_ADDED },
        });
        packCard({ ...TEN, gst: PACK_ADDED }, made.prices);
        await press(screen.getByRole("button", { name: "Buy: 10 classes" }));
        const sheet = screen.getByRole("dialog", { name: "10 classes" });
        expect(within(sheet).getByText("₹5,310")).toBeInTheDocument();
        expect(
            within(sheet).getByText("₹4,500 + ₹810 GST (18%)"),
        ).toBeInTheDocument();
        await press(
            within(sheet).getByRole("button", { name: "Buy · ₹5,310" }),
        );
        expect(made.packs.buy).toHaveBeenCalledTimes(1);
        expect(within(sheet).getByText("₹5,310")).toBeInTheDocument();
        expect(
            within(sheet).getByText("₹4,500 + ₹810 GST (18%)"),
        ).toBeInTheDocument();
    });
});
