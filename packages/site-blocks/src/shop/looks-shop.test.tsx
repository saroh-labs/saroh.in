import type { LookId } from "@saroh/block-contract";
import { LOOK_IDS } from "@saroh/block-contract";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignInApi, SignInOptions } from "../account/api";
import type { OpenCheckout } from "../booking-flow/checkout";
import { pickupReadyWords } from "../lib/shop-facts";
import type { ProductPageData } from "../product/product-page";
import ProductPage from "../product/product-page";
import type { ShopListingCard } from "../product/shop-listing";
import {
    leftWords,
    LookShopListing,
    shopWhenLine,
} from "../product/shop-listing-look";
import { viewport } from "../test-viewport";
import type { CheckoutQuote, CheckoutStarted, ShopCheckoutApi } from "./api";
import { ShopBag } from "./bag";
import { readBagDraft, writeBagDraft } from "./bag-draft-store";
import { EMPTY_DRAFT } from "./bag-sheet";
import { addToBag, readBag } from "./bag-store";
import { LookAddToBag } from "./look-add-to-bag";
import { bagHold, waysLine } from "./look-bag";
import {
    chargeWords,
    checkoutTitle,
    LookCheckout,
    lookPlaceLabel,
    payingWords,
    sameAddress,
} from "./look-checkout";
import { LookOrderPlaced, placedNext } from "./look-placed";
import type { OrderConfirmationData } from "./order-confirmation";
import { SheetFrame } from "./sheet-frame";

/**
 * The shop under each look (DEC-172, plan U11, #1102): the grid, the
 * product's Add to bag and its stepper, the bag that asks nothing about
 * how it leaves, the checkout that asks it once, and Order placed. Classic
 * is pinned by its own suites (`shop.test.tsx`, `bag-look.test.tsx`,
 * `classic-pin.test.tsx`); the last block here checks the switches.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/shop",
}));

const SITE = "site-rye";

/** The checkout's aside Place order button. */
function placeButton(): HTMLElement {
    const button = document.querySelector<HTMLElement>(
        '[data-place-order="aside"]',
    );
    if (!button) throw new Error("no Place order button");
    return button;
}
const LOOKS = LOOK_IDS as readonly LookId[];

beforeEach(() => {
    push.mockReset();
});
afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const card = (over: Partial<ShopListingCard> = {}): ShopListingCard => ({
    slug: "sourdough",
    name: "Country sourdough",
    currency: "INR",
    price: "280.00",
    mrp: null,
    priceFrom: false,
    image: null,
    variantTitles: [],
    blurb: "800 g · whole or sliced",
    categoryName: "Bread",
    soldOut: false,
    listingId: "l-sourdough",
    bagVariantId: null,
    bagLeft: null,
    ...over,
});

const PRODUCTS: ShopListingCard[] = [
    card(),
    card({
        slug: "croissant",
        name: "Croissant",
        price: "140.00",
        listingId: "l-croissant",
        categoryName: "Pastry",
    }),
    card({
        slug: "pain",
        name: "Pain au chocolat",
        soldOut: true,
        listingId: "l-pain",
        categoryName: "Pastry",
    }),
];

function quoteOf(over: Partial<CheckoutQuote> = {}): CheckoutQuote {
    return {
        currency: "INR",
        lines: [
            {
                listingId: "l-sourdough",
                variantId: null,
                slug: "sourdough",
                name: "Country sourdough",
                variantTitle: null,
                image: null,
                unitPrice: "280.00",
                quantity: 1,
                amount: "280.00",
                state: "ok",
                available: null,
            },
            {
                listingId: "l-croissant",
                variantId: null,
                slug: "croissant",
                name: "Croissant",
                variantTitle: null,
                image: null,
                unitPrice: "140.00",
                quantity: 2,
                amount: "280.00",
                state: "ok",
                available: null,
            },
        ],
        ways: [
            { type: "PICKUP", label: "Pick-up", fee: null },
            { type: "LOCAL_DELIVERY", label: "Local delivery", fee: "40.00" },
        ],
        fulfilment: null,
        subtotal: "560.00",
        delivery: "0.00",
        freeDelivery: { over: "800.00", short: "240.00" },
        total: "560.00",
        gst: "27.00",
        ready: false,
        payments: [],
        pickup: {
            address: "3 Hill Road, Indiranagar",
            hours: "Mon to Sun 7am to 8pm",
        },
        ...over,
    };
}

