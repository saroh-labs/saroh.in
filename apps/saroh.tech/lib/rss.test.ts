import { describe, expect, it } from "vitest";

import { changelogRss } from "./rss";

const entry = {
    slug: "a-b",
    date: "2026-11-02",
    title: "Tags & <things>",
    summary: `It's "new" & <b>bold</b>`,
    tag: "Both" as const,
};

describe("the changelog feed", () => {
    it("escapes what it's given, so the XML stays valid", () => {
        const xml = changelogRss([entry]);
        expect(xml).toContain("<title>Tags &amp; &lt;things&gt;</title>");
        expect(xml).toContain(
            "It&apos;s &quot;new&quot; &amp; &lt;b&gt;bold&lt;/b&gt;",
        );
    });

    it("has what RSS 2.0 requires: channel basics, a self link, RFC 822 dates", () => {
        const xml = changelogRss([entry]);
        expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
        for (const tag of ["title", "link", "description"]) {
            expect(xml).toContain(`<${tag}>`);
        }
        expect(xml).toContain(
            'href="https://saroh.tech/changelog/rss.xml" rel="self"',
        );
        expect(xml).toContain(
            "<link>https://saroh.tech/changelog/2026-11-02-a-b</link>",
        );
        expect(xml).toContain(
            "<pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate>",
        );
    });

    it("still makes a valid channel with nothing in it", () => {
        const xml = changelogRss([]);
        expect(xml).not.toContain("<item>");
        expect(xml).not.toContain("lastBuildDate");
    });
});
