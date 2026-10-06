import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SignInApi, SignInOptions } from "../account/api";
import EnquirySection from "../blocks/enquiry";
import type { CheckoutOutcome, OpenCheckout } from "../booking-flow/checkout";
import type { ProductPageData } from "../product/product-page";
import ProductPage from "../product/product-page";
import { TestReleaseProvider } from "../test-release/context";
import { AddToBag } from "./add-to-bag";
import type {
    CheckoutQuote,
    CheckoutStanding,
    CheckoutStarted,
    ShopCheckoutApi,
    ShopResult,
    StartCheckout,
} from "./api";
import { askAboutHref, AskAboutOrdering } from "./ask-about-ordering";
import { ShopBag } from "./bag";
import { addToBag, MAX_BAG_ITEMS, readBag } from "./bag-store";

/**
 * The bag and checkout on a merchant's site (G13): the product page's
 * action, "Ask about ordering", and the header bag's sheets — priced by the
 * server, signed in at the last step, paid in the provider's window and
 * placed only once the server says so.
 */

afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
});

const SITE = "site-rye";

const bread: ProductPageData = {
    name: "Sourdough",
    currency: "INR",
    price: "250.00",
    mrp: null,
    categoryName: null,
    description: null,
    keyPoints: [],
    howToUse: null,
    materials: null,
    maker: null,
    warranty: null,
    returns: null,
    images: [],
    optionName: "Size",
    variants: [
        {
            id: "v-small",
            title: "Small",
            price: "180.00",
            mrp: null,
            imageId: null,
            stock: "IN_STOCK",
            left: null,
        },
        {
            id: "v-large",
            title: "Large",
            price: null,
            mrp: null,
            imageId: null,
            stock: "SOLD_OUT",
            left: null,
        },
    ],
    stock: null,
    rating: null,
    reviews: [],
};

describe("Add to bag on the product page", () => {
    it("adds the option picked, says so, and offers the bag", () => {
        render(
            <ProductPage
                product={bread}
                preview={false}
                action={<AddToBag site={SITE} listingId="l-bread" />}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Add to bag" }));
        expect(readBag(SITE)).toEqual([
            { listingId: "l-bread", variantId: "v-small", quantity: 1 },
        ]);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Sourdough (Small) added to your bag.",
        );
        expect(
            screen.getByRole("button", { name: "Add another" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "View bag" }),
        ).toBeInTheDocument();
    });

    it("says the bag is full, not added, when it holds its most lines", () => {
        for (let i = 0; i < MAX_BAG_ITEMS; i++) {
            addToBag(SITE, {
                listingId: `l-${i}`,
                variantId: null,
                quantity: 1,
            });
        }
        render(
            <ProductPage
                product={bread}
                preview={false}
                action={<AddToBag site={SITE} listingId="l-bread" />}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Add to bag" }));
        expect(readBag(SITE)).toHaveLength(MAX_BAG_ITEMS);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Your bag is full. Take something out to add this.",
        );
        expect(screen.queryByText(/added to your bag/)).toBeNull();
    });

    it("is off, reading Sold out, for an option that can't be sold", () => {
        render(
            <ProductPage
                product={bread}
                preview={false}
                action={<AddToBag site={SITE} listingId="l-bread" />}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /Large/ }));
        const off = screen.getByRole("button", { name: "Sold out" });
        expect(off).toBeDisabled();
        fireEvent.click(off);
        expect(readBag(SITE)).toEqual([]);
    });
});