/** The quote as the API answers it for the way asked. */
function quoting(body: { fulfilment?: string }) {
    if (!body.fulfilment) return quoteOf();
    const pickup = body.fulfilment === "PICKUP";
    return quoteOf({
        fulfilment: body.fulfilment as "PICKUP",
        ready: true,
        delivery: pickup ? "0.00" : "40.00",
        total: pickup ? "560.00" : "600.00",
        payments: [
            { type: "ONLINE", label: "Pay online" },
            {
                type: "ON_HANDOVER",
                label: pickup ? "Pay at pick-up" : "Pay on delivery",
            },
        ],
    });
}

const STARTED: CheckoutStarted = {
    orderId: "o-1",
    orderNumber: "RYE-1042",
    total: "560.00",
    currency: "INR",
    payment: null,
};

function makeApi(over: { started?: CheckoutStarted } = {}) {
    const quote = vi.fn((body: { fulfilment?: string }) =>
        Promise.resolve({ ok: true as const, data: quoting(body) }),
    );
    const start = vi.fn(() =>
        Promise.resolve({ ok: true as const, data: over.started ?? STARTED }),
    );
    const standing = vi.fn(() =>
        Promise.resolve({
            ok: true as const,
            data: {
                orderNumber: "RYE-1042",
                state: "placed" as const,
                total: "560.00",
                currency: "INR",
                message: null,
            },
        }),
    );
    const api = { quote, start, standing } as unknown as ShopCheckoutApi;
    return { api, quote, start, standing };
}

const OPTIONS: SignInOptions = {
    businessName: "Rye & Co.",
    phone: null,
    challenge: { required: false, siteKey: null },
};

const SIGN_IN: SignInApi = {
    requestCode: vi.fn(() =>
        Promise.resolve({ ok: true as const, resendAfterSeconds: 30 }),
    ),
    verifyCode: vi.fn(() =>
        Promise.resolve({
            ok: true as const,
            customer: { email: "asha.kumar@example.com", name: "Asha" },
        }),
    ),
};

/** The visit read: Rye's place, 7 am to 8 pm every day, in India. */
function stubVisit() {
    const week = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(
        (day) => ({
            day,
            open: "07:00",
            close: "20:00",
            closed: false,
        }),
    );
    vi.stubGlobal(
        "fetch",
        vi.fn(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        source: "storefront",
                        storeId: "s-1",
                        name: "Rye & Co.",
                        address: "3 Hill Road, Indiranagar",
                        phone: null,
                        hours: week,
                        timezone: "Asia/Kolkata",
                    }),
                    {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    },
                ),
            ),
        ),
    );
}

function fillBag() {
    addToBag(SITE, { listingId: "l-sourdough", variantId: null, quantity: 1 });
    addToBag(SITE, { listingId: "l-croissant", variantId: null, quantity: 2 });
}

// ── The grid ────────────────────────────────────────────────────────────

