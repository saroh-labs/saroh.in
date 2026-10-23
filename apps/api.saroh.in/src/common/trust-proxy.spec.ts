import { CLOUDFLARE_RANGES, trustedProxyRanges } from "./trust-proxy";

describe("the proxies the sign-in rate limit looks past", () => {
    it("are Cloudflare's edge and the private network behind Cloudflare", () => {
        const ranges = trustedProxyRanges("cloudflare");
        expect(ranges).toEqual(expect.arrayContaining(CLOUDFLARE_RANGES));
        expect(ranges).toEqual(
            expect.arrayContaining([
                "10.0.0.0/8",
                "172.16.0.0/12",
                "127.0.0.0/8",
            ]),
        );
    });

    it("leave Cloudflare out when nothing in front is Cloudflare", () => {
        expect(trustedProxyRanges("private")).not.toEqual(
            expect.arrayContaining([CLOUDFLARE_RANGES[0]]),
        );
        expect(trustedProxyRanges("none")).toEqual([]);
        expect(trustedProxyRanges(undefined)).toEqual([]);
    });
});
