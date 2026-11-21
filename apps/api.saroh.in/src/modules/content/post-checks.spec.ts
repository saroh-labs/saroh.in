import type { CheckService } from "../sites/publish-checks";
import { checkPost, hrefsOf } from "./post-checks";

const SERVICES: CheckService[] = [
    {
        id: "s_trial",
        name: "Bridal trial",
        priceCents: 250000,
        currency: "INR",
    },
];
const PATHS = new Set(["/", "/about", "/blog", "/blog/live-post"]);

describe("checkPost", () => {
    it("is quiet on writing that agrees with Services and the site", () => {
        expect(
            checkPost({
                content:
                    '<p>The Bridal trial is ₹2,500. <a href="/about#us">About</a>, <a href="/blog/live-post/">more</a>, <a href="https://x.com">x</a>.</p><div data-embed="service" data-id="s_trial"></div>',
                services: SERVICES,
                paths: PATHS,
            }),
        ).toEqual([]);
    });

    it("flags a typed price, a dead link and a card for a gone service", () => {
        const flags = checkPost({
            content:
                '<p>The Bridal trial is ₹2,000.</p><p><a href="/prices">Prices</a> <a href="www.x.com">x</a></p><div data-embed="service" data-id="s_old"></div>',
            services: SERVICES,
            paths: PATHS,
        });
        expect(flags.map((f) => f.type)).toEqual([
            "priceMismatch",
            "brokenLink",
            "brokenLink",
            "serviceGone",
        ]);
        expect(flags[1].message).toContain("/prices");
    });

    it("reads every href", () => {
        expect(
            hrefsOf("<a class='x' href='/a'>a</a><a href=\"/b\">b</a>"),
        ).toEqual(["/a", "/b"]);
    });
});

describe("checkPost on adversarial writing (W-ReDoS)", () => {
    const fast = (content: string) => {
        const started = performance.now();
        checkPost({ content, services: SERVICES, paths: PATHS });
        return performance.now() - started;
    };

    it.each([
        ["100k unclosed <", "<".repeat(100_000)],
        ["100k unclosed <a", "<a ".repeat(33_000)],
        ["100k unclosed <div data-embed", "<div data-embed=x ".repeat(5_500)],
        ["an unclosed href quote, many times", `<a ${'href="'.repeat(16_000)}`],
        [
            "100k $1 next to a service name",
            `Bridal trial ${"$1 ".repeat(33_000)}`,
        ],
        [
            "100k free next to a service name",
            `Bridal trial ${"free ".repeat(20_000)}`,
        ],
    ])("reads %s in well under a second", (_, content) => {
        expect(fast(content)).toBeLessThan(250);
    });

    it("still reads attributes in any order and quoting", () => {
        expect(
            hrefsOf(
                `<a title="a b" href=/x>x</a><A HREF='/y' >y</a><a data-href="/z">`,
            ),
        ).toEqual(["/x", "/y"]);
    });
});