describe.each(LOOKS)("the shop's grid under %s", (look) => {
    it("adds with an outline, then shows the stepper with what is in the bag", () => {
        render(
            <LookShopListing
                look={look}
                products={PRODUCTS}
                bagSite={SITE}
                askHref="/contact"
            />,
        );
        const grid = document.querySelector(`[data-shop-grid="${look}"]`);
        expect(grid).not.toBeNull();
        // No filled button on the grid: the bag's Check out is the one.
        expect(grid?.querySelector(".bg-site-accent")).toBeNull();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Add Country sourdough to your bag",
            }),
        );
        expect(readBag(SITE)).toEqual([
            { listingId: "l-sourdough", variantId: null, quantity: 1 },
        ]);
        // The stepper means the bag: + adds to it, − takes out, 0 is Add again.
        fireEvent.click(
            screen.getByRole("button", { name: "One more Country sourdough" }),
        );
        expect(readBag(SITE)[0]?.quantity).toBe(2);
        expect(
            screen.getByText("2 Country sourdough in your bag"),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole("button", { name: "One fewer Country sourdough" }),
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Take Country sourdough out of your bag",
            }),
        );
        expect(readBag(SITE)).toEqual([]);
        expect(
            screen.getByRole("button", {
                name: "Add Country sourdough to your bag",
            }),
        ).toBeInTheDocument();
    });

    it("says Sold out in words, with Ask about it and no dead button", () => {
        render(
            <LookShopListing
                look={look}
                products={PRODUCTS}
                bagSite={SITE}
                askHref="/contact"
            />,
        );
        expect(screen.getAllByText("Sold out")).toHaveLength(1);
        expect(
            screen.getByRole("link", { name: "Ask about Pain au chocolat" }),
        ).toHaveAttribute("href", "/contact");
        expect(
            screen.queryByRole("button", { name: /Pain au chocolat/ }),
        ).toBeNull();
    });

    it("draws the owner's cut-off line only when they wrote one", () => {
        const { unmount } = render(
            <LookShopListing
                look={look}
                products={PRODUCTS}
                bagSite={SITE}
                cutOff="Order by 9 pm"
                facts="Pick-up free · Local delivery ₹40"
            />,
        );
        expect(document.querySelector("[data-shop-when]")).toHaveTextContent(
            "Order by 9 pm. Pick-up free · Local delivery ₹40.",
        );
        unmount();
        render(
            <LookShopListing
                look={look}
                products={PRODUCTS}
                bagSite={SITE}
                facts="Pick-up free"
            />,
        );
        expect(document.querySelector("[data-shop-when]")).toHaveTextContent(
            "Pick-up free.",
        );
        expect(screen.queryByText(/Order by/)).toBeNull();
    });

    it("keeps the categories as a real radio group", () => {
        render(
            <LookShopListing look={look} products={PRODUCTS} bagSite={SITE} />,
        );
        const group = screen.getByRole("radiogroup", { name: "Category" });
        fireEvent.click(within(group).getByRole("radio", { name: "Pastry" }));
        expect(screen.queryByText("Country sourdough")).toBeNull();
        expect(screen.getByText("Croissant")).toBeInTheDocument();
    });
});

describe("Live's counts", () => {
    it("are never in the first paint: the cached page carries no count", () => {
        render(
            <LookShopListing
                look="live"
                products={[card({ bagLeft: 3 })]}
                bagSite={SITE}
                apiUrl="https://api.example.com"
            />,
        );
        expect(screen.queryByText("3 left")).toBeNull();
    });

    it("say small true numbers only", () => {
        expect(leftWords(6)).toBeNull();
        expect(leftWords(5)).toBe("5 left");
        expect(leftWords(1)).toBe("Last one");
        expect(leftWords(0)).toBeNull();
        expect(leftWords(null)).toBeNull();
    });
});

describe("the one line about when", () => {
    it("is the owner's words, then the facts, or nothing", () => {
        expect(shopWhenLine("Order by 9 pm.", "Pick-up free")).toBe(
            "Order by 9 pm. Pick-up free.",
        );
        expect(shopWhenLine("  ", null)).toBeNull();
        expect(shopWhenLine(null, "Pick-up free")).toBe("Pick-up free.");
    });
});

// ── The stepper ─────────────────────────────────────────────────────────

