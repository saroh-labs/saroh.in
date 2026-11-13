// The share picture's layout (#1375 U4), apart from drawing it: the four
// styles in three sizes, the Story's safe zones, the colours and the
// clipping, as the SFCards board draws them. Takumi draws it in
// card-renderer.spec.ts.
import type { ShareCardInput } from "./card-model";
import {
    clipLines,
    hexColourOf,
    initials,
    inkOn,
    SHARE_SIZES,
    SHARE_STYLES,
    shareCardLayout,
    shareCardModel,
    shareSizeOf,
    shareStyleOf,
    shareWidthOf,
} from "./card-model";
import type { CardNode } from "./card-tree";
import { cardTree } from "./card-tree";

const input: ShareCardInput = {
    name: "Cardamom bun box",
    price: "₹360",
    unit: "box of 6",
    business: "Rye & Co.",
    photo: null,
    address: "rye-and-co.example.com",
};

const OFFER = {
    headline: "20% off",
    until: "this week only",
    was: "₹360",
    now: "₹288",
    code: "BUN20",
};

const SIZES = Object.keys(SHARE_SIZES) as (keyof typeof SHARE_SIZES)[];
const FONTS = { heading: "'Noto Sans'", body: "'Noto Sans'" };

/** Every text node of a tree, with its style. */
function texts(node: CardNode): Extract<CardNode, { type: "text" }>[] {
    if (node.type === "text") return [node];
    if (node.type === "container") return node.children.flatMap(texts);
    return [];
}

function images(node: CardNode): string[] {
    if (node.type === "image") return [node.src];
    if (node.type === "container") return node.children.flatMap(images);
    return [];
}

describe("styles and sizes", () => {
    it("lays out every style at each size's own dimensions", () => {
        for (const style of SHARE_STYLES) {
            for (const size of SIZES) {
                const layout = shareCardLayout({
                    ...input,
                    offer: OFFER,
                    style,
                    size,
                });
                expect([layout.width, layout.height]).toEqual([
                    SHARE_SIZES[size].width,
                    SHARE_SIZES[size].height,
                ]);
                const tree = cardTree(
                    { ...input, offer: OFFER, style, size },
                    FONTS,
                );
                expect(tree.style).toMatchObject(SHARE_SIZES[size]);
            }
        }
        expect(SHARE_SIZES).toEqual({
            post: { width: 1080, height: 1350 },
            square: { width: 1080, height: 1080 },
            story: { width: 1080, height: 1920 },
        });
    });

    it("reads an unknown style or size as Photo and Post", () => {
        expect(shareStyleOf("price")).toBe("price");
        expect(shareStyleOf("poster")).toBe("photo");
        expect(shareStyleOf(null)).toBe("photo");
        expect(shareSizeOf("story")).toBe("story");
        expect(shareSizeOf("constructor")).toBe("post");
        expect(shareSizeOf(undefined)).toBe("post");
    });

    it("keeps a Story's top 13% and bottom 20% free of text in every style", () => {
        for (const style of SHARE_STYLES) {
            for (const name of [input.name, "A much longer name that wraps"]) {
                const layout = shareCardLayout({
                    ...input,
                    name,
                    offer: OFFER,
                    style,
                    size: "story",
                });
                expect(layout.safe).toEqual({ top: 250, bottom: 384 });
                for (const box of layout.text) {
                    expect(box.top).toBeGreaterThanOrEqual(1920 * 0.13);
                    expect(box.bottom).toBeLessThanOrEqual(1920 * 0.8);
                }
            }
        }
    });

    it("fits the centred styles inside the card at every size", () => {
        for (const style of ["offer", "simple"] as const) {
            for (const size of SIZES) {
                const layout = shareCardLayout({
                    ...input,
                    name: "Slow fermented country sourdough with seeds",
                    offer: OFFER,
                    style,
                    size,
                });
                expect(layout.circle).toBeGreaterThan(0);
                expect(layout.band.top).toBeGreaterThanOrEqual(layout.safe.top);
                expect(layout.band.bottom).toBeLessThanOrEqual(
                    layout.height - layout.safe.bottom,
                );
            }
        }
    });

    it("draws the Offer style as Photo when there is no offer", () => {
        expect(shareCardLayout({ ...input, style: "offer" }).style).toBe(
            "photo",
        );
    });
});

