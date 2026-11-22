// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { libraryCategories } from "@/components/sites/blocks/add-section-dialog";
import type { SiteStyle } from "@/lib/sites/style";

import {
    BrandColourPopoverBody,
    BrandColourSheet,
    FromYourLogo,
} from "./brand-colour-sheet";
import { LookThumbnail, lookWords } from "./look-thumbnail";
import { hindiPairing } from "./typeface-picker";

/**
 * Brand, round 2 (22 Nov): the Hindi line for each pair (B2), look cards
 * in the business's own words (B5), colours tried on the page behind the
 * sheet (B4), "From your logo" (B3); and the library's categories (A2).
 */

vi.mock("next/image", () => ({ default: () => null }));
const readLogoColours = vi.fn();
vi.mock("@/lib/sites/logo-colours", () => ({
    readLogoColours: (src: string) => readLogoColours(src) as unknown,
}));

const style: SiteStyle = {
    colours: { pageGround: "paper", text: "ink" },
    scalars: {},
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

describe("B2 · the Hindi each pair is set in", () => {
    it("names serif Devanagari for a serif stack, sans otherwise", () => {
        expect(
            hindiPairing(
                '"Newsreader", Georgia, "Noto Serif Devanagari", serif',
            ),
        ).toBe("Noto Serif Devanagari");
        expect(hindiPairing('ui-sans-serif, "Noto Sans Devanagari"')).toBe(
            "Noto Sans Devanagari",
        );
        expect(hindiPairing(undefined)).toBe("Noto Sans Devanagari");
    });
});

describe("B5 · look cards in the business's own words", () => {
    it("takes the page's first two headings", () => {
        expect(
            lookWords("Sample Salon", [
                { content: { heading: "Bridal makeup" } },
                { content: {} },
                { content: { heading: "Prices" } },
                { content: { heading: "Third" } },
            ]),
        ).toEqual({
            name: "Sample Salon",
            headings: ["Bridal makeup", "Prices"],
        });
    });

    it("draws them in place of Aa", () => {
        act(() =>
            root.render(
                <LookThumbnail
                    look={null}
                    style={style}
                    options={{ rows: [], scalars: [] }}
                    words={{
                        name: "Sample Salon",
                        headings: ["Bridal makeup"],
                    }}
                />,
            ),
        );
        // The heading alone, at a readable size (B2/B5): the name only
        // when there is no heading.
        expect(host.textContent).toContain("Bridal makeup");
        expect(host.textContent).not.toContain("Aa");
        expect(host.querySelector("[data-look-words]")?.className).toContain(
            "text-[15px]",
        );
    });

    it("draws the business's name when the page has no heading", () => {
        act(() =>
            root.render(
                <LookThumbnail
                    look={null}
                    style={style}
                    options={{ rows: [], scalars: [] }}
                    words={{ name: "Sample Salon", headings: [] }}
                />,
            ),
        );
        expect(host.textContent).toContain("Sample Salon");
    });
});

describe("B4 · a colour is tried on the page behind the sheet", () => {
    it("tries the typed colour unsaved, and puts the page back on close", () => {
        const onTry = vi.fn();
        const onUse = vi.fn();
        act(() =>
            root.render(
                <BrandColourSheet
                    open
                    style={style}
                    onClose={vi.fn()}
                    onUse={onUse}
                    onTry={onTry}
                />,
            ),
        );
        const input = document.querySelector<HTMLInputElement>(
            "[data-brand-colour-input]",
        );
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, "#2B6CB0");
            input?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(onTry).toHaveBeenLastCalledWith(
            expect.objectContaining({ brandColour: "#2B6CB0" }),
        );
        expect(onUse).not.toHaveBeenCalled();
        act(() =>
            root.render(
                <BrandColourSheet
                    open={false}
                    style={style}
                    onClose={vi.fn()}
                    onUse={onUse}
                    onTry={onTry}
                />,
            ),
        );
        expect(onTry).toHaveBeenLastCalledWith(null);
    });
});

describe("B3 · From your logo", () => {
    it("reads the logo's colours and puts the first in the field", async () => {
        readLogoColours.mockResolvedValue(["#E0609A", "#285A3C"]);
        const onPick = vi.fn();
        act(() =>
            root.render(
                <FromYourLogo
                    logoUrl="https://cdn.example.com/logo.png"
                    onPick={onPick}
                />,
            ),
        );
        await act(async () => {
            host.querySelector("button")?.click();
            await Promise.resolve();
        });
        expect(readLogoColours).toHaveBeenCalledWith(
            "https://cdn.example.com/logo.png",
        );
        expect(onPick).toHaveBeenCalledWith("#E0609A");
        const second = host.querySelector<HTMLButtonElement>(
            '[data-logo-colour="#285A3C"]',
        );
        act(() => second?.click());
        expect(onPick).toHaveBeenLastCalledWith("#285A3C");
    });

    it("with no logo, asks for the file instead", async () => {
        const onPick = vi.fn();
        act(() => root.render(<FromYourLogo logoUrl={null} onPick={onPick} />));
        const file = host.querySelector<HTMLInputElement>('input[type="file"]');
        const clicked = vi.fn();
        file?.addEventListener("click", clicked);
        await act(async () => {
            host.querySelector("button")?.click();
            await Promise.resolve();
        });
        expect(readLogoColours).not.toHaveBeenCalled();
        expect(clicked).toHaveBeenCalled();
    });
});

describe("A2 · the library's categories", () => {
    it("files each family under its category, in order, leaving out empty ones", () => {
        const got = libraryCategories([
            { head: "faq" },
            { head: "hero" },
            { head: "servicesList" },
        ] as const);
        expect(got.map((c) => [c.name, c.families.length])).toEqual([
            ["Top and about", 1],
            ["Services and shop", 1],
            ["Reviews", 1],
        ]);
    });
});

describe("B3 · the brand colour as a popover on a wide desk", () => {
    it("green tick lines, a light note in a callout, and Use", () => {
        const onUse = vi.fn();
        act(() =>
            root.render(
                <BrandColourPopoverBody
                    style={{ ...style, brandColour: "#F5D0E0" }}
                    onClose={vi.fn()}
                    onUse={onUse}
                />,
            ),
        );
        const lines = host.querySelector("[data-brand-colour-lines]");
        expect(lines?.querySelectorAll("svg").length).toBeGreaterThan(0);
        expect(
            host
                .querySelector("[data-brand-colour-warning]")
                ?.getAttribute("data-notice"),
        ).toBe("info");
        act(() =>
            host
                .querySelector<HTMLFormElement>("[data-brand-colour-popover]")
                ?.requestSubmit(),
        );
        expect(onUse).toHaveBeenCalled();
    });
});
