import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { decodeHtml, hasAnyTag, MAX_HTML_BYTES, parseHead } from "./og-parse";
import { guardedFetch, nodeTransport } from "./safe-fetch";

/**
 * The head parser (resources plan U2): Open Graph first, then the
 * fallbacks the apps use, relative addresses made absolute, nothing from
 * the body — and, through the real transport, a 2 MB page read only to
 * 512 KB.
 */

const PAGE = "https://example-bakery.in/menu/today";

const page = (head: string, body = "<p>Hello</p>") =>
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("parseHead", () => {
    it("reads og:*, twitter:*, the title, the description and the canonical link", () => {
        const tags = parseHead(
            page(`
                <meta charset="utf-8">
                <title>Example Bakery &amp; Café</title>
                <meta name="description" content="Sourdough from Hill Road.">
                <link rel="canonical" href="https://example-bakery.in/">
                <meta property="og:title" content="Fresh bread every morning">
                <meta property="og:description" content="Out by ten.">
                <meta property="og:image" content="https://cdn.example-bakery.in/cover.jpg">
                <meta property="og:image:width" content="1200">
                <meta property="og:image:height" content="630">
                <meta property="og:site_name" content="Example Bakery">
                <meta property="og:url" content="https://example-bakery.in/">
                <meta name="twitter:card" content="summary_large_image">
            `),
            PAGE,
        );
        expect(tags).toMatchObject({
            title: "Example Bakery & Café",
            description: "Sourdough from Hill Road.",
            canonical: "https://example-bakery.in/",
            og: {
                title: "Fresh bread every morning",
                description: "Out by ten.",
                image: "https://cdn.example-bakery.in/cover.jpg",
                imageWidth: 1200,
                imageHeight: 630,
                siteName: "Example Bakery",
                url: "https://example-bakery.in/",
            },
            twitter: { card: "summary_large_image" },
            headEnded: true,
        });
    });

    it("falls back to <title> and twitter:* when there's no Open Graph", () => {
        const tags = parseHead(
            page(`
                <title>  Kavi   Dental </title>
                <meta name="twitter:title" content="Kavi Dental, Pune">
                <meta name="twitter:description" content="Cleanings and braces.">
                <meta name="twitter:image" content="/img/x.png">
            `),
            PAGE,
        );
        expect(tags.title).toBe("Kavi Dental");
        expect(tags.og.title).toBeNull();
        expect(tags.twitter).toMatchObject({
            title: "Kavi Dental, Pune",
            description: "Cleanings and braces.",
            image: "https://example-bakery.in/img/x.png",
        });
        expect(hasAnyTag(tags)).toBe(true);
    });

    it("resolves a relative og:image against the page, or its <base>", () => {
        expect(
            parseHead(
                page(`<meta property="og:image" content="../cover.jpg">`),
                PAGE,
            ).og.image,
        ).toBe("https://example-bakery.in/cover.jpg");
        expect(
            parseHead(
                page(
                    `<base href="https://cdn.example.net/assets/"><meta property="og:image" content="cover.jpg">`,
                ),
                PAGE,
            ).og.image,
        ).toBe("https://cdn.example.net/assets/cover.jpg");
        expect(
            parseHead(
                page(
                    `<meta property="og:image" content="//cdn.example.net/a.png">`,
                ),
                PAGE,
            ).og.image,
        ).toBe("https://cdn.example.net/a.png");
    });

    it("drops an og:image that isn't a web address", () => {
        const tags = parseHead(
            page(`<meta property="og:image" content="javascript:alert(1)">`),
            PAGE,
        );
        expect(tags.og.image).toBeNull();
    });

    it("ignores tags in <body>", () => {
        const tags = parseHead(
            page(
                `<title>Head title</title>`,
                `<meta property="og:title" content="From the body"><title>Body title</title>`,
            ),
            PAGE,
        );
        expect(tags.title).toBe("Head title");
        expect(tags.og.title).toBeNull();
    });

    it("ends the head at the first body tag when a page leaves out <head> and <body>", () => {
        const tags = parseHead(
            `<title>Bare</title><meta property="og:title" content="Yes"><div>x</div><meta property="og:description" content="No">`,
            PAGE,
        );
        expect(tags.og.title).toBe("Yes");
        expect(tags.og.description).toBeNull();
        expect(tags.headEnded).toBe(true);
    });

    it("isn't ended by a tracking pixel inside <noscript> in the head", () => {
        const tags = parseHead(
            page(
                `<noscript><img height="1" width="1" src="https://pixel.example/tr"></noscript><meta property="og:title" content="After the pixel">`,
            ),
            PAGE,
        );
        expect(tags.og.title).toBe("After the pixel");
    });

    it("isn't fooled by a meta tag inside a script", () => {
        const tags = parseHead(
            page(
                `<script>document.write('<meta property="og:title" content="fake">')</script><meta property="og:title" content="real">`,
            ),
            PAGE,
        );
        expect(tags.og.title).toBe("real");
    });

    it("keeps the first of a repeated tag, as the apps do", () => {
        const tags = parseHead(
            page(
                `<meta property="og:image" content="/first.jpg"><meta property="og:image" content="/second.jpg">`,
            ),
            PAGE,
        );
        expect(tags.og.image).toBe("https://example-bakery.in/first.jpg");
    });

    it("finds nothing on a page with no tags", () => {
        expect(hasAnyTag(parseHead(page(""), PAGE))).toBe(false);
    });

    it("decodes a page in the charset it names", () => {
        const latin1 = Buffer.from(page("<title>Café</title>"), "latin1");
        expect(
            parseHead(decodeHtml(latin1, "text/html; charset=iso-8859-1"), PAGE)
                .title,
        ).toBe("Café");
    });
});

