import { act, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BookingService } from "./booking-flow/model";
import { laterWords, payChoices, payLaterText } from "./booking-flow/model";
import { fullSessionText } from "./booking-flow/waitlist";
import type { ProductPageData } from "./product/product-page";
import ProductPage from "./product/product-page";
import { ADDED_SHOWN_MS, AddToBag } from "./shop/add-to-bag";
import { payWords } from "./shop/bag-sheet";
import { toPayLead } from "./shop/order-confirmation";

/**
 * One word per thing on the customer's side of a merchant's site: Pick-up
 * (never collect), bag (never basket), booking (never appointment), the
 * payment window (never the provider's name), and no long dashes or
 * semicolons in anything a customer reads.
 */

afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
});

const SRC = __dirname;

/** Every source file a customer's page is drawn from. */
function sources(dir: string = SRC): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === "__snapshots__" ? [] : sources(full);
        }
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
            ? [full]
            : [];
    });
}

/** A file's lines that aren't comments, with where each is. */
function codeLines(file: string): { at: string; text: string }[] {
    const out: { at: string; text: string }[] = [];
    let block = false;
    readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
            const t = line.trim();
            if (block) {
                if (t.includes("*/")) block = false;
                return;
            }
            if (t.startsWith("/*") || t.startsWith("{/*")) {
                if (!t.includes("*/")) block = true;
                return;
            }
            if (t.startsWith("//") || t.startsWith("*")) return;
            out.push({
                at: `${file.slice(SRC.length + 1)}:${i + 1}`,
                text: t.replace(/\{\/\*.*?\*\/\}/g, ""),
            });
        });
    return out;
}

const lines = sources().flatMap(codeLines);