describe("the − 1 + stepper", () => {
    it("is 44px a button, whatever the pointer", () => {
        addToBag(SITE, {
            listingId: "l-sourdough",
            variantId: null,
            quantity: 1,
        });
        render(
            <LookShopListing look="quiet" products={PRODUCTS} bagSite={SITE} />,
        );
        const stepper = document.querySelector("[data-bag-stepper]");
        expect(stepper).not.toBeNull();
        const buttons = Array.from(stepper?.querySelectorAll("button") ?? []);
        expect(buttons.length).toBe(2);
        for (const button of buttons) {
            expect(button.className).toMatch(/\bsize-11\b/);
        }
        expect(stepper?.className).toMatch(/\bh-11\b/);
    });
});

// ── The product page ────────────────────────────────────────────────────

const bread: ProductPageData = {
    name: "Country sourdough",
    currency: "INR",
    price: "280.00",
    mrp: null,
    categoryName: "Bread",
    description: null,
    keyPoints: [],
    howToUse: null,
    materials: null,
    maker: null,
    warranty: null,
    returns: null,
    images: [],
    optionName: "Whole or sliced",
    variants: [
        {
            id: "v-whole",
            title: "Whole",
            price: null,
            mrp: null,
            imageId: null,
            stock: "IN_STOCK",
            left: null,
        },
        {
            id: "v-sliced",
            title: "Sliced",
            price: null,
            mrp: null,
            imageId: null,
            stock: "IN_STOCK",
            left: null,
        },
    ],
    stock: null,
    rating: null,
    reviews: [],
};

describe.each(LOOKS)("the product page under %s", (look) => {
    it("adds one, then is the stepper showing the bag, with a note that says so", () => {
        render(
            <ProductPage
                product={bread}
                preview={false}
                look={look}
                action={
                    <LookAddToBag
                        look={look}
                        site={SITE}
                        listingId="l-sourdough"
                    />
                }
            />,
        );
        // The options are a real radio group under a look.
        expect(
            screen.getByRole("radiogroup", { name: "Whole or sliced" }),
        ).toBeInTheDocument();
        const add = screen.getByRole("button", { name: /Add to bag/ });
        expect(add).toHaveAttribute("data-site-primary");
        expect(add).toHaveTextContent("₹280");
        fireEvent.click(add);
        expect(readBag(SITE)).toEqual([
            { listingId: "l-sourdough", variantId: "v-whole", quantity: 1 },
        ]);
        expect(screen.getByText("1 in your bag")).toBeInTheDocument();
        expect(document.querySelector("[data-added-slip]")).toHaveTextContent(
            "Added to your bag",
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Take Country sourdough out of your bag",
            }),
        );
        expect(readBag(SITE)).toEqual([]);
        expect(
            screen.getByRole("button", { name: /Add to bag/ }),
        ).toBeInTheDocument();
    });

    it("sold out: says so, offers Ask about it and the shop, and no button", () => {
        render(
            <ProductPage
                product={{
                    ...bread,
                    variants: bread.variants.map((v) => ({
                        ...v,
                        stock: "SOLD_OUT" as const,
                    })),
                }}
                preview={false}
                look={look}
                action={
                    <LookAddToBag
                        look={look}
                        site={SITE}
                        listingId="l-sourdough"
                        askHref="/contact"
                    />
                }
            />,
        );
        // The page's stock line says it; the action adds only the ways on.
        expect(screen.getAllByText("Sold out").length).toBeGreaterThan(0);
        expect(
            screen.getByRole("link", { name: "Ask about Country sourdough" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Back to the shop" }),
        ).toHaveAttribute("href", "/shop");
        expect(screen.queryByRole("button", { name: /Add to bag/ })).toBeNull();
    });
});

// ── The bag ─────────────────────────────────────────────────────────────

