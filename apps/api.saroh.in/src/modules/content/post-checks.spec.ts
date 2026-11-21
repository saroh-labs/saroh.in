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
