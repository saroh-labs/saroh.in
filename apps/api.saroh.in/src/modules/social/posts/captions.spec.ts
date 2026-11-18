import {
    captionFor,
    captionProblem,
    THREADS_MAX_BYTES,
    trackedLink,
} from "./captions";
import { goodTimes } from "./good-time";

const link = trackedLink(
    "https://chaiandcrumb.saroh.app",
    "/shop/mango-cheesecake",
    "social-abcdefgh",
);

describe("each channel's caption", () => {
    it("puts the ref on the link, keeping the path's own query", () => {
        expect(link).toBe(
            "https://chaiandcrumb.saroh.app/shop/mango-cheesecake?ref=social-abcdefgh",
        );
        expect(
            trackedLink("https://x.saroh.app/", "/book?service=a", "social-q"),
        ).toBe("https://x.saroh.app/book?service=a&ref=social-q");
    });

    it("gives Instagram the link as text under Link in bio, Facebook and Threads inline", () => {
        expect(
            captionFor("INSTAGRAM", "Mango cheesecake is back.", null, link),
        ).toBe(`Mango cheesecake is back.\n\nLink in bio\n${link}`);
        expect(
            captionFor("FACEBOOK", "Mango cheesecake is back.", null, link),
        ).toBe(`Mango cheesecake is back.\n\n${link}`);
        expect(captionFor("THREADS", "", null, link)).toBe(link);
    });

    it("uses a channel's own words when it has them", () => {
        expect(captionFor("THREADS", "Long words", "Short", link)).toBe(
            `Short\n\n${link}`,
        );
    });

    it("cuts the post's words for Threads to 500 bytes with an ellipsis, never the link", () => {
        // Devanagari: three bytes a letter.
        const long = "आम ".repeat(200);
        const out = captionFor("THREADS", long, null, link);
        expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(
            THREADS_MAX_BYTES,
        );
        expect(out).toContain("…");
        expect(out.endsWith(link)).toBe(true);
    });

    it("refuses Threads' own words over 500 bytes, with the count", () => {
        const problem = captionProblem("THREADS", "ab".repeat(300), link);
        expect(problem).toMatchObject({ limit: 500, unit: "bytes" });
        expect(problem?.used).toBeGreaterThan(600);
        expect(captionProblem("THREADS", "Short", link)).toBeNull();
    });
});

describe("Good time", () => {
    it("suggests 7:30 PM on weekdays and 12:30 PM at weekends, in the business's zone", () => {
        // Friday 20 Nov 2026, 8 PM in Kolkata: past Friday's slot.
        const now = new Date("2026-11-20T14:30:00Z");
        const times = goodTimes(now, "Asia/Kolkata").map((d) =>
            d.toISOString(),
        );
        expect(times).toEqual([
            "2026-11-21T07:00:00.000Z", // Sat 12:30 PM IST
            "2026-11-22T07:00:00.000Z", // Sun 12:30 PM IST
            "2026-11-23T14:00:00.000Z", // Mon 7:30 PM IST
        ]);
    });
});