describe("what the card says", () => {
    it("takes its colours and corners from the site's tokens", () => {
        const m = shareCardModel({
            ...input,
            variables: {
                "--site-bg": "40 24% 97%",
                "--site-fg": "20 14% 12%",
                "--site-accent": "16 60% 40%",
                "--site-band-accent": "140 18% 30%",
                "--site-radius": "20px",
            },
        });
        expect(m.colours.bg).toBe("hsl(40, 24%, 97%)");
        expect(m.colours.accent).toBe("hsl(16, 60%, 40%)");
        expect(m.colours.bandAccent).toBe("hsl(140, 18%, 30%)");
        // No band ink of its own: the site's text colour, as its bands do.
        expect(m.colours.bandInk).toBe("hsl(20, 14%, 12%)");
        expect(m.radius).toBe(20);
    });

    it("draws plain neutrals with no look, and never takes a value that isn't a colour", () => {
        const bare = shareCardModel(input);
        const odd = shareCardModel({
            ...input,
            variables: { "--site-bg": "red;} body{x:1" },
        });
        expect(odd.colours.bg).toBe(bare.colours.bg);
        expect(bare.colours.bg).toBe("hsl(0, 0%, 100%)");
    });

    it("sets the Price-tag band's text white on a dark band and black on a light one", () => {
        expect(inkOn("20 14% 12%")).toBe("#FFFFFF");
        expect(inkOn("40 30% 92%")).toBe("#000000");
        const name = (variables: Record<string, string>) =>
            texts(
                cardTree({ ...input, style: "price", variables }, FONTS),
            ).find((t) => t.text === input.name)?.style.color;
        expect(name({ "--site-fg": "20 14% 12%" })).toBe("#FFFFFF");
        expect(name({ "--site-band-ink": "48 90% 70%" })).toBe("#000000");
    });

    it("keeps a long name to two lines in every style but Colour", () => {
        for (const style of SHARE_STYLES.filter((s) => s !== "colour")) {
            const m = shareCardModel({
                ...input,
                style,
                offer: OFFER,
                name: "Slow fermented country sourdough with toasted seeds and rye",
            });
            expect(m.nameLines).toHaveLength(2);
            expect(m.nameLines[1]?.endsWith("…")).toBe(true);
        }
    });

    it("draws the letter tile without a photo, and the photo with one", () => {
        const bare = cardTree({ ...input, style: "photo" }, FONTS);
        expect(images(bare)).toEqual([]);
        expect(texts(bare).map((t) => t.text)).toContain("C");
        const photo = cardTree({ ...input, photo: "photo" }, FONTS);
        expect(images(photo)).toEqual(["photo"]);
    });

    it("shows the offer's old price struck through beside the new one, and its code", () => {
        const lines = texts(
            cardTree({ ...input, style: "offer", offer: OFFER }, FONTS),
        );
        expect(lines.map((t) => t.text)).toEqual(
            expect.arrayContaining([
                "20% off",
                "RYE & CO. · THIS WEEK ONLY",
                "₹288",
                "code BUN20 · rye-and-co.example.com",
            ]),
        );
        expect(lines.find((t) => t.text === "₹360")?.style.textDecoration).toBe(
            "line-through",
        );
    });

    it("marks the card with the logo, else the business's initials", () => {
        expect(initials("Rye & Co.")).toBe("R&C");
        expect(initials("Studio Neel")).toBe("SN");
        const simple = cardTree({ ...input, style: "simple" }, FONTS);
        expect(texts(simple).map((t) => t.text)).toContain("R&C");
        const logo = cardTree(
            { ...input, style: "simple", logo: "logo" },
            FONTS,
        );
        expect(images(logo)).toContain("logo");
    });

    it("prints the live web address, and sets every line in the stacks it is given", () => {
        for (const style of SHARE_STYLES) {
            const lines = texts(
                cardTree({ ...input, style, offer: OFFER }, FONTS),
            );
            expect(
                lines.some((t) => t.text.endsWith("rye-and-co.example.com")),
            ).toBe(true);
            for (const t of lines)
                expect(t.style.fontFamily).toBe("'Noto Sans'");
        }
    });
});

describe("clipLines", () => {
    it("keeps short text whole", () => {
        expect(clipLines("Haircut", 24, 2)).toEqual(["Haircut"]);
    });

    it("breaks at spaces and marks a cut", () => {
        expect(clipLines("one two three four", 9, 2)).toEqual([
            "one two",
            "three…",
        ]);
    });

    it("cuts a word longer than a line", () => {
        expect(clipLines("Supercalifragilistic", 10, 2)).toEqual([
            "Supercali…",
        ]);
    });
});

