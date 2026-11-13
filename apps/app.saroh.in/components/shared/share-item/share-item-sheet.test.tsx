// @vitest-environment jsdom
/**
 * Share as a post (#1375 U2, boards SFBDesk, SFBPhone, SFNoImage*,
 * SFCopiedPhone, SFLock*): the card picker asks the API for the chosen
 * style and size; Offer only with a live offer; the desk's four actions
 * carry the caption as edited and the tagged link; the phone copies the
 * caption first, then shares one PNG with the caption and link; a picture
 * that can't be made leaves the caption and link working with one
 * message; Schedule is locked, Free to the plans and Grow to the add-on.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Edition } from "@saroh/edition";

import type { ShareItem, ShareSetup } from "@/lib/share-item/share";

import { ShareItemButton } from "./share-item-sheet";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
const edition: { name: Edition } = vi.hoisted(() => ({ name: "INDIA" }));
vi.mock("@/lib/edition", async (actual) => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        ...(await actual<object>()),
        get PROFILE() {
            return editionProfile(edition.name);
        },
    };
});
const toast = { showError: vi.fn() };
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
}));

const BUNS: ShareItem = {
    kind: "product",
    ref: "cardamom-bun-box",
    name: "Cardamom bun box",
    price: "₹360",
    url: "https://rye.example.com/shop/cardamom-bun-box",
    offerId: null,
};
const LINK =
    "https://rye.example.com/shop/cardamom-bun-box?utm_source=saroh-share&utm_medium=social";
const FREE: ShareSetup = {
    apiOrigin: "https://api.example.com",
    siteId: "site_1",
    schedule: { tier: "free" },
};

let root: Root;
let host: HTMLDivElement;
let fetched: string[];
let fetchOk: boolean;
const clipboard: string[] = [];
const order: string[] = [];

function size(phone: boolean) {
    window.matchMedia = ((query: string) => ({
        matches: phone && query.includes("max-width: 759px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    size(false);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    toast.showError.mockReset();
    fetched = [];
    fetchOk = true;
    clipboard.length = 0;
    order.length = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            fetched.push(url);
            return Promise.resolve({
                ok: fetchOk,
                status: fetchOk ? 200 : 500,
                blob: () =>
                    Promise.resolve(new Blob(["png"], { type: "image/png" })),
            });
        }),
    );
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
            writeText: (t: string) => {
                order.push("copy");
                clipboard.push(t);
                return Promise.resolve();
            },
        },
    });
});

afterEach(() => {
    edition.name = "INDIA";
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
    });
});

async function flush() {
    for (let i = 0; i < 6; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

async function openSheet(item: ShareItem = BUNS, setup: ShareSetup = FREE) {
    act(() => root.render(<ShareItemButton item={item} setup={setup} />));
    const trigger = host.querySelector<HTMLButtonElement>("[data-share-item]");
    if (!trigger) throw new Error("No Share button");
    await act(async () => {
        trigger.click();
        await Promise.resolve();
    });
    await flush();
}

const sheet = () => {
    const el = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!el) throw new Error("The sheet is not open");
    return el;
};
function named<T extends HTMLElement>(selector: string, name: string): T {
    const hit = Array.from(document.querySelectorAll<T>(selector)).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!hit) throw new Error(`No ${selector} "${name}"`);
    return hit;
}
const button = (name: string) => named<HTMLButtonElement>("button", name);
const link = (name: string) => named<HTMLAnchorElement>("a", name);
const caption = () => {
    const box = sheet().querySelector("textarea");
    if (!box) throw new Error("No caption");
    return box;
};
const last = () =>
    new URL(fetched[fetched.length - 1] ?? "", "https://app.example.com");

async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
    await flush();
}

function type(value: string) {
    const box = caption();
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
        )?.set?.call(box, value);
        box.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("at a desk", () => {
    it("fetches the chosen card at the chosen size; picking changes both", async () => {
        await openSheet();
        expect(sheet().textContent).toContain("Share Cardamom bun box");
        expect(last().pathname).toBe(
            "/public/share/site_1/product/cardamom-bun-box/image",
        );
        expect(last().searchParams.get("style")).toBe("price");
        expect(last().searchParams.get("size")).toBe("post");

        await press(button("Simple"));
        expect(last().searchParams.get("style")).toBe("simple");

        await press(button("Story 9:16"));
        expect(last().searchParams.get("size")).toBe("story");
        expect(last().searchParams.get("style")).toBe("simple");
        // Every card in the row follows the size.
        const thumbs = Array.from(
            sheet().querySelectorAll<HTMLImageElement>("[data-card] img"),
        );
        expect(thumbs.every((i) => i.src.includes("size=story"))).toBe(true);
    });

    it("draws Offer only while the item has a live offer", async () => {
        await openSheet();
        expect(sheet().querySelector('[data-card="offer"]')).toBeNull();
        act(() => root.unmount());
        root = createRoot(host);
        await openSheet({ ...BUNS, offerId: "disc_1" });
        await press(button("Offer"));
        expect(last().pathname).toBe("/public/share/site_1/offer/disc_1/image");
        expect(last().searchParams.get("style")).toBe("offer");
    });

    it("moves through the cards with the arrow keys", async () => {
        await openSheet();
        const chosen = sheet().querySelector<HTMLElement>(
            '[data-card="price"]',
        );
        await act(async () => {
            chosen?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
            await Promise.resolve();
        });
        await flush();
        expect(last().searchParams.get("style")).toBe("simple");
    });

    it("sends the caption as edited, with its tagged link, by every action", async () => {
        await openSheet();
        expect(caption().value).toBe(
            `Cardamom bun box, for ₹360. Order here: ${LINK}`,
        );
        type("Fresh cardamom buns, baked every morning.");
        const shared = `Fresh cardamom buns, baked every morning. ${LINK}`;

        await press(button("Copy caption"));
        expect(clipboard).toEqual([shared]);
        expect(sheet().textContent).toContain("Copied");

        expect(link("Send on WhatsApp").href).toBe(
            `https://wa.me/?text=${encodeURIComponent(shared)}`,
        );
        expect(link("Share on Facebook").href).toBe(
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(LINK)}`,
        );
        expect(button("Download image").disabled).toBe(false);
    });

    it("starts again from a chip: Hinglish is a fixed template", async () => {
        await openSheet();
        await press(button("Hinglish"));
        expect(caption().value).toBe(
            `Cardamom bun box ab available hai sirf ₹360 mein. Order karne ke liye yahan dekhein: ${LINK}`,
        );
    });

    it("a picture that can't be made: one message, Download off, the caption still goes", async () => {
        fetchOk = false;
        await openSheet();
        expect(sheet().querySelectorAll("[data-picture-failed]")).toHaveLength(
            1,
        );
        expect(sheet().textContent).toContain("The picture couldn't be made");
        expect(button("Download image").disabled).toBe(true);
        expect(toast.showError).not.toHaveBeenCalled();
        await press(button("Copy caption"));
        expect(clipboard).toHaveLength(1);
        expect(link("Send on WhatsApp").href).toContain("wa.me");

        fetchOk = true;
        const before = fetched.length;
        await press(button("Try again"));
        expect(fetched.length).toBe(before + 1);
        expect(sheet().querySelector("[data-picture-failed]")).toBeNull();
    });

    it("Free: Schedule is locked, pointing at the plans", async () => {
        await openSheet();
        expect(sheet().textContent).toContain(
            "Schedule to Instagram, Facebook and Threads with Saroh Social.",
        );
        expect(link("See plans").getAttribute("href")).toBe(
            "/settings/billing/plans",
        );
        await press(button("Schedule, locked"));
        const offer = document.querySelector('[data-social-offer="free"]');
        expect(offer?.textContent).toContain("Schedule with Saroh Social");
        expect(offer?.textContent).toContain(
            "Share now stays free on every plan.",
        );
    });

    it("Grow: the add-on, with the catalogue's price or none", async () => {
        await openSheet(BUNS, {
            ...FREE,
            schedule: { tier: "grow", price: "₹299" },
        });
        expect(
            link("Add Saroh Social · ₹299 a month").getAttribute("href"),
        ).toBe("/settings/billing#add-ons");
        expect(sheet().textContent).not.toContain("See plans");

        act(() => root.unmount());
        root = createRoot(host);
        await openSheet(BUNS, {
            ...FREE,
            schedule: { tier: "grow", price: null },
        });
        expect(link("Add Saroh Social").getAttribute("href")).toBe(
            "/settings/billing#add-ons",
        );
    });
});

describe("on a phone", () => {
    beforeEach(() => size(true));

    function phoneShare(result: () => Promise<void> = () => Promise.resolve()) {
        const share = vi.fn(() => {
            order.push("share");
            return result();
        });
        Object.defineProperty(navigator, "share", {
            configurable: true,
            value: share,
        });
        Object.defineProperty(navigator, "canShare", {
            configurable: true,
            value: () => true,
        });
        return share;
    }

    it("copies the caption first, then shares one PNG with the caption and link", async () => {
        const share = phoneShare();
        await openSheet();
        expect(sheet().textContent).toContain("Price tag · 2 of 4");
        type("Fresh cardamom buns.");
        await press(button("Share now"));

        expect(order).toEqual(["copy", "share"]);
        expect(clipboard).toEqual([`Fresh cardamom buns. ${LINK}`]);
        const data = (share.mock.calls[0] as unknown as [ShareData])[0];
        expect(data.files).toHaveLength(1);
        expect(data.files?.[0]?.type).toBe("image/png");
        expect(data.files?.[0]?.name).toBe("cardamom-bun-box-price-post.png");
        expect(data.text).toBe("Fresh cardamom buns.");
        expect(data.url).toBe(LINK);
        expect(sheet().textContent).toContain(
            "Caption copied. Paste it in Instagram.",
        );
    });

    it("a cancelled share says nothing", async () => {
        const abort = new Error("cancelled");
        abort.name = "AbortError";
        phoneShare(() => Promise.reject(abort));
        await openSheet();
        await press(button("Share now"));
        expect(toast.showError).not.toHaveBeenCalled();
    });

    it("without a picture, shares the caption and link", async () => {
        fetchOk = false;
        const share = phoneShare();
        await openSheet();
        expect(sheet().textContent).toContain("The picture couldn't be made");
        await press(button("Share caption and link"));
        const data = (share.mock.calls[0] as unknown as [ShareData])[0];
        expect(data.files).toBeUndefined();
        expect(data.url).toBe(LINK);
        expect(clipboard).toHaveLength(1);
    });

    it("Schedule opens the offer under the caption", async () => {
        phoneShare();
        await openSheet(BUNS, {
            ...FREE,
            schedule: { tier: "grow", price: null },
        });
        await press(button("Schedule, locked"));
        const offer = sheet().querySelector('[data-social-offer="grow"]');
        expect(offer?.textContent).toContain("Add Saroh Social to Grow");
        await press(button("Not now"));
        expect(sheet().querySelector("[data-social-offer]")).toBeNull();
    });
});

/** Past the sheet's wait for typing or a colour drag to settle. */
async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 550));
    });
    await flush();
}

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("cards, colours and kinds (owner, 12 Nov 2026)", () => {
    it("asks for small thumbnails, and the chosen card at full size", async () => {
        await openSheet();
        const thumbs = Array.from(
            sheet().querySelectorAll<HTMLImageElement>("[data-card] img"),
        );
        expect(thumbs.length).toBe(4);
        expect(thumbs.every((i) => i.src.includes("w=240"))).toBe(true);
        expect(last().searchParams.has("w")).toBe(false);
    });

    it("draws every card on a picked colour, and back on the site's", async () => {
        await openSheet(BUNS, { ...FREE, swatches: ["#3e5a45", "#b5532a"] });
        await press(button("Colour #3e5a45"));
        await settle();
        expect(last().searchParams.get("bg")).toBe("#3e5a45");
        const thumbs = Array.from(
            sheet().querySelectorAll<HTMLImageElement>("[data-card] img"),
        );
        expect(thumbs.every((i) => i.src.includes("bg=%233e5a45"))).toBe(true);
        await press(button("Site colours"));
        await settle();
        expect(last().searchParams.has("bg")).toBe(false);
    });

    it("lets the booking page's headline be typed, Book your slot at first", async () => {
        await openSheet({
            kind: "book",
            ref: "page",
            name: "your booking page",
            price: null,
            url: "https://rye.example.com/book",
            offerId: null,
        });
        // Through the app's signed-in route, never the public picture.
        expect(last().pathname).toBe("/api/share/book/image");
        expect(fetched.every((u) => !u.includes("/public/share/"))).toBe(true);
        expect(last().searchParams.get("style")).toBe("colour");
        expect(last().searchParams.get("headline")).toBe("Book your slot");
        const input = sheet().querySelector<HTMLInputElement>(
            "[data-share-headline]",
        );
        if (!input) throw new Error("No headline");
        expect(input.maxLength).toBe(90);
        typeInto(input, "Cake consults open this Saturday");
        await settle();
        expect(last().searchParams.get("headline")).toBe(
            "Cake consults open this Saturday",
        );
        expect(caption().value).toContain("Book your slot. Book here:");
    });

    it("offers a blog post Photo only with a cover, and its summary caption", async () => {
        const post: ShareItem = {
            kind: "post",
            ref: "how-we-shape-a-bun",
            name: "How we shape a bun",
            price: null,
            url: "https://rye.example.com/blog/how-we-shape-a-bun",
            offerId: null,
            summary: "Four folds and a long rest.",
        };
        await openSheet(post);
        const cards = () =>
            Array.from(sheet().querySelectorAll("[data-card]")).map((c) =>
                c.getAttribute("data-card"),
            );
        expect(cards()).toEqual(["colour", "simple"]);
        expect(sheet().textContent).toContain("With summary");
        expect(sheet().querySelector("[data-share-headline]")).toBeNull();
        act(() => root.unmount());
        root = createRoot(host);
        document.body.innerHTML = "";
        document.body.appendChild(host);
        await openSheet({ ...post, hasPhoto: true });
        expect(cards()).toEqual(["photo", "colour", "simple"]);
    });

    it("offers Hinglish only where the edition's profile does", async () => {
        await openSheet();
        expect(sheet().textContent).toContain("Hinglish");
        act(() => root.unmount());
        document.body.innerHTML = "";
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        edition.name = "GLOBAL";
        await openSheet();
        expect(sheet().textContent).not.toContain("Hinglish");
    });
});
