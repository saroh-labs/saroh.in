import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BackInStock } from "../shop/back-in-stock";
import type {
    BackInStockApi,
    WatchResult,
    WatchTaken,
} from "../shop/back-in-stock-shape";

import type { ProductPageData } from "./product-page";
import ProductPage, {
    formatAmount,
    percentOff,
    useProductSelection,
} from "./product-page";

const dress: ProductPageData = {
    name: "Linen Wrap Dress",
    currency: "INR",
    price: "2499.00",
    mrp: "3299.00",
    categoryName: "Dresses",
    description: "<p>A breezy wrap in washed linen.</p>",
    keyPoints: ["Adjustable tie waist", "Side pockets"],
    howToUse: "Hand wash cold, dry in shade.",
    materials: "100% linen",
    materialsLabel: "Fabric",
    maker: "Tanvi Studio, Jaipur",
    warranty: null,
    returns: "Exchange within 7 days, tags on",
    images: [
        {
            id: "i1",
            url: "https://img.test/cover.jpg",
            alt: "Sage wrap dress, front",
        },
        {
            id: "i2",
            url: "https://img.test/back.jpg",
            alt: "Sage wrap dress, back",
        },
    ],
    optionName: "Size",
    variants: [
        {
            id: "s",
            title: "S",
            price: null,
            mrp: null,
            imageId: null,
            stock: "SOLD_OUT",
            left: 0,
        },
        {
            id: "m",
            title: "M",
            price: null,
            mrp: null,
            imageId: null,
            stock: "LOW",
            left: 2,
        },
        {
            id: "l",
            title: "L",
            price: "2699.00",
            mrp: null,
            imageId: "i2",
            stock: "IN_STOCK",
            left: 9,
        },
    ],
    stock: null,
    rating: { average: 4.5, count: 2 },
    reviews: [
        {
            id: "r1",
            rating: 5,
            body: "Fits true to size.",
            displayName: "Meera K.",
            variantTitle: "M",
            reply: "Thank you, Meera!",
            dateLabel: "12 Sep",
        },
    ],
};