describe("Ask about ordering", () => {
    it("opens the enquiry form with the product and option named", () => {
        render(
            <ProductPage
                product={bread}
                preview={false}
                action={
                    <AskAboutOrdering
                        enquiryHref="/contact"
                        phone={null}
                        businessName="Rye & Co."
                    />
                }
            />,
        );
        expect(
            screen.getByRole("link", { name: "Ask about ordering" }),
        ).toHaveAttribute("href", "/contact?about=Sourdough%20(Small)#enquiry");
    });

    it("builds the address onto a path that has a query or an anchor", () => {
        expect(askAboutHref("/?x=1#form", "Bread")).toBe(
            "/?x=1&about=Bread#form",
        );
    });

    it("offers a call where there is no form, and nothing with neither", () => {
        const { unmount } = render(
            <ProductPage
                product={bread}
                preview={false}
                action={
                    <AskAboutOrdering
                        enquiryHref={null}
                        phone="+918040992210"
                        businessName="Rye & Co."
                    />
                }
            />,
        );
        expect(
            screen.getByRole("link", { name: "Call to order" }),
        ).toHaveAttribute("href", "tel:+918040992210");
        unmount();
        render(
            <ProductPage
                product={bread}
                preview={false}
                action={
                    <AskAboutOrdering
                        enquiryHref={null}
                        phone={null}
                        businessName="Rye & Co."
                    />
                }
            />,
        );
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("starts the enquiry's message with the product it names", async () => {
        window.history.pushState({}, "", "/contact?about=Sourdough%20(Small)");
        render(
            <EnquirySection
                content={{
                    title: "Get in touch",
                    formId: "form-1",
                    fields: [
                        { name: "email", label: "Email", type: "email" },
                        { name: "message", label: "Message", type: "textarea" },
                    ],
                }}
            />,
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Message")).toHaveValue(
                "I'd like to order Sourdough (Small). ",
            ),
        );
        window.history.pushState({}, "", "/");
    });
});

// ── The header's bag ──────────────────────────────────────────────────────

function quoteOf(over: Partial<CheckoutQuote> = {}): CheckoutQuote {
    return {
        currency: "INR",
        lines: [
            {
                listingId: "l-bread",
                variantId: null,
                slug: "sourdough",
                name: "Sourdough",
                variantTitle: null,
                image: null,
                unitPrice: "250.00",
                quantity: 2,
                amount: "500.00",
                state: "ok",
                available: null,
            },
        ],
        ways: [{ type: "PICKUP", label: "Pick-up", fee: null }],
        fulfilment: "PICKUP",
        subtotal: "500.00",
        delivery: "0.00",
        total: "500.00",
        ready: true,
        ...over,
    };
}

const STARTED: CheckoutStarted = {
    orderId: "o-1",
    orderNumber: "ORD-007",
    total: "500.00",
    currency: "INR",
    payment: {
        provider: "RAZORPAY",
        amountCents: 50000,
        currency: "INR",
        providerIntentId: "order_rzp_1",
        publicKey: "rzp_test_1",
        clientParams: {},
    },
};

const OPTIONS: SignInOptions = {
    businessName: "Rye & Co.",
    phone: null,
    challenge: { required: false, siteKey: null },
};

function setup(
    over: {
        quote?: ShopResult<CheckoutQuote>;
        start?: ShopResult<CheckoutStarted>;
        standing?: ShopResult<CheckoutStanding>;
        signedIn?: boolean;
        /** The signed-in customer's name; none when null. */
        name?: string | null;
        outcome?: CheckoutOutcome;
        /** Drawn on a test release (DEC-071, T6). */
        testRelease?: boolean;
    } = {},
) {
    const quote = vi.fn(() =>
        Promise.resolve(over.quote ?? { ok: true as const, data: quoteOf() }),
    );
    const start = vi.fn((_: StartCheckout) =>
        Promise.resolve(over.start ?? { ok: true as const, data: STARTED }),
    );
    const standing = vi.fn(() =>
        Promise.resolve(
            over.standing ?? {
                ok: true as const,
                data: {
                    orderNumber: "ORD-007",
                    state: "placed" as const,
                    total: "500.00",
                    currency: "INR",
                    message: null,
                },
            },
        ),
    );
    const api: ShopCheckoutApi = { quote, start, standing };
    const signIn: SignInApi = {
        requestCode: vi.fn(() =>
            Promise.resolve({ ok: true as const, resendAfterSeconds: 30 }),
        ),
        verifyCode: vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                customer: { email: "asha@example.in", name: "Asha" },
            }),
        ),
    };
    const openCheckout: OpenCheckout = vi.fn(() => ({
        outcome: Promise.resolve(over.outcome ?? "paid"),
        close: vi.fn(),
    }));
    addToBag(SITE, { listingId: "l-bread", variantId: null, quantity: 2 });
    const bag = (
        <ShopBag
            site={SITE}
            businessName="Rye & Co."
            api={api}
            account={{
                customer: over.signedIn
                    ? {
                          email: "asha@example.in",
                          name: over.name === undefined ? "Asha" : over.name,
                      }
                    : null,
                options: OPTIONS,
                signIn,
            }}
            openCheckout={openCheckout}
            apiUrl="https://api.test"
        />
    );
    render(
        over.testRelease ? (
            <TestReleaseProvider release={{ name: "Diwali menu" }}>
                {bag}
            </TestReleaseProvider>
        ) : (
            bag
        ),
    );
    return { quote, start, standing, openCheckout };
}

