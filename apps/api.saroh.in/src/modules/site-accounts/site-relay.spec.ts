import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import {
    normaliseHost,
    signSiteRelay,
    SITE_RELAY_HEADER,
    SiteRelayGuard,
    verifySiteRelay,
} from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const SECRET = "a".repeat(40);
const NOW = 1_790_000_000_000;

function sign(
    over: Partial<{ address: string; host: string; now: number }> = {},
    secret = SECRET,
) {
    return signSiteRelay(
        {
            address: over.address ?? "203.0.113.7",
            host: over.host ?? "kavi.saroh.app",
            now: over.now ?? NOW,
        },
        secret,
    );
}

describe("signSiteRelay", () => {
    /**
     * The same vector is pinned in saroh.app's `lib/site-relay.test.ts`
     * (A3), which signs the header on the site's side: a format change on
     * one side that the other doesn't make fails one of the two.
     */
    it("signs the vector saroh.app pins", () => {
        expect(
            signSiteRelay(
                { address: "203.0.113.7", host: "kavi.saroh.app", now: NOW },
                "saroh-dev-insecure-site-relay-secret-not-for-production",
            ),
        ).toBe(
            "v1.1790000000.MjAzLjAuMTEzLjc.a2F2aS5zYXJvaC5hcHA.gWBw2J0VLDl6pASl_GPNQIo-Uyh2iB9ORmVNYgUQykw",
        );
    });
});

describe("verifySiteRelay", () => {
    it("accepts a header it signed and yields the host and a hashed address", () => {
        const relay = verifySiteRelay(sign(), SECRET, NOW);
        expect(relay).toEqual({
            host: "kavi.saroh.app",
            address: "203.0.113.7",
            clientHash: hashClientIp("203.0.113.7"),
        });
    });

    it("accepts an IPv6 visitor and a custom domain", () => {
        const relay = verifySiteRelay(
            sign({ address: "2001:db8::1", host: "Shop.Acme.COM." }),
            SECRET,
            NOW,
        );
        expect(relay?.host).toBe("shop.acme.com");
        expect(relay?.clientHash).toBe(hashClientIp("2001:db8::1"));
    });

    it("accepts a clock up to 60 seconds either way", () => {
        expect(verifySiteRelay(sign(), SECRET, NOW + 59_000)).not.toBeNull();
        expect(verifySiteRelay(sign(), SECRET, NOW - 59_000)).not.toBeNull();
    });

    it("refuses a stale or future timestamp", () => {
        expect(verifySiteRelay(sign(), SECRET, NOW + 61_000)).toBeNull();
        expect(verifySiteRelay(sign(), SECRET, NOW - 61_000)).toBeNull();
    });

    it("refuses a header signed with another secret", () => {
        expect(
            verifySiteRelay(sign({}, "b".repeat(40)), SECRET, NOW),
        ).toBeNull();
    });

    it("refuses a missing or malformed header", () => {
        expect(verifySiteRelay(undefined, SECRET, NOW)).toBeNull();
        expect(verifySiteRelay("", SECRET, NOW)).toBeNull();
        expect(verifySiteRelay("v1.1.2.3", SECRET, NOW)).toBeNull();
        expect(verifySiteRelay("x".repeat(2_000), SECRET, NOW)).toBeNull();
        expect(
            verifySiteRelay(sign().replace(/^v1/, "v2"), SECRET, NOW),
        ).toBeNull();
    });

    it("refuses a header whose address or host was swapped after signing", () => {
        const [v, t, , h, s] = sign().split(".");
        const otherAddress = Buffer.from("198.51.100.9").toString("base64url");
        expect(
            verifySiteRelay([v, t, otherAddress, h, s].join("."), SECRET, NOW),
        ).toBeNull();
        const [v2, t2, a2, , s2] = sign().split(".");
        const otherHost = Buffer.from("pulse.saroh.app").toString("base64url");
        expect(
            verifySiteRelay([v2, t2, a2, otherHost, s2].join("."), SECRET, NOW),
        ).toBeNull();
    });

    it("refuses something that is not an address or not a host, even signed", () => {
        expect(
            verifySiteRelay(sign({ address: "not-an-ip" }), SECRET, NOW),
        ).toBeNull();
        expect(
            verifySiteRelay(sign({ host: "evil host/..%00" }), SECRET, NOW),
        ).toBeNull();
    });

    it("takes the first value when the header arrives twice", () => {
        expect(verifySiteRelay([sign(), "junk"], SECRET, NOW)).not.toBeNull();
    });
});

describe("normaliseHost", () => {
    it("lower-cases and drops a port and a final dot", () => {
        expect(normaliseHost(" Kavi.Saroh.App:443 ")).toBe("kavi.saroh.app");
        expect(normaliseHost("kavi.saroh.app.")).toBe("kavi.saroh.app");
    });
});

describe("SiteRelayGuard", () => {
    function contextFor(headers: Record<string, string | undefined>) {
        const request: {
            headers: Record<string, string | undefined>;
            siteRelay?: unknown;
        } = { headers };
        const context = {
            switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext;
        return { context, request };
    }

    it("attaches the relay when it checks", () => {
        const header = signSiteRelay(
            { address: "203.0.113.7", host: "kavi.saroh.app" },
            siteRelaySecret(),
        );
        const { context, request } = contextFor({
            [SITE_RELAY_HEADER]: header,
        });
        expect(new SiteRelayGuard().canActivate(context)).toBe(true);
        expect(request.siteRelay).toMatchObject({ host: "kavi.saroh.app" });
    });

    it("answers 401 with no relay, a stale one or a forged one", () => {
        const guard = new SiteRelayGuard();
        const stale = signSiteRelay(
            {
                address: "203.0.113.7",
                host: "kavi.saroh.app",
                now: Date.now() - 120_000,
            },
            siteRelaySecret(),
        );
        const forged = signSiteRelay(
            { address: "203.0.113.7", host: "kavi.saroh.app" },
            "someone-else's-secret-that-is-long-enough",
        );
        for (const value of [undefined, stale, forged]) {
            const { context } = contextFor({ [SITE_RELAY_HEADER]: value });
            expect(() => guard.canActivate(context)).toThrow(
                UnauthorizedException,
            );
        }
    });
});