describe.each(LOOKS)("the bag under %s", (look) => {
    it("asks nothing about pick-up or delivery, and checks out to /checkout", async () => {
        fillBag();
        const { api, quote } = makeApi();
        render(
            <ShopBag
                look={look}
                site={SITE}
                businessName="Rye & Co."
                api={api}
                account={{ customer: null, options: OPTIONS, signIn: SIGN_IN }}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Your bag, 3 items" }),
        );
        const sheet = await screen.findByRole("dialog");
        await waitFor(() =>
            expect(within(sheet).getByText("Total so far")).toBeInTheDocument(),
        );
        expect(sheet).toHaveAttribute("data-sheet-look", look);
        // No way, no pay, no address: asked once, in checkout.
        expect(within(sheet).queryByRole("radiogroup")).toBeNull();
        expect(within(sheet).queryByRole("radio")).toBeNull();
        expect(within(sheet).queryByText(/Deliver to/)).toBeNull();
        expect(
            quote.mock.calls.every(([body]) => !("fulfilment" in body)),
        ).toBe(true);
        expect(within(sheet).getByText(/Includes ₹27 GST/)).toHaveTextContent(
            "Pick-up free or local delivery ₹40 (free over ₹800). You choose at checkout.",
        );
        const out = within(sheet).getByRole("link", { name: /Check out/ });
        expect(out).toHaveAttribute("href", "/checkout");
        expect(out).toHaveTextContent("₹560");
        // Its lines' steppers are 44px and stop at one; Remove takes it out.
        const less = within(sheet).getByRole("button", {
            name: "Take Country sourdough out of your bag",
        });
        expect(less).toBeDisabled();
    });

    it("waits on a line that sold out since it was added, and says why", () => {
        const sold = quoteOf({
            lines: quoteOf().lines.map((l, i) =>
                i === 0 ? { ...l, state: "sold-out" as const } : l,
            ),
        });
        expect(bagHold(sold)).toBe("Take out what's sold out to check out.");
        expect(bagHold(quoteOf())).toBeNull();
    });
});

describe("the bag's line about how it reaches you", () => {
    it("names each way's cost once", () => {
        expect(
            waysLine(
                quoteOf({
                    ways: [{ type: "PICKUP", label: "Pick-up", fee: null }],
                }),
            ),
        ).toBe("Pick-up free.");
    });
});

// ── The checkout ────────────────────────────────────────────────────────

describe("pick-up's Ready from, from the business hours", () => {
    const week = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(
        (day) => ({
            day: day as "MON",
            open: "07:00",
            close: "20:00",
            closed: false,
        }),
    );

    it("closed now: the next opening, with its date and no 'tomorrow'", () => {
        // Mon 19 Oct 2026, 9:30 pm in India.
        const now = new Date("2026-10-19T16:00:00Z");
        expect(pickupReadyWords(week, now, "Asia/Kolkata")).toBe(
            "Ready from 7 am Tue 20 Oct.",
        );
    });

    it("before opening: later the same day, still by date", () => {
        // Tue 20 Oct 2026, 6 am in India.
        const now = new Date("2026-10-20T00:30:00Z");
        expect(pickupReadyWords(week, now, "Asia/Kolkata")).toBe(
            "Ready from 7 am Tue 20 Oct.",
        );
    });

    it("open now: any time while open, till closing", () => {
        const now = new Date("2026-10-20T06:30:00Z");
        expect(pickupReadyWords(week, now, "Asia/Kolkata")).toBe(
            "Come for it any time we're open, till 8 pm.",
        );
    });

    it("no hours: nothing is claimed", () => {
        expect(pickupReadyWords(null, new Date(), "Asia/Kolkata")).toBeNull();
    });
});

