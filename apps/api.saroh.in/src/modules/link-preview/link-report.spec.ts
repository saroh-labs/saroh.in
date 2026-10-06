import type { ImageFacts } from "./image-probe";
import { imageSize } from "./image-probe";
import type { LinkFacts } from "./link-report";
import { APPS, buildReport, factsFrom, scoreLine } from "./link-report";
import type { HeadTags } from "./og-parse";
import { REPORT_SUBJECT, reportText } from "./report-email";

/**
 * The report (resources plan U2, R14): the score line and the fix list come
 * from one result, so "N of 6" and "M things" can never disagree with the
 * list; and the picture's size is read from its first bytes.
 */

function tags(over: Partial<HeadTags> = {}): HeadTags {
    return {
        title: "Example Bakery",
        description: "Sourdough from Hill Road, out by ten.",
        canonical: null,
        headEnded: true,
        ...over,
        og: {
            title: "Fresh bread every morning",
            description: "Sourdough from Hill Road, out by ten.",
            image: "https://example-bakery.in/cover.jpg",
            imageWidth: null,
            imageHeight: null,
            imageType: null,
            url: "https://example-bakery.in/",
            siteName: "Example Bakery",
            type: "website",
            ...over.og,
        },
        twitter: {
            card: "summary_large_image",
            title: null,
            description: null,
            image: null,
            ...over.twitter,
        },
    };
}

const GOOD_IMAGE: ImageFacts = {
    url: "https://example-bakery.in/cover.jpg",
    loads: true,
    width: 1200,
    height: 630,
    type: "image/jpeg",
    bytes: 180 * 1024,
};

function facts(
    head: HeadTags,
    image: ImageFacts | null = GOOD_IMAGE,
): LinkFacts {
    return factsFrom(head, image, new URL("https://example-bakery.in/"), 200);
}

describe("buildReport", () => {
    it("says a page with every tag right looks right on all six", () => {
        const report = buildReport(facts(tags()));
        expect(report.fixes).toEqual([]);
        expect(report.right).toBe(6);
        expect(scoreLine(report)).toBe(
            "Looks right on all 6 apps. Nothing to fix.",
        );
        expect(report.tags.map((t) => t.mark)).toEqual([
            "ok",
            "ok",
            "ok",
            "ok",
            "ok",
        ]);
    });

    it("counts N and M from the same fixes, as the design's example", () => {
        // No description, a 600 × 315 picture, no twitter:card.
        const report = buildReport(
            facts(
                tags({
                    description: null,
                    og: { description: null } as HeadTags["og"],
                    twitter: { card: null } as HeadTags["twitter"],
                }),
                { ...GOOD_IMAGE, width: 600, height: 315 },
            ),
        );
        expect(report.fixes.map((f) => f.key)).toEqual([
            "description",
            "image-small",
            "x-card",
        ]);
        expect(report.fixes[0]?.title).toBe("Add a description.");
        expect(report.fixes[1]?.body).toBe(
            "Yours is 600 × 315. Use 1200 × 630, and keep it under 300 KB so WhatsApp shows it.",
        );
        // Between them, those three touch every app.
        expect(report.apps.filter((a) => a.ok)).toEqual([]);
        expect(report.right).toBe(0);
        expect(scoreLine(report)).toBe(
            "Looks right on 0 of 6 apps. Fix 3 things to fix all 6.",
        );
        expect(report.tags.find((t) => t.tag === "og:image")).toMatchObject({
            mark: "warn",
            note: "600 × 315, too small",
        });
    });

    it("never lets the score and the list disagree", () => {
        const variants: LinkFacts[] = [
            facts(tags()),
            facts(tags(), null),
            facts(tags(), { ...GOOD_IMAGE, loads: false }),
            facts(tags(), { ...GOOD_IMAGE, bytes: 900 * 1024 }),
            facts(tags({ title: null })),
            facts(tags({ description: null })),
            facts(
                tags({
                    og: { title: null, description: null } as HeadTags["og"],
                }),
            ),
            facts(
                tags({ twitter: { card: "summary" } as HeadTags["twitter"] }),
            ),
            facts(
                tags({
                    title: null,
                    description: null,
                    og: {
                        title: null,
                        description: null,
                        image: null,
                    } as HeadTags["og"],
                    twitter: { card: null } as HeadTags["twitter"],
                }),
                null,
            ),
        ];
        for (const f of variants) {
            const report = buildReport(f);
            const named = new Set(report.fixes.flatMap((fix) => fix.apps));
            expect(report.right).toBe(APPS.length - named.size);
            expect(
                report.apps
                    .filter((a) => !a.ok)
                    .map((a) => a.app)
                    .sort(),
            ).toEqual([...named].sort());
            // Fixing every listed thing fixes every app: no app is wrong without a fix naming it.
            expect(report.fixes.length === 0).toBe(
                report.right === APPS.length,
            );
        }
    });

    it("asks Google for its own title and description only when the share tags have them", () => {
        const report = buildReport(
            facts(tags({ title: null, description: null })),
        );
        expect(report.fixes.map((f) => f.key)).toEqual([
            "google-title",
            "google-description",
        ]);
        expect(report.apps.filter((a) => !a.ok).map((a) => a.app)).toEqual([
            "google",
        ]);
        expect(scoreLine(report)).toBe(
            "Looks right on 5 of 6 apps. Fix 2 things to fix all 6.",
        );
    });

    it("says one thing in the singular", () => {
        const report = buildReport(
            facts(tags({ twitter: { card: null } as HeadTags["twitter"] })),
        );
        expect(scoreLine(report)).toBe(
            "Looks right on 5 of 6 apps. Fix 1 thing to fix all 6.",
        );
    });

    it("flags a heavy picture for WhatsApp and a broken one for every picture app", () => {
        const heavy = buildReport(
            facts(tags(), { ...GOOD_IMAGE, bytes: 812 * 1024 }),
        );
        expect(heavy.fixes).toEqual([
            expect.objectContaining({ key: "image-heavy", apps: ["whatsapp"] }),
        ]);
        const broken = buildReport(
            facts(tags(), { ...GOOD_IMAGE, loads: false }),
        );
        expect(broken.fixes[0]).toMatchObject({
            key: "image-broken",
            apps: ["whatsapp", "facebook", "linkedin", "x"],
        });
    });

    it("doesn't call a picture small when its size couldn't be read", () => {
        const report = buildReport(
            facts(tags(), {
                ...GOOD_IMAGE,
                width: null,
                height: null,
                loads: null,
            }),
        );
        expect(report.fixes).toEqual([]);
    });

    it("suggests tags from the page's own values, escaped, with placeholders for what's missing", () => {
        const report = buildReport(
            facts(
                tags({
                    og: {
                        title: 'Say "hi" <now>',
                        description: null,
                    } as HeadTags["og"],
                    description: null,
                }),
                null,
            ),
        );
        expect(report.suggestedTags).toContain(
            '<meta property="og:title" content="Say &quot;hi&quot; &lt;now>">',
        );
        expect(report.suggestedTags).toContain(
            '<meta property="og:description" content="One sentence, under 160 characters, about what you sell.">',
        );
        expect(report.suggestedTags).toContain(
            '<meta property="og:image" content="https://example-bakery.in/share-1200x630.jpg">',
        );
        expect(report.suggestedTags).toContain(
            '<meta name="twitter:card" content="summary_large_image">',
        );
    });
});