describe("the customer's words, across every block", () => {
    it("has no long dash between words", () => {
        // A lone "—" stands for "no value" in a table and stays; a dash
        // between words is a sentence that should be two.
        const found = lines.filter(
            ({ at, text }) =>
                /\S\s—\s\S/.test(text) &&
                // The editor's own notes to a merchant, not a customer's.
                !at.startsWith("block-fixture-preview.tsx"),
        );
        expect(found.map((l) => `${l.at}  ${l.text}`)).toEqual([]);
    });

    it("says Pick-up, never collect, and bag, never basket", () => {
        const found = lines.filter(
            ({ at, text }) =>
                /["'`>][^"'`<]*\b(collect|collects|collected|pickup|pick up|basket)\b/i.test(
                    text,
                ) &&
                // A product collection is the merchant's own word for a
                // group of products, and a cookie notice is about data.
                !/collection|cookie|PICKUP|pickup[.A-Z?]|collectFrom|\bpickup\b\s*[:=?&)|]/.test(
                    text,
                ) &&
                !at.startsWith("cookie-notice.tsx") &&
                !at.startsWith("block-fixture-preview.tsx"),
        );
        expect(found.map((l) => `${l.at}  ${l.text}`)).toEqual([]);
    });

    it("never names a payment provider to a customer", () => {
        const found = lines.filter(
            ({ at, text }) =>
                /["'`>][^"'`<]*\b(Razorpay|Cashfree|Stripe)\b[^"'`]*\b(window|payment|pay)\b/i.test(
                    text,
                ) && !at.startsWith("booking-flow/checkout.ts"),
        );
        expect(found.map((l) => `${l.at}  ${l.text}`)).toEqual([]);
    });
});

describe("paying after the order or the booking is made", () => {
    it("is at pick-up or on delivery for an order", () => {
        expect(payWords({ type: "ON_HANDOVER", label: "Pay at pick-up" })).toBe(
            "You'll pay at pick-up. Your order is placed now.",
        );
        expect(toPayLead("Pay at pick-up")).toBe("You'll pay at pick-up.");
        expect(toPayLead("Pay on delivery")).toBe(
            "You'll pay when your order is delivered.",
        );
    });

    const service = (over: Partial<BookingService> = {}): BookingService => ({
        id: "svc_1",
        name: "Consultation",
        description: null,
        durationMinutes: 30,
        kind: "one",
        capacity: 1,
        priceCents: 80_000,
        currency: "INR",
        online: false,
        staff: [],
        ...over,
    });

    it("is at the desk only for a service customers attend in person", () => {
        expect(laterWords(service(), "Kavi Dental")).toEqual({
            label: "Pay at the desk",
            sub: "Held for you. Pay when you arrive.",
            confirm: "Book and pay at the desk",
        });
        const [desk] = payChoices(service(), false, "Kavi Dental");
        expect(desk).toMatchObject({ pay: "DESK", label: "Pay at the desk" });
        expect(payLaterText("₹800", false, "Kavi Dental")).toBe(
            "Pay ₹800 at the front desk when you arrive.",
        );
    });

    it("is later, to the business directly, for a service held online", () => {
        const online = service({ online: true });
        expect(laterWords(online, "Kavi Dental")).toEqual({
            label: "Pay later",
            sub: "Held for you. Pay Kavi Dental directly.",
            confirm: "Book and pay later",
        });
        const [later] = payChoices(online, false, "Kavi Dental");
        expect(later).toMatchObject({ pay: "DESK", label: "Pay later" });
        expect(
            payChoices(online, false, "Kavi Dental")
                .map((c) => `${c.label} ${c.sub}`)
                .join(" "),
        ).not.toMatch(/desk|arrive/i);
        expect(payLaterText("₹800", true, "Kavi Dental")).toBe(
            "Pay ₹800 to Kavi Dental directly.",
        );
    });

    it("names a full class without a dash", () => {
        expect(fullSessionText(undefined, "Asia/Kolkata")).toBe(
            "Full. Join the waitlist",
        );
    });
});

const loaf: ProductPageData = {
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
    optionName: null,
    variants: [],
    stock: null,
    rating: null,
    reviews: [],
};

describe("a product nobody has reviewed", () => {
    it("says nothing about reviews on its live page", () => {
        render(<ProductPage product={loaf} preview={false} />);
        expect(screen.queryByRole("heading", { name: "Reviews" })).toBeNull();
        expect(screen.queryByText(/No reviews yet/)).toBeNull();
    });

    it("shows its reviews once it has some", () => {
        render(
            <ProductPage
                product={{
                    ...loaf,
                    rating: { average: 5, count: 1 },
                    reviews: [
                        {
                            id: "r1",
                            rating: 5,
                            body: "Lovely crust.",
                            displayName: "Meera K.",
                            variantTitle: null,
                            reply: null,
                            dateLabel: "12 Sep",
                        },
                    ],
                }}
                preview={false}
            />,
        );
        expect(screen.getByRole("heading", { name: "Reviews" })).toBeVisible();
        expect(screen.getByText("Lovely crust.")).toBeVisible();
    });

    it("keeps the note for the merchant's own preview, and says bag there too", () => {
        render(<ProductPage product={loaf} />);
        expect(screen.getByText(/No reviews yet/)).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "Add to bag" }));
        expect(screen.getByRole("status")).toHaveTextContent(
            "This is a preview. Nothing is added to a bag.",
        );
    });
});

describe("the added-to-your-bag message", () => {
    it("goes by itself after four seconds, and the button still offers another", () => {
        vi.useFakeTimers();
        expect(ADDED_SHOWN_MS).toBe(4_000);
        render(
            <ProductPage
                product={loaf}
                preview={false}
                action={<AddToBag site="site-words" listingId="l-loaf" />}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Add to bag · ₹250" }),
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "Sourdough added to your bag.",
        );
        act(() => {
            vi.advanceTimersByTime(3_900);
        });
        expect(screen.getByRole("status")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(screen.queryByRole("status")).toBeNull();
        // Adding again says it again, for another four seconds.
        fireEvent.click(
            screen.getByRole("button", { name: "Add another · ₹250" }),
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "Sourdough added to your bag.",
        );
        act(() => {
            vi.advanceTimersByTime(4_100);
        });
        expect(screen.queryByRole("status")).toBeNull();
    });
});

describe("booking in a look (DEC-172, U10)", () => {
    const looks = lines.filter(({ at }) =>
        /^booking-flow\/(look-|inline-code|sentence-picker|frames\/|book-return)/.test(
            at,
        ),
    );

    it("never tells a returning email from a new one", () => {
        const found = looks.filter(({ text }) =>
            /welcome back|booked (with us )?before|new here|returning/i.test(
                text,
            ),
        );
        expect(found.map((l) => `${l.at}  ${l.text}`)).toEqual([]);
    });

    it("promises no WhatsApp, no reminder and no enrolment it can't keep", () => {
        // In what a customer reads: a string, or a JSX text line. The
        // business's own chat link (`reach.whatsapp`) is not a promise.
        const said = (text: string) =>
            /["'`][^"'`]*(whatsapp|remind|\benrol)/i.test(text) ||
            (/^[A-Z][^=:;(){}]*$/.test(text) &&
                /whatsapp|remind|\benrol/i.test(text));
        const found = looks.filter(({ text }) => said(text));
        expect(found.map((l) => `${l.at}  ${l.text}`)).toEqual([]);
    });
});