describe("the place button follows the choice", () => {
    it("names the price and how it is paid", () => {
        expect(
            lookPlaceLabel({
                pay: "ONLINE",
                way: "PICKUP",
                total: "₹560",
                busy: false,
            }),
        ).toBe("Pay ₹560 and place order");
        expect(
            lookPlaceLabel({
                pay: "ON_HANDOVER",
                way: "PICKUP",
                total: "₹560",
                busy: false,
            }),
        ).toBe("Place order · pay ₹560 at pick-up");
        expect(
            lookPlaceLabel({
                pay: "ON_HANDOVER",
                way: "LOCAL_DELIVERY",
                total: "₹600",
                busy: false,
            }),
        ).toBe("Place order · pay ₹600 on delivery");
        expect(chargeWords("ON_HANDOVER", "PICKUP")).toBe(
            "Nothing is charged now. Pay at the counter when you pick it up.",
        );
    });

    it("says only what is known while paying, with UPI's wait and no hold", () => {
        expect(payingWords("confirming", { handover: null }).body).toMatch(
            /UPI app, there's no need to pay again/,
        );
        expect(payingWords("failed", { handover: "Pay at pick-up" }).body).toBe(
            "Nothing was taken. Try again, or choose pay at pick-up.",
        );
        for (const s of [
            "open",
            "confirming",
            "failed",
            "closed",
            "unavailable",
        ] as const) {
            const w = payingWords(s, { handover: null });
            expect(`${w.title} ${w.body}`).not.toMatch(/held|hold|minutes/i);
        }
    });

    it("titles the page per look", () => {
        expect(checkoutTitle("folio", "PICKUP")).toBe("Pick-up and pay");
        expect(checkoutTitle("folio", "LOCAL_DELIVERY")).toBe(
            "Delivery and pay",
        );
        expect(checkoutTitle("quiet", null)).toBe("Your order");
        expect(checkoutTitle("live", null)).toBe("Place your order");
        expect(
            sameAddress("3 Hill Road, Indiranagar", "3 hill road indiranagar"),
        ).toBe(true);
        expect(sameAddress(null, null)).toBe(false);
    });
});

describe.each(LOOKS)("the checkout under %s", (look) => {
    it("asks pick-up or delivery once, then places a pay-at-pick-up order", async () => {
        stubVisit();
        fillBag();
        const { api, start } = makeApi();
        render(
            <LookCheckout
                look={look}
                site={SITE}
                businessName="Rye & Co."
                api={api}
                apiUrl="https://api.example.com"
                account={{
                    customer: { email: "asha.kumar@example.com", name: "Asha" },
                    options: OPTIONS,
                    signIn: SIGN_IN,
                }}
            />,
        );
        const ways = await screen.findByRole("radiogroup", {
            name: "1 · Pick-up or delivery",
        });
        expect(
            screen.getAllByRole("radiogroup", {
                name: "1 · Pick-up or delivery",
            }),
        ).toHaveLength(1);
        fireEvent.click(within(ways).getByRole("radio", { name: /Pick-up/ }));
        await waitFor(() =>
            expect(
                document.querySelector("[data-pickup-ready]"),
            ).toHaveTextContent("At 3 Hill Road, Indiranagar."),
        );
        await waitFor(() =>
            expect(
                document.querySelector("[data-pickup-ready]")?.textContent,
            ).toMatch(
                /^(Ready from \d+ (am|pm) \w{3} \d+ \w{3}\.|Come for it any time)/,
            ),
        );
        expect(screen.getByText(/Ordering as/)).toHaveTextContent(
            "Ordering as Asha · asha.kumar@example.com",
        );

        const pays = await screen.findByRole("radiogroup", {
            name: "3 · How you'll pay",
        });
        // Online first: the button names it.
        expect(
            document.querySelector('[data-place-order="aside"]'),
        ).toHaveTextContent("Pay ₹560 and place order");
        fireEvent.click(
            within(pays).getByRole("radio", { name: /Pay at pick-up/ }),
        );
        const place = placeButton();
        expect(place).toHaveTextContent("Place order · pay ₹560 at pick-up");
        await act(async () => {
            fireEvent.click(place);
            await Promise.resolve();
        });
        expect(start).toHaveBeenCalledWith(
            expect.objectContaining({
                fulfilment: "PICKUP",
                payment: "ON_HANDOVER",
            }),
        );
        await waitFor(() =>
            expect(push).toHaveBeenCalledWith("/shop/order/o-1"),
        );
        expect(readBag(SITE)).toEqual([]);
        expect(readBagDraft(SITE)).toEqual(EMPTY_DRAFT);
    });

    it("signed out: the code first, with the same words for every email", async () => {
        stubVisit();
        fillBag();
        writeBagDraft(SITE, { ...EMPTY_DRAFT, way: "PICKUP" });
        const { api, start } = makeApi();
        render(
            <LookCheckout
                look={look}
                site={SITE}
                businessName="Rye & Co."
                api={api}
                apiUrl="https://api.example.com"
                account={{ customer: null, options: OPTIONS, signIn: SIGN_IN }}
            />,
        );
        await screen.findByRole("radiogroup", { name: "3 · How you'll pay" });
        expect(screen.queryByText(/Sign in and pay/)).toBeNull();
        expect(
            screen.getByText(
                "We'll email a 6-digit code here to confirm it's you. No password.",
            ),
        ).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(placeButton());
            await Promise.resolve();
        });
        expect(start).not.toHaveBeenCalled();
        expect(
            screen.getByText("Enter the code we sent to place your order."),
        ).toBeInTheDocument();
    });
});