describe("ProductPage", () => {
    it("formats rupees without paise when whole, and rounds the saving down", () => {
        expect(formatAmount("2499.00", "INR")).toBe("₹2,499");
        expect(formatAmount("24.50", "INR")).toBe("₹24.50");
        expect(percentOff("649", "999")).toBe(35);
        expect(percentOff("799", "799")).toBeNull();
    });

    it("starts on the first variant that can be sold, with its stock word", () => {
        render(<ProductPage product={dress} />);
        expect(screen.getByRole("button", { name: "M" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByText("Only 2 left")).toBeInTheDocument();
        expect(screen.getByText("24% off")).toBeInTheDocument();
    });

    it("picking a variant changes the price, the saving and the photo", () => {
        render(<ProductPage product={dress} />);
        fireEvent.click(screen.getByRole("button", { name: "L" }));
        expect(screen.getByText("₹2,699")).toBeInTheDocument();
        // 2699 against the product's 3299 MRP.
        expect(screen.getByText("18% off")).toBeInTheDocument();
        expect(
            screen.getByAltText("Sage wrap dress, back"),
        ).toBeInTheDocument();
        expect(screen.getByText("In stock")).toBeInTheDocument();
    });

    it("a sold-out variant can be looked at but not bought", () => {
        render(<ProductPage product={dress} />);
        fireEvent.click(screen.getByRole("button", { name: "S (sold out)" }));
        expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
    });

    it("in preview, the basket says nothing was added", () => {
        render(<ProductPage product={dress} action={<p>Never shown</p>} />);
        fireEvent.click(screen.getByRole("button", { name: "Add to bag" }));
        expect(screen.getByRole("status")).toHaveTextContent(/preview/);
        // The action slot belongs to the live page only.
        expect(screen.queryByText("Never shown")).not.toBeInTheDocument();
    });

    it("leaves out a field that is team only, and draws markers only when asked", () => {
        const { rerender } = render(
            <ProductPage product={{ ...dress, maker: null, howToUse: null }} />,
        );
        expect(screen.queryByText("Made by")).not.toBeInTheDocument();
        expect(screen.queryByText(/Hand wash/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Note 1")).not.toBeInTheDocument();
        rerender(<ProductPage product={dress} markers />);
        expect(screen.getByLabelText("Note 1")).toBeInTheDocument();
        expect(screen.getByLabelText("Note 7")).toBeInTheDocument();
    });

    it("lists the merchant's own fields shown on the shop", () => {
        render(
            <ProductPage
                product={{
                    ...dress,
                    extras: [{ label: "Fabric care", value: "Dry clean only" }],
                }}
            />,
        );
        expect(screen.getByText("Fabric care")).toBeInTheDocument();
        expect(screen.getByText("Dry clean only")).toBeInTheDocument();
    });

    it("renders with no photos, no variants and no reviews", () => {
        render(
            <ProductPage
                product={{
                    ...dress,
                    images: [],
                    variants: [],
                    optionName: null,
                    stock: { word: "IN_STOCK", left: 12 },
                    rating: null,
                    reviews: [],
                }}
            />,
        );
        // No empty frame, and no owner's note where a customer reads.
        expect(screen.queryByText("No photo yet")).toBeNull();
        expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
        expect(screen.getByText("₹2,499")).toBeInTheDocument();
    });

    it("keeps the words No photo yet for the workspace's staff notes only", () => {
        const bare = { ...dress, images: [] };
        const { rerender } = render(<ProductPage product={bare} markers />);
        expect(screen.getByText("No photo yet")).toBeInTheDocument();
        expect(screen.getByLabelText("Note 1")).toBeInTheDocument();
        rerender(<ProductPage product={bare} preview={false} markers />);
        expect(screen.queryByText("No photo yet")).toBeNull();
    });

    it("shows a video with its length, and its poster with Open video when it can't play", () => {
        const { container } = render(
            <ProductPage
                product={{
                    ...dress,
                    images: [
                        ...dress.images,
                        {
                            id: "v1",
                            url: "https://img.test/twirl.mov",
                            alt: "The dress, twirling",
                            kind: "video",
                            durationSec: 24,
                            posterUrl: "https://img.test/twirl.jpg",
                        },
                    ],
                }}
            />,
        );
        const thumb = screen.getByRole("button", {
            name: "Show video 3: The dress, twirling, 0:24",
        });
        expect(thumb).toHaveTextContent("0:24");
        fireEvent.click(thumb);
        const video = container.querySelector("video");
        expect(video).toHaveAttribute("src", "https://img.test/twirl.mov");
        expect(video).toHaveAttribute("poster", "https://img.test/twirl.jpg");

        if (!video) throw new Error("No video on the page");
        fireEvent.error(video);
        expect(container.querySelector("video")).toBeNull();
        expect(
            screen.getByRole("img", { name: "The dress, twirling" }),
        ).toHaveAttribute("src", "https://img.test/twirl.jpg");
        expect(
            screen.getByRole("link", { name: "Open video" }),
        ).toHaveAttribute("href", "https://img.test/twirl.mov");
    });
});

/** What G13's Add to bag will read: the choice, through the slot. */
function SelectionProbe() {
    const chosen = useProductSelection();
    return (
        <p data-testid="probe">
            {chosen
                ? `${chosen.variantId ?? "none"} ${chosen.price} ${chosen.soldOut ? "off" : "on"}`
                : "outside"}
        </p>
    );
}

describe("ProductPage on the live site (G11)", () => {
    it("draws no staff controls: no markers, no preview basket", () => {
        render(<ProductPage product={dress} preview={false} markers />);
        expect(screen.queryByLabelText("Note 1")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Add to bag" }),
        ).not.toBeInTheDocument();
        // The product itself is all there.
        expect(screen.getByText("Linen Wrap Dress")).toBeInTheDocument();
        expect(screen.getByText("Only 2 left")).toBeInTheDocument();
    });

    it("leaves the action slot empty until checkout fills it", () => {
        render(<ProductPage product={dress} preview={false} />);
        expect(screen.queryByTestId("probe")).toBeNull();
        expect(
            screen.queryByRole("button", { name: /bag|basket/i }),
        ).toBeNull();
    });

    it("hands the slot the chosen variant, and turns the action off when it is sold out", () => {
        render(
            <ProductPage
                product={dress}
                preview={false}
                action={<SelectionProbe />}
            />,
        );
        expect(screen.getByTestId("probe")).toHaveTextContent("m 2499.00 on");
        fireEvent.click(screen.getByRole("button", { name: "L" }));
        expect(screen.getByTestId("probe")).toHaveTextContent("l 2699.00 on");
        fireEvent.click(screen.getByRole("button", { name: "S (sold out)" }));
        expect(screen.getByTestId("probe")).toHaveTextContent("s 2499.00 off");
        expect(screen.getByText("Sold out")).toBeInTheDocument();
    });

    it("reads nothing outside a product page", () => {
        render(<SelectionProbe />);
        expect(screen.getByTestId("probe")).toHaveTextContent("outside");
    });
});

describe("the facts under the price", () => {
    it("says every price includes its taxes, with an MRP or without", () => {
        const { unmount } = render(<ProductPage product={dress} />);
        expect(screen.getByText("Inclusive of all taxes")).toBeVisible();
        unmount();
        render(
            <ProductPage
                product={{ ...dress, mrp: null, variants: [] }}
                preview={false}
            />,
        );
        expect(screen.getByText("Inclusive of all taxes")).toBeVisible();
    });

    const plain: ProductPageData = {
        ...dress,
        price: "1000.00",
        mrp: null,
        variants: [],
    };
    const includes = {
        mode: "INCLUDED" as const,
        rate: "18",
        listCents: 100000,
        gstCents: 15254,
        payCents: 100000,
    };
    const adds = {
        mode: "ADDED" as const,
        rate: "18",
        listCents: 100000,
        gstCents: 18000,
        payCents: 118000,
    };

    it("keeps that line when the API says nothing about GST", () => {
        render(<ProductPage product={{ ...plain, gst: null }} />);
        expect(screen.getByText("Inclusive of all taxes")).toBeVisible();
        expect(screen.queryByText(/GST/)).toBeNull();
    });

    it("says the GST a price includes, in place of that line", () => {
        const { container } = render(
            <ProductPage product={{ ...plain, gst: includes }} />,
        );
        expect(container.querySelector("[data-price-gst]")).toHaveTextContent(
            /^Includes ₹152\.54 GST \(18%\)$/,
        );
        expect(screen.queryByText("Inclusive of all taxes")).toBeNull();
    });

    it("says the GST added on top, and what there is to pay", () => {
        const { container } = render(
            <ProductPage product={{ ...plain, gst: adds }} />,
        );
        expect(container.querySelector("[data-price-gst]")).toHaveTextContent(
            /^\+ ₹180 GST \(18%\) · ₹1,180 to pay$/,
        );
        // The price itself stays the one the business typed.
        expect(screen.getByText("₹1,000")).toBeVisible();
        expect(screen.queryByText("Inclusive of all taxes")).toBeNull();
    });

    it("follows the option picked: its own GST, else nothing made up", () => {
        const large = {
            mode: "ADDED" as const,
            rate: "18",
            listCents: 269900,
            gstCents: 48582,
            payCents: 318482,
        };
        const { container } = render(
            <ProductPage
                product={{
                    ...dress,
                    price: "1000.00",
                    mrp: null,
                    gst: adds,
                    variants: dress.variants.map((v) => ({
                        ...v,
                        gst: v.id === "l" ? large : adds,
                    })),
                }}
            />,
        );
        const line = () => container.querySelector("[data-price-gst]");
        expect(line()).toHaveTextContent("+ ₹180 GST (18%) · ₹1,180 to pay");
        fireEvent.click(screen.getByRole("button", { name: "L" }));
        expect(line()).toHaveTextContent(
            "+ ₹485.82 GST (18%) · ₹3,184.82 to pay",
        );
    });

    it("reads an older API's options: the product's GST at the product's price only", () => {
        const { container } = render(
            <ProductPage
                product={{ ...dress, price: "1000.00", mrp: null, gst: adds }}
            />,
        );
        // M sells at the product's price: the product's words.
        expect(container.querySelector("[data-price-gst]")).toHaveTextContent(
            "+ ₹180 GST (18%)",
        );
        // L has a price of its own and no GST from the API: none is said.
        fireEvent.click(screen.getByRole("button", { name: "L" }));
        expect(container.querySelector("[data-price-gst]")).toBeNull();
        expect(screen.getByText("Inclusive of all taxes")).toBeVisible();
    });

    it("tells the action when GST comes on top", () => {
        function Probe() {
            const s = useProductSelection();
            return <p data-testid="gst-probe">{String(s?.gstAdded)}</p>;
        }
        const { unmount } = render(
            <ProductPage
                product={{ ...plain, gst: adds }}
                preview={false}
                action={<Probe />}
            />,
        );
        expect(screen.getByTestId("gst-probe")).toHaveTextContent("true");
        unmount();
        render(
            <ProductPage
                product={{ ...plain, gst: includes }}
                preview={false}
                action={<Probe />}
            />,
        );
        expect(screen.getByTestId("gst-probe")).toHaveTextContent("false");
    });

    it("says what it costs to receive, in the body colour, when the shop takes orders", () => {
        render(
            <ProductPage
                product={dress}
                preview={false}
                facts="Pick-up free · Local delivery ₹40 · Free delivery from ₹999"
            />,
        );
        const line = screen.getByText(
            "Pick-up free · Local delivery ₹40 · Free delivery from ₹999",
        );
        expect(line.className).toContain("text-site-body");
        expect(line.className).toContain("text-sm");
        expect(line.className).not.toContain("text-site-muted");
    });

    it("says nothing about delivery when the page was given nothing", () => {
        render(<ProductPage product={dress} preview={false} />);
        expect(screen.queryByText(/Pick-up|delivery/i)).toBeNull();
    });
});

describe("a product with no photo, on the live page", () => {
    const bare: ProductPageData = { ...dress, images: [] };

    it("draws no frame: the name leads, and the words take the second column", () => {
        const { container } = render(
            <ProductPage product={bare} preview={false} />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector(".aspect-\\[4\\/5\\]")).toBeNull();
        expect(container).not.toHaveTextContent("No photo yet");
        const layout = container.querySelector("[data-product-layout]");
        expect(layout).toHaveAttribute("data-product-layout", "words");
        expect(layout?.className).toContain("md:grid-cols-");
        // Everything a shopper needs is still there.
        expect(
            screen.getByRole("heading", { level: 1, name: "Linen Wrap Dress" }),
        ).toBeInTheDocument();
        expect(screen.getByText("About this product")).toBeInTheDocument();
        expect(screen.getByText("Details")).toBeInTheDocument();
        expect(screen.getByText("Only 2 left")).toBeInTheDocument();
    });

    it("is one column when there is nothing more to say about it", () => {
        const { container } = render(
            <ProductPage
                product={{
                    ...bare,
                    description: null,
                    keyPoints: [],
                    materials: null,
                    maker: null,
                    returns: null,
                }}
                preview={false}
            />,
        );
        const layout = container.querySelector("[data-product-layout]");
        expect(layout?.className).not.toContain("md:grid-cols-");
        expect(screen.queryByText("About this product")).toBeNull();
        expect(screen.queryByText("Details")).toBeNull();
    });

    it("keeps the photos' layout for a product that has them", () => {
        const { container } = render(
            <ProductPage product={dress} preview={false} />,
        );
        expect(
            container.querySelector("[data-product-layout]"),
        ).toHaveAttribute("data-product-layout", "photos");
        const cover = screen.getByAltText("Sage wrap dress, front");
        // Room kept for it before it arrives.
        expect(cover).toHaveAttribute("width");
        expect(cover).toHaveAttribute("height");
    });
});

describe("the way back to the shop", () => {
    it("links the live product page to the shop, by the shop's own name", () => {
        render(
            <ProductPage
                product={dress}
                preview={false}
                back={{ href: "/shop", label: "Our counter" }}
            />,
        );
        const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
        const link = screen.getByRole("link", { name: "Our counter" });
        expect(nav).toContainElement(link);
        expect(link).toHaveAttribute("href", "/shop");
        // Reachable by a thumb.
        expect(link.className).toContain("coarse:min-h-11");
    });

    it("draws none in the workspace's preview, or when the page was given none", () => {
        const { rerender } = render(
            <ProductPage
                product={dress}
                back={{ href: "/shop", label: "Shop" }}
            />,
        );
        expect(screen.queryByRole("navigation")).toBeNull();
        rerender(<ProductPage product={dress} preview={false} />);
        expect(screen.queryByRole("navigation")).toBeNull();
    });
});

describe("choosing an option", () => {
    it("keeps a sold-out option readable when it is the one picked", () => {
        render(<ProductPage product={dress} preview={false} />);
        const small = screen.getByRole("button", { name: "S (sold out)" });
        // Not picked: quiet, struck through and dashed.
        expect(small.className).toContain("line-through");
        expect(small.className).toContain("border-dashed");
        fireEvent.click(small);
        // Picked: the picked colours, never quiet words on the ink.
        expect(small).toHaveAttribute("aria-pressed", "true");
        expect(small.className).toContain("text-site-bg");
        expect(small.className).not.toContain("text-site-muted");
        expect(small.className).toContain("line-through");
    });
});

/**
 * GST is part of MRP (12 Oct 2026): the saving is the MRP against the
 * amount to pay, GST and all. The API works it out (`saving`); the page
 * only draws it.
 */
describe("the saving against the MRP is true", () => {
    const one: ProductPageData = {
        ...dress,
        price: "1000.00",
        mrp: "1475.00",
        variants: [],
    };
    // ₹1,000 + 18% is ₹1,180 to pay.
    const adds = {
        mode: "ADDED" as const,
        rate: "18",
        listCents: 100000,
        gstCents: 18000,
        payCents: 118000,
    };
    const includes = {
        mode: "INCLUDED" as const,
        rate: "18",
        listCents: 100000,
        gstCents: 15254,
        payCents: 100000,
    };
    const struck = (c: HTMLElement) => c.querySelector("[data-price-mrp]");
    const badge = (c: HTMLElement) => c.querySelector("[data-price-off]");

    it("prices include GST: the MRP against the price, as the API says it", () => {
        // 1,475 - 1,000 = 475 off; 475 / 1,475 is 32.2%, said as 32.
        const { container } = render(
            <ProductPage
                product={{
                    ...one,
                    gst: includes,
                    saving: { mrp: "1475.00", percent: 32 },
                }}
            />,
        );
        expect(struck(container)).toHaveTextContent("MRP ₹1,475");
        expect(badge(container)).toHaveTextContent("32% off");
    });

    it("GST is added: the saving is against ₹1,180 to pay, not the ₹1,000 typed", () => {
        // 1,475 - 1,180 = 295 off; 295 / 1,475 is exactly 20%. Against the
        // typed ₹1,000 it would have claimed 32%.
        const { container } = render(
            <ProductPage
                product={{
                    ...one,
                    gst: adds,
                    saving: { mrp: "1475.00", percent: 20 },
                }}
            />,
        );
        expect(struck(container)).toHaveTextContent("MRP ₹1,475");
        expect(badge(container)).toHaveTextContent("20% off");
        expect(container).not.toHaveTextContent("32% off");
    });

    it("the amount to pay is the MRP: no saving and nothing struck through", () => {
        // Typed ₹1,000 under an MRP of ₹1,180; ₹1,180 is paid.
        const { container } = render(
            <ProductPage
                product={{ ...one, mrp: "1180.00", gst: adds, saving: null }}
            />,
        );
        expect(struck(container)).toBeNull();
        expect(badge(container)).toBeNull();
        expect(container).not.toHaveTextContent("% off");
        // The price and what is paid are still said.
        expect(container.querySelector("[data-price-gst]")).toHaveTextContent(
            "+ ₹180 GST (18%) · ₹1,180 to pay",
        );
    });

    it("a product already over its MRP shows no saving and still sells", () => {
        // Typed ₹1,000 under an MRP of ₹1,100; ₹1,180 is paid.
        const { container } = render(
            <ProductPage
                product={{ ...one, mrp: "1100.00", gst: adds, saving: null }}
            />,
        );
        expect(struck(container)).toBeNull();
        expect(container).not.toHaveTextContent("% off");
        expect(
            screen.getByRole("button", { name: "Add to bag" }),
        ).toBeEnabled();
    });

    it("follows the option picked, each with the API's own saving", () => {
        const { container } = render(
            <ProductPage
                product={{
                    ...dress,
                    price: "1000.00",
                    mrp: "1475.00",
                    gst: adds,
                    saving: { mrp: "1475.00", percent: 20 },
                    variants: dress.variants.map((v) =>
                        v.id === "l"
                            ? {
                                  ...v,
                                  // ₹1,250 + 18% is ₹1,475 to pay: the MRP.
                                  price: "1250.00",
                                  gst: {
                                      ...adds,
                                      listCents: 125000,
                                      gstCents: 22500,
                                      payCents: 147500,
                                  },
                                  saving: null,
                              }
                            : {
                                  ...v,
                                  gst: adds,
                                  saving: { mrp: "1475.00", percent: 20 },
                              },
                    ),
                }}
            />,
        );
        expect(badge(container)).toHaveTextContent("20% off");
        fireEvent.click(screen.getByRole("button", { name: "L" }));
        expect(struck(container)).toBeNull();
        expect(badge(container)).toBeNull();
    });

    it("under one whole percent the MRP is struck through with no number said", () => {
        const { container } = render(
            <ProductPage
                product={{
                    ...one,
                    mrp: "1001.00",
                    saving: { mrp: "1001.00", percent: 0 },
                }}
            />,
        );
        expect(struck(container)).toHaveTextContent("MRP ₹1,001");
        expect(badge(container)).toBeNull();
    });

    it("with no saving from the API, compares the MRP with the amount to pay it holds", () => {
        // An older API, GST added: 1,475 against ₹1,180, never ₹1,000.
        const older = render(<ProductPage product={{ ...one, gst: adds }} />);
        expect(badge(older.container)).toHaveTextContent("20% off");
        older.unmount();
        // The same at the MRP: none.
        const equal = render(
            <ProductPage product={{ ...one, mrp: "1180.00", gst: adds }} />,
        );
        expect(struck(equal.container)).toBeNull();
        equal.unmount();
        // The workspace's preview sends no GST at all: the typed price.
        const preview = render(<ProductPage product={one} />);
        expect(badge(preview.container)).toHaveTextContent("32% off");
    });

    it("an answer that isn't a saving is none", () => {
        const { container } = render(
            <ProductPage
                product={{
                    ...one,
                    saving: { percent: "lots" } as never,
                }}
            />,
        );
        expect(struck(container)).toBeNull();
    });
});

/**
 * "Tell me when it's back" in the action slot (DEC-174, U24, #1155): asked
 * of the API for the sold-out option on screen, drawn only when offered,
 * in the site's own look.
 */
describe("Tell me when it's back", () => {
    function api(overrides: Partial<BackInStockApi> = {}): BackInStockApi & {
        offer: ReturnType<typeof vi.fn>;
        watch: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
    } {
        return {
            offer: vi.fn(() =>
                Promise.resolve({
                    ok: true as const,
                    data: { offered: true, why: null },
                }),
            ),
            watch: vi.fn(() =>
                Promise.resolve({
                    ok: true as const,
                    data: { state: "waiting" as const, stopToken: "v1.w1.sig" },
                }),
            ),
            stop: vi.fn(() =>
                Promise.resolve({
                    ok: true as const,
                    data: {
                        state: "stopped" as const,
                        business: "Tanvi Studio",
                        product: "Linen Wrap Dress (S)",
                    },
                }),
            ),
            ...overrides,
        } as never;
    }

    function page(a: BackInStockApi, look?: "folio" | "quiet" | "live") {
        return render(
            <ProductPage
                product={dress}
                preview={false}
                look={look}
                action={
                    <BackInStock
                        api={a}
                        productId="prd_dress"
                        business="Tanvi Studio"
                        look={look}
                    />
                }
            />,
        );
    }

    async function soldOut(
        a: BackInStockApi,
        look?: "folio" | "quiet" | "live",
    ) {
        page(a, look);
        // A look draws the options as radios (DEC-172).
        fireEvent.click(
            screen.getByRole(look ? "radio" : "button", {
                name: "S (sold out)",
            }),
        );
        return screen.findByRole("button", { name: "Tell me when it's back" });
    }

    it("draws nothing, and asks nothing, while the option can be bought", () => {
        const a = api();
        page(a);
        expect(screen.queryByLabelText("Your email")).toBeNull();
        expect(a.offer).not.toHaveBeenCalled();
    });

    it("asks for the sold-out option on screen and shows the form with the consent line", async () => {
        const a = api();
        await soldOut(a);
        expect(a.offer).toHaveBeenCalledWith("prd_dress", "s");
        expect(screen.getByLabelText("Your email")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Tanvi Studio will email you now and when it's back. Nothing else.",
            ),
        ).toBeInTheDocument();
    });

    it("draws nothing when the business doesn't offer it", async () => {
        const a = api({
            offer: vi.fn(() =>
                Promise.resolve({
                    ok: true as const,
                    data: { offered: false, why: "SWITCHED_OFF" as const },
                }),
            ),
        });
        page(a);
        fireEvent.click(screen.getByRole("button", { name: "S (sold out)" }));
        await waitFor(() => expect(a.offer).toHaveBeenCalled());
        await act(() => Promise.resolve());
        expect(screen.queryByLabelText("Your email")).toBeNull();
    });

    it("draws nothing when the question fails", async () => {
        const a = api({ offer: vi.fn(() => Promise.reject(new Error("x"))) });
        page(a);
        fireEvent.click(screen.getByRole("button", { name: "S (sold out)" }));
        await act(() => Promise.resolve());
        expect(screen.queryByLabelText("Your email")).toBeNull();
    });

    it("says a typo under the field and sends nothing", async () => {
        const a = api();
        const button = await soldOut(a);
        fireEvent.change(screen.getByLabelText("Your email"), {
            target: { value: "asha@example" },
        });
        fireEvent.click(button);
        expect(
            await screen.findByText("Enter an email like name@example.com."),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Your email")).toHaveAttribute(
            "aria-invalid",
            "true",
        );
        expect(a.watch).not.toHaveBeenCalled();
    });

    it("takes a valid address for the option, then says where it will email", async () => {
        const a = api();
        const button = await soldOut(a);
        fireEvent.change(screen.getByLabelText("Your email"), {
            target: { value: "  Asha@Example.com " },
        });
        fireEvent.click(button);
        expect(
            await screen.findByText("We'll email you at asha@example.com."),
        ).toBeInTheDocument();
        expect(a.watch).toHaveBeenCalledWith({
            productId: "prd_dress",
            variantId: "s",
            email: "asha@example.com",
        });
        expect(screen.queryByLabelText("Your email")).toBeNull();
    });

    it("offers Stop waiting while it waits, and says it won't email after", async () => {
        const a = api();
        const button = await soldOut(a);
        fireEvent.change(screen.getByLabelText("Your email"), {
            target: { value: "asha@example.com" },
        });
        fireEvent.click(button);
        fireEvent.click(
            await screen.findByRole("button", { name: "Stop waiting" }),
        );
        expect(
            await screen.findByText("You won't be emailed about it."),
        ).toBeInTheDocument();
        expect(a.stop).toHaveBeenCalledWith("v1.w1.sig");
    });

    it("an address already waiting gets no way to stop it", async () => {
        const a = api({
            watch: vi.fn((): Promise<WatchResult<WatchTaken>> =>
                Promise.resolve({
                    ok: true,
                    data: { state: "waiting", stopToken: null },
                }),
            ),
        });
        const button = await soldOut(a);
        fireEvent.change(screen.getByLabelText("Your email"), {
            target: { value: "asha@example.com" },
        });
        fireEvent.click(button);
        await screen.findByText("We'll email you at asha@example.com.");
        expect(
            screen.queryByRole("button", { name: "Stop waiting" }),
        ).toBeNull();
    });

    it.each([
        [
            "test-release",
            "This is a test release. Nothing here is ordered, booked or paid.",
        ],
        ["busy", "Too many tries. Wait a minute and try again."],
        ["error", "We couldn't save that. Try again."],
    ] as const)(
        "says a %s refusal in plain words and keeps the form",
        async (reason, message) => {
            const a = api({
                watch: vi.fn(() =>
                    Promise.resolve({ ok: false as const, reason, message }),
                ),
            });
            const button = await soldOut(a);
            fireEvent.change(screen.getByLabelText("Your email"), {
                target: { value: "asha@example.com" },
            });
            fireEvent.click(button);
            expect(await screen.findByRole("alert")).toHaveTextContent(message);
            expect(screen.getByLabelText("Your email")).toBeInTheDocument();
        },
    );

    it("a refusal because it's back says so in place of the form", async () => {
        const a = api({
            watch: vi.fn(() =>
                Promise.resolve({
                    ok: false as const,
                    reason: "not-offered" as const,
                    message:
                        "This is in stock now. Refresh the page to buy it.",
                }),
            ),
        });
        const button = await soldOut(a);
        fireEvent.change(screen.getByLabelText("Your email"), {
            target: { value: "asha@example.com" },
        });
        fireEvent.click(button);
        expect(
            await screen.findByText(
                "This is in stock now. Refresh the page to buy it.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText("Your email")).toBeNull();
    });

    it.each(["folio", "quiet", "live"] as const)(
        "under %s, draws the look's own field and button, from --site-* only",
        async (look) => {
            const button = await soldOut(api(), look);
            const field = screen.getByLabelText("Your email");
            expect(field.className).toContain("rounded-site-s");
            expect(button.className).toContain("rounded-site");
            expect(button.className).toContain("bg-site-accent");
            for (const el of [field, button]) {
                expect(el.className).not.toMatch(
                    /(^|\s)(bg|text|border)-(primary|accent|foreground|muted)(\s|$)/,
                );
            }
        },
    );
});