describe("the Colour card and a card's own colours (owner, 12 Nov 2026)", () => {
    it("draws the headline on the site's band accent, with no photo", () => {
        const variables = {
            "--site-band-accent": "135 18% 30%",
            "--site-band-accent-fg": "36 50% 91%",
        };
        const m = shareCardModel({ ...input, style: "colour", variables });
        expect(m.layout.style).toBe("colour");
        expect(m.layout.circle).toBe(0);
        const tree = cardTree({ ...input, style: "colour", variables }, FONTS);
        expect(JSON.stringify(tree)).toContain("hsl(135, 18%, 30%)");
        expect(
            texts(tree).find((t) => t.text === input.name)?.style.color,
        ).toBe("hsl(36, 50%, 91%)");
        expect(JSON.stringify(tree)).not.toContain('"type":"image"');
    });

    it("fits a 90-character headline whole, smaller, and keeps a Story's safe zones", () => {
        const name =
            "New timings from Monday: 8 AM to 9 PM, and Sunday brunch from 10 AM to 2 PM, all welcome";
        expect(name.length).toBeLessThanOrEqual(90);
        const m = shareCardModel({ ...input, name, style: "colour" });
        expect(m.nameLines.join(" ")).toBe(name);
        const story = shareCardLayout({
            ...input,
            name,
            style: "colour",
            size: "story",
        });
        for (const box of story.text) {
            expect(box.top).toBeGreaterThanOrEqual(story.safe.top);
            expect(box.bottom).toBeLessThanOrEqual(
                story.height - story.safe.bottom,
            );
        }
    });

    it("draws the button as a pill on Colour, and as the line under the name elsewhere", () => {
        const book = {
            ...input,
            name: "Book your slot",
            price: null,
            unit: null,
            cta: "Book now",
            kindLabel: "Bookings",
        };
        const colour = shareCardModel({ ...book, style: "colour" });
        expect(colour.cta).toBe("Book now");
        expect(colour.priceLine).toBe("");
        expect(colour.label).toBe("RYE & CO. · BOOKINGS");
        const tree = cardTree({ ...book, style: "colour" }, FONTS);
        expect(texts(tree).filter((t) => t.text === "Book now")).toHaveLength(
            1,
        );
        expect(JSON.stringify(tree)).toContain("solid");
        const photo = shareCardModel({ ...book, style: "photo" });
        expect(photo.cta).toBeNull();
        expect(photo.priceLine).toBe("Book now");
        // Story: the pill stays inside the safe zones.
        const story = shareCardLayout({
            ...book,
            style: "colour",
            size: "story",
        });
        for (const box of story.text) {
            expect(box.top).toBeGreaterThanOrEqual(story.safe.top);
            expect(box.bottom).toBeLessThanOrEqual(
                story.height - story.safe.bottom,
            );
        }
    });

    it("takes a valid #rrggbb ground and ink over the site's colours", () => {
        const m = shareCardModel({
            ...input,
            style: "colour",
            ground: "#3E5A45",
            ink: "#F4EBDD",
        });
        expect(m.colours.bandAccent).toBe("#3e5a45");
        expect(m.colours.bg).toBe("#3e5a45");
        expect(m.colours.bandAccentFg).toBe("#f4ebdd");
        expect(m.colours.fg).toBe("#f4ebdd");
    });

    it("ignores anything that isn't #rrggbb", () => {
        const site = shareCardModel({ ...input, style: "colour" }).colours;
        for (const bad of [
            "red",
            "#fff",
            "#12345g",
            "#1234567",
            "url(x)",
            "",
        ]) {
            expect(hexColourOf(bad)).toBeNull();
            expect(
                shareCardModel({
                    ...input,
                    style: "colour",
                    ground: bad,
                    ink: bad,
                }).colours,
            ).toEqual(site);
        }
    });

    it("picks white or black text for a ground given alone", () => {
        const on = (ground: string) =>
            shareCardModel({ ...input, style: "colour", ground }).colours
                .bandAccentFg;
        expect(on("#111111")).toBe("#FFFFFF");
        expect(on("#3e5a45")).toBe("#FFFFFF");
        expect(on("#f4ebdd")).toBe("#000000");
        expect(on("#ffd84d")).toBe("#000000");
    });

    it("takes a thumbnail width from 64 to 540 pixels, else the full size", () => {
        expect(shareWidthOf("240")).toBe(240);
        expect(shareWidthOf("540")).toBe(540);
        for (const bad of [
            "541",
            "63",
            "1080",
            "-1",
            "24.5",
            "abc",
            240,
            null,
        ]) {
            expect(shareWidthOf(bad)).toBeNull();
        }
    });
});