describe("the checkout asks for a place when it is a delivery", () => {
    it("pay online opens the window, then waits for the UPI app, then is placed", async () => {
        stubVisit();
        fillBag();
        writeBagDraft(SITE, { ...EMPTY_DRAFT, way: "PICKUP", pay: "ONLINE" });
        const { api } = makeApi({
            started: {
                ...STARTED,
                payment: {
                    provider: "RAZORPAY",
                    amountCents: 56000,
                    currency: "INR",
                    providerIntentId: "order_rzp_1",
                    publicKey: "rzp_test_1",
                    clientParams: {},
                },
            },
        });
        let finish: (o: "paid") => void = () => undefined;
        const openCheckout: OpenCheckout = vi.fn(() => ({
            outcome: new Promise<"paid">((resolve) => {
                finish = resolve;
            }),
            close: vi.fn(),
        }));
        render(
            <LookCheckout
                look="live"
                site={SITE}
                businessName="Rye & Co."
                api={api}
                apiUrl="https://api.example.com"
                openCheckout={openCheckout}
                account={{
                    customer: { email: "asha.kumar@example.com", name: "Asha" },
                    options: OPTIONS,
                    signIn: SIGN_IN,
                }}
            />,
        );
        await screen.findByRole("radiogroup", { name: "3 · How you'll pay" });
        await act(async () => {
            fireEvent.click(placeButton());
            await Promise.resolve();
        });
        expect(
            screen.getByText("Finish paying in the payment window"),
        ).toBeInTheDocument();
        await act(async () => {
            finish("paid");
            await Promise.resolve();
        });
        await waitFor(() =>
            expect(push).toHaveBeenCalledWith("/shop/order/o-1"),
        );
    });
});

// ── Order placed ────────────────────────────────────────────────────────

const ORDER: OrderConfirmationData = {
    orderNumber: "RYE-1042",
    placedAt: "2026-10-19T13:12:00Z",
    currency: "INR",
    lines: [
        {
            name: "Country sourdough",
            variant: "Sliced",
            quantity: 1,
            amount: "280.00",
        },
    ],
    subtotal: "280.00",
    delivery: null,
    discount: null,
    total: "280.00",
    fulfilment: {
        type: "PICKUP",
        label: "Pick-up",
        pickup: {
            name: "Rye & Co.",
            address: "3 Hill Road, Indiranagar",
            hours: "7am to 8pm",
        },
        deliverTo: null,
    },
    refunded: false,
    toPay: "Pay at pick-up",
    reach: null,
    email: "asha.kumar@example.com",
};

