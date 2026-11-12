// The share picture's fonts (#1375): the site's own faces from its look,
// the curated choices, and Google Fonts' TTFs fetched once and kept, a
// failure tried again only after a while. The fetch is stood in for.
import { curatedFont, GoogleFonts, siteFamilies } from "./card-fonts";

const CSS = `
@font-face { font-family: 'Mukta'; font-style: normal; font-weight: 400;
  src: url(https://fonts.gstatic.com/s/mukta/v17/a.ttf) format('truetype'); }
@font-face { font-family: 'Mukta'; font-style: normal; font-weight: 700;
  src: url(https://fonts.gstatic.com/s/mukta/v17/b.ttf) format('truetype'); }`;

function setup(answer: (url: string) => Response) {
    const registered: { name: string; weight: number }[] = [];
    const fetcher = jest.fn((url: string) => Promise.resolve(answer(url)));
    let now = 0;
    const fonts = new GoogleFonts(
        {
            registerFont: (f) => {
                registered.push({ name: f.name, weight: f.weight });
                return Promise.resolve();
            },
        },
        fetcher,
        () => now,
    );
    return { fonts, fetcher, registered, later: (ms: number) => (now += ms) };
}

describe("GoogleFonts", () => {
    it("registers each weight's TTF once, and keeps it", async () => {
        const { fonts, fetcher, registered } = setup((url) =>
            url.startsWith("https://fonts.googleapis.com/")
                ? new Response(CSS)
                : new Response(new Uint8Array([0, 1, 0, 0])),
        );
        expect(await fonts.load("Mukta")).toBe(true);
        expect(await fonts.load("Mukta")).toBe(true);
        expect(registered).toEqual([
            { name: "Mukta", weight: 400 },
            { name: "Mukta", weight: 700 },
        ]);
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(fetcher.mock.calls[0]?.[0]).toBe(
            "https://fonts.googleapis.com/css2?family=Mukta:wght@400;700",
        );
    });

    it("says no on a failure, and asks again only after a while", async () => {
        const { fonts, fetcher, later } = setup(
            () => new Response("", { status: 500 }),
        );
        expect(await fonts.load("Poppins")).toBe(false);
        const asked = fetcher.mock.calls.length;
        expect(await fonts.load("Poppins")).toBe(false);
        expect(fetcher.mock.calls.length).toBe(asked);
        later(11 * 60_000);
        await fonts.load("Poppins");
        expect(fetcher.mock.calls.length).toBeGreaterThan(asked);
    });

    it("never fetches a name that isn't a family", async () => {
        const { fonts, fetcher } = setup(() => new Response(CSS));
        for (const bad of [null, "", "../x", "Mukta&text=1", "a".repeat(80)]) {
            expect(await fonts.load(bad)).toBe(false);
        }
        expect(fetcher).not.toHaveBeenCalled();
    });
});

describe("which faces", () => {
    it("reads the site's pair from its look", () => {
        expect(
            siteFamilies(
                { "--site-font-heading": "fraunces-inter-tight" },
                null,
            ),
        ).toEqual({ heading: "Fraunces", body: "Inter Tight" });
        expect(siteFamilies(null, null)).toEqual({ heading: null, body: null });
        expect(siteFamilies({}, "constructor")).toEqual({
            heading: null,
            body: null,
        });
    });

    it("takes a curated choice by name, and nothing else", () => {
        expect(curatedFont("baloo-2")).toBe("Baloo 2");
        expect(curatedFont("Tiro-Devanagari-Hindi")).toBe(
            "Tiro Devanagari Hindi",
        );
        expect(curatedFont("comic-sans")).toBeNull();
        expect(curatedFont("toString")).toBeNull();
        expect(curatedFont(undefined)).toBeNull();
    });
});