describe("the emailed report", () => {
    it("says the score and the fixes in our words, and links back to the same check", () => {
        const f = facts(
            tags({ twitter: { card: null } as HeadTags["twitter"] }),
        );
        const text = reportText(
            buildReport(f),
            "https://example-bakery.in/menu",
        );
        expect(REPORT_SUBJECT).toBe("Your link preview report");
        expect(text).toContain(
            "Looks right on 5 of 6 apps. Fix 1 thing to fix all 6.",
        );
        expect(text).toContain("1. Tell X to use a large card.");
        expect(text).toContain("1200 × 630 pixels, under 300 KB");
        expect(text).toContain(
            "https://www.saroh.in/tools/link-preview?url=example-bakery.in%2Fmenu",
        );
        expect(text).toContain(
            "We won't send you anything else unless you ask.",
        );
        expect(text).not.toContain("Saroh news");
    });

    it("carries no text the page wrote: a relay can't be built from it", () => {
        const spam = "Claim your prize at https://evil.example/win now";
        const f = facts(
            tags({
                title: spam,
                description: spam,
                canonical: "https://evil.example/canonical",
                og: {
                    title: `${spam}\nSubject: spoof`,
                    description: spam,
                    image: "https://evil.example/pic.jpg",
                    url: "https://evil.example/og",
                    siteName: spam,
                } as HeadTags["og"],
                twitter: { card: null } as HeadTags["twitter"],
            }),
            null,
        );
        const report = buildReport(f);
        // The on-screen report still has the page's own values…
        expect(report.suggestedTags).toContain("evil.example");
        // …the email has none of them, nor the domain in our own link.
        const text = reportText(report, "https://example-bakery.in/");
        expect(text).not.toMatch(/evil|prize|Claim|spoof/i);
        expect(text.match(/https?:\/\/[^\s]+/g)).toEqual([
            "https://www.saroh.in/tools/link-preview?url=example-bakery.in%2F",
        ]);
        expect(text).not.toContain("<meta");
    });
});

describe("imageSize", () => {
    it("reads a PNG's size from its header", () => {
        const png = Buffer.alloc(24);
        png.writeUInt32BE(0x89504e47, 0);
        png.writeUInt32BE(0x0d0a1a0a, 4);
        png.write("IHDR", 12, "ascii");
        png.writeUInt32BE(1200, 16);
        png.writeUInt32BE(630, 20);
        expect(imageSize(png)).toEqual({
            width: 1200,
            height: 630,
            type: "image/png",
        });
    });

    it("reads a JPEG's size from its frame header, past an APP segment", () => {
        const app0 = Buffer.from([
            0xff,
            0xe0,
            0x00,
            0x10,
            ...new Array<number>(14).fill(0),
        ]);
        const sof = Buffer.from([
            0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x3b, 0x02, 0x58, 0x03,
        ]);
        const jpeg = Buffer.concat([
            Buffer.from([0xff, 0xd8]),
            app0,
            sof,
            Buffer.alloc(8),
        ]);
        expect(imageSize(jpeg)).toEqual({
            width: 600,
            height: 315,
            type: "image/jpeg",
        });
    });

    it("reads a GIF and a WebP", () => {
        const gif = Buffer.from("GIF89a\x58\x02\x3b\x01", "latin1");
        expect(imageSize(gif)).toEqual({
            width: 600,
            height: 315,
            type: "image/gif",
        });
        const webp = Buffer.alloc(30);
        webp.write("RIFF", 0, "ascii");
        webp.write("WEBP", 8, "ascii");
        webp.write("VP8X", 12, "ascii");
        webp.writeUIntLE(1199, 24, 3);
        webp.writeUIntLE(629, 27, 3);
        expect(imageSize(webp)).toEqual({
            width: 1200,
            height: 630,
            type: "image/webp",
        });
    });

    it("says nothing for bytes that aren't a picture", () => {
        expect(imageSize(Buffer.from("<html></html>"))).toBeNull();
    });
});