describe.each(LOOKS)("Order placed under %s", (look) => {
    it("a pick-up order never says on its way, and has one filled button", () => {
        render(
            <LookOrderPlaced
                look={look}
                lookup={{ ok: true, order: ORDER }}
                businessName="Rye & Co."
                ordersHref="/account/orders?order=o-1"
            />,
        );
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Order placed.",
        );
        expect(document.body.textContent).not.toMatch(/on its way/);
        expect(screen.getByText(/ready for pick-up/)).toBeInTheDocument();
        expect(screen.getByText("To pay at pick-up")).toBeInTheDocument();
        expect(document.querySelectorAll("a.bg-site-accent")).toHaveLength(1);
    });
});

describe("Order placed's next step", () => {
    it("is on its way only for a delivery", () => {
        expect(placedNext({ ...ORDER, toPay: null })).toBe(
            "We'll email you when it's ready for pick-up.",
        );
        expect(
            placedNext({
                ...ORDER,
                toPay: null,
                fulfilment: {
                    type: "LOCAL_DELIVERY",
                    label: "Local delivery",
                    pickup: null,
                    deliverTo: { name: "Asha", lines: ["1 MG Road"] },
                },
            }),
        ).toBe("We'll email you when it's on its way.");
    });
});

// ── Words ───────────────────────────────────────────────────────────────

describe("the shop's words under a look", () => {
    it("never promise today, tomorrow, a pre-order, a return date or a notify list", () => {
        const root = join(__dirname, "..");
        const files = [
            "product/shop-listing-look.tsx",
            "shop/look-add-to-bag.tsx",
            "shop/look-bag.tsx",
            "shop/look-checkout.tsx",
            "shop/look-placed.tsx",
            "shop/look-shop.ts",
        ];
        for (const file of files) {
            const words = readFileSync(join(root, file), "utf8")
                .split("\n")
                // Customer words are in strings and JSX text, not comments.
                .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
                .join("\n");
            expect(words, file).not.toMatch(
                /["'`>][^"'`<]*\b(today|tomorrow|tonight|pre-?order|back in stock|notify me|tell me when)\b/i,
            );
        }
        // The folder holds no other look file this list has missed.
        const looky = readdirSync(join(root, "shop")).filter(
            (f) => f.startsWith("look-") && !f.includes(".test."),
        );
        expect(looky.sort()).toEqual([
            "look-add-to-bag.tsx",
            "look-bag.tsx",
            "look-checkout.tsx",
            "look-placed.tsx",
            "look-shop.ts",
        ]);
    });
});

// ── Classic is untouched ────────────────────────────────────────────────

describe("Classic", () => {
    it("keeps its own sheet: no drawer, no look mark", () => {
        render(
            <SheetFrame title="Your bag" onClose={() => undefined}>
                <p>x</p>
            </SheetFrame>,
        );
        const sheet = screen.getByRole("dialog");
        expect(sheet).not.toHaveAttribute("data-sheet-look");
        expect(sheet).not.toHaveAttribute("data-site-rise");
        expect(sheet.className).toContain("max-w-[560px]");
    });

    it("keeps asking pick-up or delivery in its bag", async () => {
        viewport("desk");
        addToBag(SITE, {
            listingId: "l-sourdough",
            variantId: null,
            quantity: 1,
        });
        const { api } = makeApi();
        render(
            <ShopBag
                site={SITE}
                businessName="Rye & Co."
                api={api}
                account={{ customer: null, options: OPTIONS, signIn: SIGN_IN }}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Your bag, 1 item" }),
        );
        const sheet = await screen.findByRole("dialog");
        expect(
            await within(sheet).findByRole("radiogroup", { name: "How" }),
        ).toBeInTheDocument();
    });
});

describe("the owner's cut-off line in the block contract", () => {
    it("is optional plain text of 80 characters at most", async () => {
        const { parseSectionContent } = await import("@saroh/block-contract");
        expect(
            parseSectionContent("productGrid", 1, { cutOff: "Order by 9 pm" })
                .success,
        ).toBe(true);
        expect(parseSectionContent("productGrid", 1, {}).success).toBe(true);
        expect(
            parseSectionContent("productGrid", 1, { cutOff: "x".repeat(81) })
                .success,
        ).toBe(false);
    });
});
