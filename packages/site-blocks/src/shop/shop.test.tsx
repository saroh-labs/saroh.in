import {
    act,
    cleanup,
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
    DeliveryAddress,
    ShopCheckoutApi,
    ShopResult,
    StartCheckout,
} from "./api";
import { askAboutHref, AskAboutOrdering } from "./ask-about-ordering";
import { ShopBag } from "./bag";
import { parseBagDraft, readBagDraft } from "./bag-draft-store";
import { EMPTY_DRAFT } from "./bag-sheet";
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
        fireEvent.click(
            screen.getByRole("button", { name: "Add to bag · ₹180" }),
        );
        expect(readBag(SITE)).toEqual([
            { listingId: "l-bread", variantId: "v-small", quantity: 1 },
        ]);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Sourdough (Small) added to your bag.",
        );
        expect(
            screen.getByRole("button", { name: "Add another · ₹180" }),
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
        fireEvent.click(
            screen.getByRole("button", { name: "Add to bag · ₹180" }),
        );
        expect(readBag(SITE)).toHaveLength(MAX_BAG_ITEMS);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Your bag is full. Take something out to add this.",
        );
        expect(screen.queryByText(/added to your bag/)).toBeNull();
    });

    it("stops at what is left, and says it's all in the bag (UX-058)", () => {
        render(
            <ProductPage
                product={{
                    ...bread,
                    variants: [
                        { ...bread.variants[0], stock: "LOW", left: 1 },
                        bread.variants[1],
                    ],
                }}
                preview={false}
                action={<AddToBag site={SITE} listingId="l-bread" />}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Add to bag · ₹180" }),
        );
        const off = screen.getByRole("button", {
            name: "The last one is in your bag",
        });
        expect(off).toBeDisabled();
        fireEvent.click(off);
        expect(readBag(SITE)).toEqual([
            { listingId: "l-bread", variantId: "v-small", quantity: 1 },
        ]);
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

    it("is a bar pinned to the foot of a phone, by CSS alone, with room kept under the page", () => {
        render(
            <ProductPage
                product={bread}
                preview={false}
                action={<AddToBag site={SITE} listingId="l-bread" />}
            />,
        );
        const button = screen.getByRole("button", {
            name: "Add to bag · ₹180",
        });
        const bar = button.closest("[data-bag-bar]");
        expect(bar?.className).toContain("max-[699px]:fixed");
        expect(bar?.className).toContain("max-[699px]:bottom-[");
        // One button, one message: the same block, moved.
        expect(
            screen.getAllByRole("button", { name: /^Add to bag/ }),
        ).toHaveLength(1);
        expect(bar?.querySelector("style")?.textContent).toMatch(
            /max-width:699px.*padding-bottom/,
        );
    });

    it("says the price of the option picked on the button", () => {
        render(
            <ProductPage
                product={{
                    ...bread,
                    variants: [
                        bread.variants[0],
                        { ...bread.variants[1], stock: "IN_STOCK" },
                    ],
                }}
                preview={false}
                action={<AddToBag site={SITE} listingId="l-bread" />}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /Large/ }));
        expect(
            screen.getByRole("button", { name: "Add to bag · ₹250" }),
        ).toBeEnabled();
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
        /** The signed-in customer's last delivery; none when left out. */
        saved?: DeliveryAddress;
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
    const savedAddress = vi.fn(() =>
        Promise.resolve({ ok: true as const, data: over.saved ?? null }),
    );
    const api: ShopCheckoutApi = { quote, start, standing, savedAddress };
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
    return { quote, start, standing, openCheckout, signIn, savedAddress };
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
        // Paid online: the button says where it leads.
        fireEvent.click(
            screen.getByRole("button", { name: "Sign in and pay · ₹500" }),
        );
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
        // The sixth digit sends the code: no button to press.
        fireEvent.change(await screen.findByLabelText("Code"), {
            target: { value: "123456" },
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
                        "Sorry, it sold out while you were paying. Your money is on its way back",
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

    it("shows each line's photo, what one costs and a Subtotal", async () => {
        setup({
            signedIn: true,
            quote: {
                ok: true,
                data: quoteOf({
                    lines: [
                        {
                            ...quoteOf().lines[0],
                            image: {
                                url: "https://img.test/loaf.jpg",
                                alt: "A loaf",
                            },
                        },
                    ],
                    ways: [
                        {
                            type: "LOCAL_DELIVERY",
                            label: "Local delivery",
                            fee: "60.00",
                        },
                    ],
                    fulfilment: "LOCAL_DELIVERY",
                    delivery: "60.00",
                    total: "560.00",
                }),
            },
        });
        await openTheBag();
        const sheet = screen.getByRole("dialog", { name: "Your bag" });
        const photo = sheet.querySelector("img");
        expect(photo).toHaveAttribute("src", "https://img.test/loaf.jpg");
        expect(photo).toHaveAttribute("width", "56");
        expect(photo).toHaveAttribute("height", "56");
        expect(screen.getByText("₹250 each")).toBeVisible();
        expect(screen.getByText("Subtotal").parentElement).toHaveTextContent(
            "Subtotal₹500",
        );
        expect(screen.getByText("Total").parentElement).toHaveTextContent(
            "Total₹560",
        );
    });

    it("pins the total and the button to the sheet's foot, and holds the page still", async () => {
        setup({ signedIn: true });
        expect(document.body.style.overflow).toBe("");
        await openTheBag();
        const sheet = screen.getByRole("dialog", { name: "Your bag" });
        const footer = sheet.querySelector("[data-sheet-footer]");
        const scroll = sheet.querySelector("[data-sheet-scroll]");
        expect(footer).not.toBeNull();
        const place = screen.getByRole("button", { name: /^Place order/ });
        expect(footer).toContainElement(place);
        expect(footer).toContainElement(screen.getByText("Total"));
        // The lines scroll above it, never the footer with them.
        expect(scroll).toContainElement(screen.getByText("Sourdough"));
        expect(scroll).not.toContainElement(place);
        expect(scroll?.className).toContain("overflow-y-auto");
        // As tall as the screen is now, where the browser knows.
        expect(sheet.className).toContain(
            "supports-[height:100dvh]:max-h-[88dvh]",
        );
        // 44px under a finger.
        expect(
            screen.getByRole("button", { name: "Close" }).className,
        ).toContain("coarse:size-11");
        expect(
            screen.getByRole("button", { name: "One more Sourdough" })
                .className,
        ).toContain("coarse:size-11");

        expect(document.body.style.overflow).toBe("hidden");
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(document.body.style.overflow).toBe("");
    });

    it("keeps the page still while signing in opens over the bag, until both have closed", async () => {
        setup();
        await openTheBag();
        fireEvent.click(
            await screen.findByRole("button", { name: /^Sign in and pay/ }),
        );
        await screen.findByLabelText("Email");
        expect(document.body.style.overflow).toBe("hidden");
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await screen.findByText("Sourdough");
        expect(document.body.style.overflow).toBe("hidden");
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(document.body.style.overflow).toBe("");
    });

    it("stops − at one: the last one never leaves by a slip of the thumb", async () => {
        setup({
            signedIn: true,
            quote: {
                ok: true,
                data: quoteOf({
                    lines: [{ ...quoteOf().lines[0], quantity: 1 }],
                }),
            },
        });
        await openTheBag();
        const fewer = screen.getByRole("button", {
            name: "One fewer Sourdough",
        });
        expect(fewer).toBeDisabled();
        fireEvent.click(fewer);
        expect(readBag(SITE)).toHaveLength(1);
    });

    it("takes a line out only on Remove, and puts it back on Undo", async () => {
        setup({ signedIn: true });
        await openTheBag();
        fireEvent.click(
            screen.getByRole("button", { name: "Remove Sourdough" }),
        );
        expect(readBag(SITE)).toEqual([]);
        // The bag is empty now, and still offers the line back.
        expect(
            screen.getByText("Your bag is empty. Add something from the shop."),
        ).toBeVisible();
        expect(screen.getByRole("status")).toHaveTextContent(
            "Sourdough removed.",
        );
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(readBag(SITE)).toEqual([
            { listingId: "l-bread", variantId: null, quantity: 2 },
        ]);
        await screen.findByText("Sourdough");
        expect(screen.queryByText("Sourdough removed.")).toBeNull();
    });

    it("says the returns rule again above the button, where a product has one", async () => {
        setup({
            signedIn: true,
            quote: {
                ok: true,
                data: quoteOf({
                    lines: [
                        {
                            ...quoteOf().lines[0],
                            returns: "Exchange within 7 days, tags on",
                        },
                    ],
                }),
            },
        });
        await openTheBag();
        const rule = screen.getByText(
            "Returns: Exchange within 7 days, tags on",
        );
        expect(rule.className).toContain("text-site-body");
        expect(rule.className).not.toContain("text-site-muted");
        const place = screen.getByRole("button", { name: /^Place order/ });
        expect(
            rule.compareDocumentPosition(place) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("says nothing about returns when no product in the bag has a rule", async () => {
        setup({ signedIn: true });
        await openTheBag();
        expect(screen.queryByText(/^Returns/)).toBeNull();
    });

    it("sends an optional note for the business with the order, and never keeps it for the visit", async () => {
        const { start } = setup({ signedIn: true });
        await openTheBag();
        const note = screen.getByLabelText(/^Note for Rye & Co\./);
        expect(note).not.toBeRequired();
        expect(note).toHaveAttribute("maxlength", "500");
        expect(note.className).toContain("text-base");
        fireEvent.change(note, { target: { value: "  No nuts, please  " } });
        expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(
            "No nuts",
        );
        // Closed and opened again on the same page: still there.
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await openTheBag();
        expect(screen.getByLabelText(/^Note for Rye & Co\./)).toHaveValue(
            "  No nuts, please  ",
        );
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
        expect(start.mock.calls[0][0].notes).toBe("No nuts, please");
    });

    it("keeps the checkout's key for the visit without the note's words, and a new key for a new note", async () => {
        const { start } = setup({ signedIn: true, outcome: "closed" });
        await openTheBag();
        const place = async () => {
            fireEvent.click(
                await screen.findByRole("button", { name: /^Place order/ }),
            );
            fireEvent.click(
                await screen.findByRole("button", {
                    name: "Back to your bag",
                }),
            );
            await screen.findByText("Sourdough");
        };
        fireEvent.change(screen.getByLabelText(/^Note for Rye & Co\./), {
            target: { value: "No nuts, please" },
        });
        await place();
        // The key is kept for the visit; the note's words are not.
        const kept = window.sessionStorage.getItem(`saroh.bag-draft.${SITE}`);
        expect(kept).toContain(start.mock.calls[0][0].key);
        expect(kept).not.toContain("No nuts");
        await place();
        expect(start.mock.calls[1][0].key).toBe(start.mock.calls[0][0].key);
        fireEvent.change(screen.getByLabelText(/^Note for Rye & Co\./), {
            target: { value: "Nuts are fine" },
        });
        await place();
        expect(start.mock.calls[2][0].key).not.toBe(start.mock.calls[0][0].key);
    });

    it("sends no note when none was typed", async () => {
        const { start } = setup({ signedIn: true });
        await openTheBag();
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
        expect(start.mock.calls[0][0]).not.toHaveProperty("notes");
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
        // The bag is set to what is left, and says so (UX-058).
        expect(
            await screen.findByText("Only 1 left, so we've set your bag to 1."),
        ).toBeInTheDocument();
        expect(readBag(SITE)).toEqual([
            { listingId: "l-bread", variantId: null, quantity: 1 },
        ]);
        expect(
            screen.getByText(
                "Fewer are left than you asked for. Lower the amount to continue.",
            ),
        ).toBeInTheDocument();
    });

    it("says where to collect a pick-up, and when it's open (UX-025)", async () => {
        setup({
            signedIn: true,
            quote: {
                ok: true,
                data: quoteOf({
                    pickup: {
                        address: "12 Hill Road, Bandra",
                        hours: "Mon–Sat 10:00–19:00, Sun closed",
                    },
                }),
            },
        });
        await openTheBag();
        expect(
            screen.getByText("12 Hill Road, Bandra", { exact: false }),
        ).toBeInTheDocument();
        expect(screen.getByText("Pick-up from")).toBeInTheDocument();
        expect(
            screen.getByText("Mon–Sat 10:00–19:00, Sun closed"),
        ).toBeInTheDocument();
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
        expect(
            screen.getByRole("button", { name: /^Place order/ }),
        ).toBeEnabled();
        // State is a choice of India's states and union territories.
        const state = screen.getByLabelText(/^State/);
        expect(state.tagName).toBe("SELECT");
        expect(state.querySelectorAll("option")).toHaveLength(37);
    });

    it("needs a phone for a delivery, and says so beside the button", async () => {
        setup({
            signedIn: true,
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
        const place = screen.getByRole("button", { name: /^Place order/ });
        expect(place).toBeDisabled();
        expect(place).toHaveAccessibleDescription(
            "Add a phone number for the delivery.",
        );
        const phone = screen.getByLabelText(/^Phone/);
        expect(phone).toBeRequired();
        fireEvent.change(phone, { target: { value: "call me" } });
        expect(place).toHaveAccessibleDescription("Check the phone number.");
        expect(phone).toHaveAttribute("aria-invalid", "true");
        fireEvent.change(phone, { target: { value: "98450 12345" } });
        expect(
            screen.getByRole("button", { name: /^Place order/ }),
        ).toBeEnabled();
    });

    it("asks for no phone for a pick-up", async () => {
        setup({ signedIn: true });
        await openTheBag();
        expect(screen.queryByLabelText(/^Phone/)).toBeNull();
        expect(
            await screen.findByRole("button", { name: /^Place order/ }),
        ).toBeEnabled();
    });

    it("reads out a returning customer's last address, and sends it", async () => {
        const { start, savedAddress } = setup({
            signedIn: true,
            saved: {
                name: "Asha Rao",
                phone: "98450 12345",
                line1: "12 Hill Road",
                line2: "Flat 4",
                city: "Mumbai",
                state: "maharashtra",
                postalCode: "400050",
            },
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
        await screen.findByText("12 Hill Road");
        expect(screen.getByText("Mumbai, Maharashtra 400050")).toBeVisible();
        expect(screen.getByText("98450 12345")).toBeVisible();
        expect(savedAddress).toHaveBeenCalledTimes(1);
        // Nothing to type: no field is drawn.
        expect(screen.queryByLabelText(/^Address/)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
        expect(start.mock.calls[0][0].address).toEqual({
            name: "Asha Rao",
            phone: "98450 12345",
            line1: "12 Hill Road",
            line2: "Flat 4",
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400050",
        });
    });

    it("empties it on Use a different address, and never fills it in again", async () => {
        const { savedAddress } = setup({
            signedIn: true,
            saved: {
                phone: "98450 12345",
                line1: "12 Hill Road",
                city: "Mumbai",
                state: "Maharashtra",
                postalCode: "400050",
            },
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
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Use a different address",
            }),
        );
        expect(screen.getByLabelText(/^Address/)).toHaveValue("");
        expect(screen.getByLabelText(/^Phone/)).toHaveValue("");
        expect(
            screen.getByRole("button", { name: /^Place order/ }),
        ).toBeDisabled();
        // Closed and opened again: still theirs to type.
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await openTheBag();
        expect(await screen.findByLabelText(/^Address/)).toHaveValue("");
        expect(savedAddress).toHaveBeenCalledTimes(1);
    });

    it("fills the fields in, to be finished, when the last address has no phone", async () => {
        setup({
            signedIn: true,
            saved: {
                line1: "12 Hill Road",
                city: "Mumbai",
                state: "Maharashtra",
                postalCode: "400050",
            },
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
        expect(await screen.findByLabelText(/^Address/)).toHaveValue(
            "12 Hill Road",
        );
        expect(screen.getByLabelText(/^State/)).toHaveValue("Maharashtra");
        expect(
            screen.queryByRole("button", { name: "Use a different address" }),
        ).toBeNull();
    });

    it("asks nobody's last address while signed out, or for a pick-up", async () => {
        const { savedAddress } = setup({
            saved: {
                phone: "98450 12345",
                line1: "12 Hill Road",
                city: "Mumbai",
                state: "Maharashtra",
                postalCode: "400050",
            },
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
        await screen.findByLabelText(/^Address/);
        expect(savedAddress).not.toHaveBeenCalled();
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
            ["Phone", "98450 12345"],
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
        fireEvent.click(
            screen.getByRole("button", { name: "Sign in and pay · ₹500" }),
        );

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

describe("paying at the handover (2026-10-06: Free takes money offline)", () => {
    const COLLECT = {
        type: "ON_HANDOVER" as const,
        label: "Pay at pick-up",
    };
    const ONLINE = { type: "ONLINE" as const, label: "Pay online" };
    const PLACED_TO_PAY: CheckoutStarted = {
        ...STARTED,
        payBy: "ON_HANDOVER",
        payment: null,
    };

    it("signed out, the button says the order is placed: the code is the last step", async () => {
        const { start, openCheckout } = setup({
            quote: { ok: true, data: quoteOf({ payments: [COLLECT] }) },
            start: { ok: true, data: PLACED_TO_PAY },
        });
        await openTheBag();
        expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Sign in and place order · ₹500",
            }),
        );
        fireEvent.change(await screen.findByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Send code" }));
        });
        fireEvent.change(await screen.findByLabelText("Code"), {
            target: { value: "123456" },
        });
        // Nothing more is asked: it is placed, as the button said.
        await screen.findByRole("heading", { name: "Order placed" });
        expect(start).toHaveBeenCalledTimes(1);
        expect(openCheckout).not.toHaveBeenCalled();
    });

    it("signed out with both ways, the button follows the way picked", async () => {
        setup({
            quote: {
                ok: true,
                data: quoteOf({ payments: [ONLINE, COLLECT] }),
            },
        });
        await openTheBag();
        expect(
            screen.getByRole("button", { name: "Sign in and pay · ₹500" }),
        ).toBeEnabled();
        fireEvent.click(screen.getByRole("radio", { name: "Pay at pick-up" }));
        expect(
            screen.getByRole("button", {
                name: "Sign in and place order · ₹500",
            }),
        ).toBeEnabled();
    });

    it("offers only paying at pick-up, places it with nothing to pay, and says it's unpaid", async () => {
        const { start, openCheckout } = setup({
            signedIn: true,
            quote: { ok: true, data: quoteOf({ payments: [COLLECT] }) },
            start: { ok: true, data: PLACED_TO_PAY },
        });
        await openTheBag();
        expect(
            screen.getByText(
                "You'll pay at pick-up. Your order is placed now.",
            ),
        ).toBeInTheDocument();
        // One way to pay: nothing to choose.
        expect(screen.queryByRole("radio", { name: "Pay online" })).toBeNull();

        fireEvent.click(
            screen.getByRole("button", { name: /^Place order · / }),
        );
        await screen.findByRole("heading", { name: "Order placed" });
        expect(screen.getByText(/You'll pay at pick-up\./)).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "See your order" }),
        ).toHaveAttribute("href", `/shop/order/${STARTED.orderId}`);
        expect(start.mock.calls[0][0]).toMatchObject({
            fulfilment: "PICKUP",
            payment: "ON_HANDOVER",
        });
        expect(openCheckout).not.toHaveBeenCalled();
        expect(readBag(SITE)).toEqual([]);
    });

    it("lets them choose when the shop takes both, online first", async () => {
        const { start } = setup({
            signedIn: true,
            quote: { ok: true, data: quoteOf({ payments: [ONLINE, COLLECT] }) },
            start: { ok: true, data: PLACED_TO_PAY },
        });
        await openTheBag();
        expect(
            screen.getByRole("radio", { name: "Pay online" }),
        ).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByText(/You pay online in a secure window/),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("radio", { name: "Pay at pick-up" }));
        expect(
            screen.getByRole("radio", { name: "Pay at pick-up" }),
        ).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByText(
                "You'll pay at pick-up. Your order is placed now.",
            ),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole("button", { name: /^Place order · / }),
        );
        await screen.findByRole("heading", { name: "Order placed" });
        expect(start.mock.calls[0][0].payment).toBe("ON_HANDOVER");
    });

    it("pays online as before when online is chosen, sending no payment field", async () => {
        const { start, openCheckout } = setup({
            signedIn: true,
            quote: { ok: true, data: quoteOf({ payments: [ONLINE, COLLECT] }) },
        });
        await openTheBag();
        fireEvent.click(
            screen.getByRole("button", { name: /^Place order · / }),
        );
        await screen.findByRole("heading", { name: "Order placed" });
        expect(start.mock.calls[0][0]).not.toHaveProperty("payment");
        expect(openCheckout).toHaveBeenCalled();
    });
});

describe("a discount code in the bag (DEC-104)", () => {
    /** The server's quote: SAVE10 takes 50 off; any other code is refused. */
    function judged(body: {
        discountCode?: string;
    }): ShopResult<CheckoutQuote> {
        if (!body.discountCode) {
            return { ok: true, data: quoteOf({ discount: null }) };
        }
        if (body.discountCode === "SAVE10") {
            return {
                ok: true,
                data: quoteOf({
                    discount: {
                        code: "SAVE10",
                        applied: true,
                        amount: "50.00",
                    },
                    total: "450.00",
                }),
            };
        }
        return {
            ok: true,
            data: quoteOf({
                discount: {
                    code: body.discountCode,
                    applied: false,
                    reason: "EXPIRED",
                    message: `${body.discountCode} has ended.`,
                },
            }),
        };
    }

    function withCodes() {
        const made = setup({ signedIn: true });
        const quote = made.quote as unknown as {
            mockImplementation: (
                fn: (body: {
                    discountCode?: string;
                }) => Promise<ShopResult<CheckoutQuote>>,
            ) => void;
        };
        quote.mockImplementation((body) => Promise.resolve(judged(body)));
        return made;
    }

    function applyCode(code: string) {
        fireEvent.click(screen.getByRole("button", { name: "Have a code?" }));
        fireEvent.change(screen.getByLabelText("Discount code"), {
            target: { value: code },
        });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    }

    it("applies a code by the server's answer, shows what came off, and places it with the code", async () => {
        const { quote, start } = withCodes();
        await openTheBag();
        applyCode(" save10 ");

        expect(await screen.findByText("Code SAVE10")).toBeInTheDocument();
        expect(quote).toHaveBeenLastCalledWith({
            lines: [{ listingId: "l-bread", variantId: null, quantity: 2 }],
            fulfilment: "PICKUP",
            discountCode: "SAVE10",
        });
        const place = await screen.findByRole("button", {
            name: /^Place order · .*450/,
        });
        fireEvent.click(place);
        await screen.findByRole("heading", { name: "Order placed" });
        expect(start.mock.calls[0][0]).toMatchObject({
            discountCode: "SAVE10",
        });
    });

    it("says why a code doesn't apply, keeps the full price, and never sends it", async () => {
        const { start } = withCodes();
        await openTheBag();
        applyCode("OLD");

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "OLD has ended.",
        );
        expect(screen.queryByText(/^Code /)).toBeNull();
        const place = screen.getByRole("button", {
            name: /^Place order · .*500/,
        });
        fireEvent.click(place);
        await screen.findByRole("heading", { name: "Order placed" });
        expect(start.mock.calls[0][0]).not.toHaveProperty("discountCode");
    });

    it("takes a code off again with Remove", async () => {
        const { quote } = withCodes();
        await openTheBag();
        applyCode("SAVE10");
        fireEvent.click(
            await screen.findByRole("button", { name: "Remove code SAVE10" }),
        );

        await waitFor(() =>
            expect(quote).toHaveBeenLastCalledWith({
                lines: [{ listingId: "l-bread", variantId: null, quantity: 2 }],
                fulfilment: "PICKUP",
            }),
        );
        await waitFor(() =>
            expect(screen.queryByText("Code SAVE10")).toBeNull(),
        );
    });
});

describe("the QR code an order came from", () => {
    const PLACED: CheckoutStarted = {
        ...STARTED,
        payBy: "ON_HANDOVER",
        payment: null,
    };
    const collect = {
        signedIn: true,
        quote: {
            ok: true as const,
            data: quoteOf({
                payments: [
                    {
                        type: "ON_HANDOVER" as const,
                        label: "Pay at pick-up",
                    },
                ],
            }),
        },
        start: { ok: true as const, data: PLACED },
    };

    afterEach(() => {
        window.sessionStorage.clear();
        window.history.replaceState({}, "", "/");
    });

    async function placeIt() {
        await openTheBag();
        fireEvent.click(
            screen.getByRole("button", { name: /^Place order · / }),
        );
        await screen.findByRole("heading", { name: "Order placed" });
    }

    it("sends the tag the page loaded with when a checkout starts", async () => {
        window.history.replaceState({}, "", "/shop/sourdough?src=qr-h7c");
        const { start } = setup(collect);
        await placeIt();
        expect(start.mock.calls[0][0]).toMatchObject({
            fulfilment: "PICKUP",
            source: "qr-h7c",
        });
    });

    it("keeps it while the visitor moves around the shop without a reload", async () => {
        window.history.replaceState({}, "", "/shop?src=qr-h7c");
        const { start } = setup(collect);
        // Another product, opened by a link inside the site: the same page
        // load, on an address that no longer carries the tag.
        window.history.pushState({}, "", "/shop/focaccia");
        await placeIt();
        expect(start.mock.calls[0][0].source).toBe("qr-h7c");
    });

    it("never puts the tag in the stored bag, a cookie or any storage", () => {
        window.history.replaceState({}, "", "/shop?src=qr-h7c");
        const { start } = setup(collect);
        addToBag(SITE, { listingId: "l-rolls", variantId: null, quantity: 1 });
        const kept = [
            document.cookie,
            JSON.stringify({ ...window.localStorage }),
            JSON.stringify({ ...window.sessionStorage }),
        ].join("\n");
        expect(kept).toContain("l-rolls");
        expect(kept).not.toContain("qr-");
        expect(kept).not.toContain("h7c");
        for (const item of readBag(SITE)) {
            expect(Object.keys(item)).toEqual([
                "listingId",
                "variantId",
                "quantity",
            ]);
        }
        expect(start).not.toHaveBeenCalled();
    });

    it("sends no source on a page load that had no tag", async () => {
        window.history.replaceState({}, "", "/shop");
        const { start } = setup(collect);
        // A tag that turns up on the address later is not this page load's.
        window.history.pushState({}, "", "/shop?src=qr-h7c");
        await placeIt();
        expect(start.mock.calls[0][0]).not.toHaveProperty("source");
    });
});

// ── What was typed, kept for the visit ────────────────────────────────────

describe("the bag's delivery fields on a phone", () => {
    const DELIVERY = quoteOf({
        ways: [
            { type: "LOCAL_DELIVERY", label: "Local delivery", fee: "60.00" },
        ],
        fulfilment: "LOCAL_DELIVERY",
    });

    it("are 16px so iOS doesn't zoom, with the keyboard and autofill each needs", async () => {
        setup({ signedIn: true, quote: { ok: true, data: DELIVERY } });
        await openTheBag();
        const pin = await screen.findByLabelText(/^PIN code/);
        expect(pin).toHaveAttribute("inputmode", "numeric");
        expect(pin).toHaveAttribute("maxlength", "6");
        expect(pin).toHaveAttribute("autocomplete", "postal-code");
        const phone = screen.getByLabelText(/^Phone/);
        expect(phone).toHaveAttribute("type", "tel");
        expect(phone).toHaveAttribute("inputmode", "tel");
        expect(phone).toHaveAttribute("autocomplete", "tel");
        for (const [label, auto] of [
            ["Name", "name"],
            ["Address", "address-line1"],
            ["Flat, floor or landmark", "address-line2"],
            ["Town or city", "address-level2"],
            ["State", "address-level1"],
        ] as const) {
            expect(
                screen.getByLabelText(new RegExp(`^${label}`)),
            ).toHaveAttribute("autocomplete", auto);
        }
        fireEvent.click(screen.getByRole("button", { name: "Have a code?" }));
        const fields = Array.from(
            document.querySelectorAll("input, select, textarea"),
        );
        // The address's seven, the code, and the note for the business.
        expect(fields).toHaveLength(9);
        for (const field of fields) {
            expect(field.className).toMatch(/\btext-base\b/);
            expect(field.className).not.toMatch(/text-\[1[0-5](\.\d)?px\]/);
        }
    });
});

describe("the bag through a reload (the email code is read in another app)", () => {
    const BOTH = quoteOf({
        ways: [
            { type: "PICKUP", label: "Pick-up", fee: null },
            { type: "LOCAL_DELIVERY", label: "Local delivery", fee: "60.00" },
        ],
        fulfilment: "LOCAL_DELIVERY",
        discount: { code: "SAVE10", applied: true, amount: "50.00" },
    });
    const TYPED = [
        ["Name", "Kavya Iyer"],
        ["Phone", "98450 12345"],
        ["Address", "12 Hill Road"],
        ["Town or city", "Mumbai"],
        ["PIN code", "400050"],
        ["State", "Maharashtra"],
    ] as const;

    async function fillTheBag() {
        fireEvent.click(screen.getByRole("radio", { name: /Local delivery/ }));
        for (const [label, value] of TYPED) {
            fireEvent.change(
                await screen.findByLabelText(new RegExp(`^${label}`)),
                { target: { value } },
            );
        }
        fireEvent.click(screen.getByRole("button", { name: "Have a code?" }));
        fireEvent.change(screen.getByLabelText("Discount code"), {
            target: { value: "save10" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        await screen.findByText("SAVE10 applied.");
    }

    it("finds the way, the address, the code and the checkout's key as they were", async () => {
        const first = setup({ quote: { ok: true, data: BOTH } });
        await openTheBag();
        await fillTheBag();
        // On to the email code, where the customer leaves for their inbox.
        fireEvent.click(
            await screen.findByRole("button", { name: /^Sign in and pay/ }),
        );
        await screen.findByLabelText("Email");
        expect(first.start).not.toHaveBeenCalled();
        const kept = readBagDraft(SITE);
        expect(kept.checkout?.key).toMatch(/^[A-Za-z0-9_-]+$/);

        // The page loads again: a new page, the same tab. (`setup` puts
        // the same two loaves in the bag, so it is emptied first.)
        cleanup();
        window.localStorage.clear();
        const second = setup({
            signedIn: true,
            quote: { ok: true, data: BOTH },
        });
        await openTheBag();
        expect(
            await screen.findByRole("radio", { name: /Local delivery/ }),
        ).toHaveAttribute("aria-checked", "true");
        for (const [label, value] of TYPED) {
            expect(screen.getByLabelText(new RegExp(`^${label}`))).toHaveValue(
                value,
            );
        }
        expect(screen.getByLabelText("Discount code")).toHaveValue("SAVE10");
        expect(await screen.findByText("SAVE10 applied.")).toBeInTheDocument();

        // The same bag placed is the same order: the key came back too.
        fireEvent.click(screen.getByRole("button", { name: /^Place order/ }));
        await screen.findByRole("heading", { name: "Order placed" });
        expect(second.start.mock.calls[0][0]).toMatchObject({
            key: kept.checkout?.key,
            fulfilment: "LOCAL_DELIVERY",
            discountCode: "SAVE10",
            address: { line1: "12 Hill Road", postalCode: "400050" },
        });
    });

    it("forgets it all once the order is placed", async () => {
        setup({ signedIn: true, quote: { ok: true, data: BOTH } });
        await openTheBag();
        await fillTheBag();
        expect(readBagDraft(SITE).address.line1).toBe("12 Hill Road");
        fireEvent.click(
            await screen.findByRole("button", { name: /^Place order/ }),
        );
        await screen.findByRole("heading", { name: "Order placed" });
        expect(readBagDraft(SITE)).toEqual(EMPTY_DRAFT);
        expect(window.sessionStorage.getItem(`saroh.bag-draft.${SITE}`)).toBe(
            null,
        );
    });

    it("keeps it in the tab only: no cookie, nothing in localStorage but the bag", async () => {
        setup({ quote: { ok: true, data: BOTH } });
        await openTheBag();
        await fillTheBag();
        expect(document.cookie).toBe("");
        expect(JSON.stringify({ ...window.localStorage })).not.toContain(
            "Hill Road",
        );
        expect(Object.keys(window.sessionStorage)).toEqual([
            `saroh.bag-draft.${SITE}`,
        ]);
    });
});

describe("parseBagDraft", () => {
    it("reads nothing kept, and anything strange, as an empty draft", () => {
        expect(parseBagDraft(null)).toEqual(EMPTY_DRAFT);
        expect(parseBagDraft("not json")).toEqual(EMPTY_DRAFT);
        expect(parseBagDraft("[1,2]")).toEqual(EMPTY_DRAFT);
        expect(parseBagDraft('"text"')).toEqual(EMPTY_DRAFT);
    });

    it("keeps only what it knows, field by field", () => {
        const draft = parseBagDraft(
            JSON.stringify({
                way: "TELEPORT",
                pay: "ON_HANDOVER",
                address: {
                    line1: "12 Hill Road",
                    city: 7,
                    postalCode: "4".repeat(500),
                    extra: "no",
                },
                code: "save 10!",
                checkout: { print: "{}", key: "not a key" },
                source: "qr-h7c",
            }),
        );
        expect(draft.way).toBeNull();
        expect(draft.pay).toBe("ON_HANDOVER");
        expect(draft.address.line1).toBe("12 Hill Road");
        expect(draft.address.city).toBe("");
        expect(draft.address.postalCode).toHaveLength(200);
        expect(draft.address).not.toHaveProperty("extra");
        expect(draft.code).toBeNull();
        expect(draft.checkout).toBeNull();
        expect(draft).not.toHaveProperty("source");
        expect(draft.saved).toBeNull();
    });

    it("keeps whether the address is their last one, and reads a typed state as the list names it", () => {
        const draft = parseBagDraft(
            JSON.stringify({
                saved: "shown",
                address: { line1: "12 Hill Road", state: " orissa" },
            }),
        );
        expect(draft.saved).toBe("shown");
        expect(draft.address.state).toBe("Odisha");
        expect(
            parseBagDraft(JSON.stringify({ saved: "yes" })).saved,
        ).toBeNull();
        expect(
            parseBagDraft(JSON.stringify({ address: { state: "Atlantis" } }))
                .address.state,
        ).toBe("");
    });
});