describe("reading a page through the real transport", () => {
    const filler = `<p>${"x".repeat(1000)}</p>`;
    let server: ReturnType<typeof createServer>;
    let base: string;
    let hits = 0;

    beforeAll(async () => {
        server = createServer((req, res) => {
            hits += 1;
            if (req.url === "/big") {
                // 2 MB, its tags in the head and a decoy far past the cap.
                res.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8",
                });
                res.write(
                    `<html><head><title>Big page</title><meta property="og:title" content="Big"></head><body>`,
                );
                for (let i = 0; i < 2048; i += 1) res.write(filler);
                res.end(
                    `<meta property="og:description" content="past the cap"></body></html>`,
                );
                return;
            }
            if (req.url === "/gzip") {
                const html = page(`<title>Zipped</title>`, filler.repeat(1024));
                res.writeHead(200, {
                    "Content-Type": "text/html",
                    "Content-Encoding": "gzip",
                });
                res.end(gzipSync(html));
                return;
            }
            res.writeHead(404);
            res.end();
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
        );
        base = `http://localhost:${(server.address() as AddressInfo).port}`;
    });
    afterAll(
        () => new Promise<void>((resolve) => server.close(() => resolve())),
    );

    const deps = {
        resolve: () =>
            Promise.resolve([{ address: "127.0.0.1", family: 4 as const }]),
        transport: nodeTransport,
        testHosts: new Set(["localhost"]),
    };

    it("stops a 2 MB page at 512 KB and still reads its head", async () => {
        const result = await guardedFetch(
            new URL(`${base}/big`),
            { maxBytes: MAX_HTML_BYTES, timeoutMs: 5_000, headers: {} },
            deps,
        );
        if (!result.ok) throw new Error(`fetch failed: ${result.failure}`);
        expect(result.truncated).toBe(true);
        expect(result.body.length).toBeLessThanOrEqual(MAX_HTML_BYTES);
        const tags = parseHead(
            decodeHtml(result.body, result.headers["content-type"]),
            result.url.href,
        );
        expect(tags.title).toBe("Big page");
        expect(tags.og.description).toBeNull();
    });

    it("caps a compressed page after unpacking it", async () => {
        const result = await guardedFetch(
            new URL(`${base}/gzip`),
            {
                maxBytes: 64 * 1024,
                timeoutMs: 5_000,
                headers: { "Accept-Encoding": "gzip" },
            },
            deps,
        );
        if (!result.ok) throw new Error(`fetch failed: ${result.failure}`);
        expect(result.truncated).toBe(true);
        expect(result.body.length).toBe(64 * 1024);
        expect(
            parseHead(decodeHtml(result.body, "text/html"), base).title,
        ).toBe("Zipped");
    });

    it("refuses the same loopback server when it isn't a test host", async () => {
        const before = hits;
        const result = await guardedFetch(
            new URL(`${base}/big`),
            { maxBytes: MAX_HTML_BYTES, timeoutMs: 5_000, headers: {} },
            { ...deps, testHosts: new Set<string>() },
        );
        // Its port and its address are both refused; nothing connects.
        expect(result.ok).toBe(false);
        expect(hits).toBe(before);
    });
});