async function openTheBag() {
    fireEvent.click(screen.getByRole("button", { name: "Your bag, 2 items" }));
    await screen.findByText("Sourdough");
}

describe("the header's bag", () => {
    it("shows the bag with its count, priced by the server", async () => {
        const { quote } = setup({ signedIn: true });
        await openTheBag();
        expect(quote).toHaveBeenCalledWith({
            lines: [{ listingId: "l-bread", variantId: null, quantity: 2 }],
        });
        expect(screen.getByRole("radio", { name: /Pick-up/ })).toHaveAttribute(
            "aria-checked",
            "true",
        );
        expect(
            screen.getByRole("button", { name: /^Place order · / }),
        ).toBeEnabled();
    });

    it("signs in at the last step, then places the order and pays, placed only once the server says so", async () => {
        const { start, standing, openCheckout } = setup();
        await openTheBag();
        fireEvent.click(screen.getByRole("button", { name: /^Continue · / }));
        expect(
            await screen.findByText(
                "Last step: confirm it's you, then we'll finish. No password.",
            ),
        ).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Send code" }));
        });
        fireEvent.change(await screen.findByLabelText("Code"), {
            target: { value: "123456" },
        });
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        });

        await screen.findByRole("heading", { name: "Order placed" });
        // The confirmation page, on the business's own site (P4).
        expect(
            screen.getByRole("link", { name: "See your order" }),
        ).toHaveAttribute("href", `/shop/order/${STARTED.orderId}`);
        expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
        expect(start).toHaveBeenCalledTimes(1);
        const request = start.mock.calls[0][0];
        expect(request).toMatchObject({
            lines: [{ listingId: "l-bread", variantId: null, quantity: 2 }],
            fulfilment: "PICKUP",
        });
        expect(request.key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
        expect(openCheckout).toHaveBeenCalledWith(
            expect.objectContaining({
                handoff: STARTED.payment,
                // The window's return goes to the API (P1).
                apiUrl: "https://api.test",
            }),
        );
        expect(standing).toHaveBeenCalledWith("o-1");
        expect(readBag(SITE)).toEqual([]);
    });

    it("keeps the bag and says so when the payment sold out meanwhile", async () => {
        setup({
            signedIn: true,
            standing: {
                ok: true,
                data: {
                    orderNumber: "ORD-007",
                    state: "refunded",
                    total: "500.00",
                    currency: "INR",
                    message:
                        "Sorry, it sold out while you were paying — your money is on its way back",
                },
            },
        });
        await openTheBag();
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        expect(
            await screen.findByRole("heading", {
                name: "Your money is on its way back",
            }),
        ).toBeInTheDocument();
        expect(readBag(SITE)).toHaveLength(1);
    });

    it("says the money is being sent back, not on its way, until the provider has the refund", async () => {
        setup({
            signedIn: true,
            standing: {
                ok: true,
                data: {
                    orderNumber: "ORD-008",
                    state: "refunding",
                    total: "500.00",
                    currency: "INR",
                    message:
                        "Sorry, it sold out while you were paying. We're sending your money back.",
                },
            },
        });
        await openTheBag();
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        expect(
            await screen.findByRole("heading", {
                name: "We're sending your money back",
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/on its way back/)).not.toBeInTheDocument();
        expect(readBag(SITE)).toHaveLength(1);
    });

    it("offers another go when the payment window closes", async () => {
        const { openCheckout } = setup({ signedIn: true, outcome: "closed" });
        await openTheBag();
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        expect(
            await screen.findByText(
                "The payment window closed before you paid.",
            ),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /^Pay · / }));
        expect(openCheckout).toHaveBeenCalledTimes(2);
    });

    it("holds the button while a line can't be sold, and says why", async () => {
        setup({
            signedIn: true,
            quote: {
                ok: true,
                data: quoteOf({
                    ready: false,
                    lines: [
                        {
                            ...quoteOf().lines[0],
                            state: "short",
                            available: 1,
                        },
                    ],
                }),
            },
        });
        await openTheBag();
        expect(screen.getByText("Only 1 left")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /^Place order/ }),
        ).toBeDisabled();
    });

    it("says a start was refused in the page's words, and keeps the bag", async () => {
        setup({
            signedIn: true,
            start: {
                ok: false,
                reason: "busy",
                message:
                    "You have other checkouts waiting for payment. Finish one of them, or try again tomorrow.",
            },
        });
        await openTheBag();
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "You have other checkouts waiting for payment",
        );
        expect(readBag(SITE)).toHaveLength(1);
    });

    it("asks for an address for Local delivery before it can be placed", async () => {
        setup({
            signedIn: true,
            quote: {
                ok: true,
                data: quoteOf({
                    ways: [
                        { type: "PICKUP", label: "Pick-up", fee: null },
                        {
                            type: "LOCAL_DELIVERY",
                            label: "Local delivery",
                            fee: "60.00",
                        },
                    ],
                    fulfilment: "LOCAL_DELIVERY",
                }),
            },
        });
        await openTheBag();
        fireEvent.click(screen.getByRole("radio", { name: /Local delivery/ }));
        const place = await screen.findByRole("button", {
            name: /^Place order/,
        });
        expect(place).toBeDisabled();
        for (const [label, value] of [
            ["Address", "12 Hill Road"],
            ["Town or city", "Mumbai"],
            ["PIN code", "400050"],
            ["State", "Maharashtra"],
        ] as const) {
            fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
                target: { value },
            });
        }
        expect(
            screen.getByRole("button", { name: /^Place order/ }),
        ).toBeEnabled();
    });

    it("fills the payment window with the name and phone typed in the bag", async () => {
        const { openCheckout } = setup({
            signedIn: true,
            name: null,
            quote: {
                ok: true,
                data: quoteOf({
                    ways: [
                        {
                            type: "LOCAL_DELIVERY",
                            label: "Local delivery",
                            fee: "60.00",
                        },
                    ],
                    fulfilment: "LOCAL_DELIVERY",
                }),
            },
        });
        await openTheBag();
        fireEvent.click(screen.getByRole("radio", { name: /Local delivery/ }));
        await screen.findByRole("button", { name: /^Place order/ });
        for (const [label, value] of [
            ["Name", "Kavya Iyer"],
            ["Phone", "98450 12345"],
            ["Address", "12 Hill Road"],
            ["Town or city", "Mumbai"],
            ["PIN code", "400050"],
            ["State", "Maharashtra"],
        ] as const) {
            fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
                target: { value },
            });
        }
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        await screen.findByRole("heading", { name: "Order placed" });
        expect(openCheckout).toHaveBeenCalledWith(
            expect.objectContaining({
                booker: {
                    name: "Kavya Iyer",
                    email: "asha@example.in",
                    phone: "9845012345",
                },
            }),
        );
    });

    it("keeps the way, the address and the key when the customer goes back to the bag", async () => {
        const { start } = setup({
            signedIn: true,
            outcome: "closed",
            quote: {
                ok: true,
                data: quoteOf({
                    ways: [
                        { type: "PICKUP", label: "Pick-up", fee: null },
                        {
                            type: "LOCAL_DELIVERY",
                            label: "Local delivery",
                            fee: "60.00",
                        },
                    ],
                    fulfilment: "LOCAL_DELIVERY",
                }),
            },
        });
        await openTheBag();
        fireEvent.click(screen.getByRole("radio", { name: /Local delivery/ }));
        for (const [label, value] of [
            ["Address", "12 Hill Road"],
            ["Town or city", "Mumbai"],
            ["PIN code", "400050"],
            ["State", "Maharashtra"],
        ] as const) {
            fireEvent.change(
                await screen.findByLabelText(new RegExp(`^${label}`)),
                { target: { value } },
            );
        }
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        fireEvent.click(
            await screen.findByRole("button", { name: "Back to your bag" }),
        );

        await screen.findByText("Sourdough");
        expect(
            screen.getByRole("radio", { name: /Local delivery/ }),
        ).toHaveAttribute("aria-checked", "true");
        expect(screen.getByLabelText(/^Address/)).toHaveValue("12 Hill Road");
        fireEvent.click(
            await screen.findByRole("button", { name: /^Place order/ }),
        );
        await screen.findByRole("button", { name: "Back to your bag" });
        expect(start).toHaveBeenCalledTimes(2);
        expect(start.mock.calls[1][0].key).toBe(start.mock.calls[0][0].key);
        expect(start.mock.calls[1][0].address).toMatchObject({
            line1: "12 Hill Road",
        });
    });

    it("keeps asking about a payment closed while it was being confirmed, and empties the bag once placed", async () => {
        const standingOf = (state: CheckoutStanding["state"]) => ({
            ok: true as const,
            data: {
                orderNumber: "ORD-007",
                state,
                total: "500.00",
                currency: "INR",
                message: null,
            },
        });
        const { standing } = setup({ signedIn: true });
        standing
            .mockResolvedValueOnce(standingOf("paying"))
            .mockResolvedValue(standingOf("placed"));
        await openTheBag();
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        await screen.findByRole("heading", {
            name: "Confirming your payment",
        });
        expect(window.localStorage.getItem(`saroh.checkout.${SITE}`)).toBe(
            "o-1",
        );
        await waitFor(() => expect(standing).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        await waitFor(() => expect(readBag(SITE)).toEqual([]));
        expect(standing).toHaveBeenLastCalledWith("o-1");
        expect(
            window.localStorage.getItem(`saroh.checkout.${SITE}`),
        ).toBeNull();
    });

    it("asks again, on a later page, about a payment still being confirmed", async () => {
        window.localStorage.setItem(`saroh.checkout.${SITE}`, "o-1");
        const { standing } = setup({ signedIn: true });
        await waitFor(() => expect(standing).toHaveBeenCalledWith("o-1"));
        await waitFor(() => expect(readBag(SITE)).toEqual([]));
    });

    it("draws nothing in the header while the bag is empty", () => {
        render(
            <ShopBag
                site="empty-site"
                businessName="Rye & Co."
                api={{
                    quote: vi.fn(),
                    start: vi.fn(),
                    standing: vi.fn(),
                }}
                account={{
                    customer: null,
                    options: OPTIONS,
                    signIn: { requestCode: vi.fn(), verifyCode: vi.fn() },
                }}
            />,
        );
        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("the bag on a test release (DEC-071, T6)", () => {
    it("is priced as usual, then stops where signing in would be: no order, no payment", async () => {
        const { quote, start, openCheckout } = setup({
            testRelease: true,
        });
        await openTheBag();
        expect(quote).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /^Continue · / }));

        const stop = await screen.findByRole("dialog", {
            name: "This is a test release",
        });
        expect(stop.textContent).toContain(
            "On the live site, the customer signs in here and pays ₹500 for 2 items.",
        );
        expect(stop.textContent).toContain(
            "Nothing is ordered on a test release.",
        );
        expect(
            screen.queryByText(
                "Last step: confirm it's you, then we'll finish. No password.",
            ),
        ).toBeNull();
        expect(start).not.toHaveBeenCalled();
        expect(openCheckout).not.toHaveBeenCalled();

        // Back to the bag, as it was.
        fireEvent.click(
            screen.getByRole("button", { name: "Back to your bag" }),
        );
        expect(
            await screen.findByRole("heading", { name: "Your bag" }),
        ).toBeInTheDocument();
        expect(readBag(SITE)).toHaveLength(1);
    });

    it("says it is a test release when the site's server refuses the order", async () => {
        const { start } = setup({
            signedIn: true,
            start: {
                ok: false,
                reason: "test-release",
                message:
                    "This is a test release. Nothing here is ordered, booked or paid.",
            },
        });
        await openTheBag();
        fireEvent.click(
            screen.getByRole("button", { name: /^Place order · / }),
        );
        expect(
            await screen.findByText(
                "This is a test release. Nothing here is ordered, booked or paid.",
            ),
        ).toBeInTheDocument();
        expect(start).toHaveBeenCalledTimes(1);
    });
});
