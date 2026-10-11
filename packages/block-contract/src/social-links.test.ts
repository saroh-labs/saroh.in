import { describe, expect, it } from "vitest";

import type { SocialNetwork } from "./social-links";
import {
    mapLinkOrNull,
    normaliseMapLink,
    normaliseSocialLink,
    parseSocialLinks,
    SOCIAL_LABELS,
    SOCIAL_NETWORKS,
    SOCIAL_PLACEHOLDERS,
    socialLinkItems,
    socialLinkShown,
    socialLinksSummary,
    whatsappLinkFromPhone,
} from "./social-links";

const url = (network: SocialNetwork, raw: string) => {
    const check = normaliseSocialLink(network, raw);
    return check.ok ? check.url : null;
};

/** One accepted value per network, and the address it is kept as. */
const KEPT: Record<SocialNetwork, [string, string][]> = {
    instagram: [
        ["@rye.bakery", "https://www.instagram.com/rye.bakery"],
        ["rye_bakery", "https://www.instagram.com/rye_bakery"],
        ["instagram.com/rye", "https://www.instagram.com/rye"],
        [
            "https://www.instagram.com/rye/?hl=en#top",
            "https://www.instagram.com/rye",
        ],
        ["http://instagram.com/@rye", "https://www.instagram.com/rye"],
    ],
    facebook: [
        ["ryebakery", "https://www.facebook.com/ryebakery"],
        ["facebook.com/ryebakery/", "https://www.facebook.com/ryebakery"],
        [
            "https://m.facebook.com/profile.php?id=100012345678&ref=x",
            "https://www.facebook.com/profile.php?id=100012345678",
        ],
        [
            "https://www.facebook.com/people/Rye-Bakery/100012345678/",
            "https://www.facebook.com/people/Rye-Bakery/100012345678",
        ],
    ],
    whatsapp: [
        ["+91 98450 12345", "https://wa.me/919845012345"],
        ["+91-98450-12345", "https://wa.me/919845012345"],
        ["wa.me/919845012345", "https://wa.me/919845012345"],
        [
            "https://api.whatsapp.com/send?phone=919845012345&text=hi",
            "https://wa.me/919845012345",
        ],
        ["+44 20 7946 0958", "https://wa.me/442079460958"],
    ],
    youtube: [
        ["@ryebakery", "https://www.youtube.com/@ryebakery"],
        ["ryebakery", "https://www.youtube.com/@ryebakery"],
        ["youtube.com/@ryebakery", "https://www.youtube.com/@ryebakery"],
        [
            "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
            "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
        ],
        ["m.youtube.com/c/RyeBakery", "https://www.youtube.com/c/RyeBakery"],
    ],
    x: [
        ["@rye_bakery", "https://x.com/rye_bakery"],
        ["https://twitter.com/rye_bakery", "https://x.com/rye_bakery"],
        ["x.com/rye_bakery?s=20", "https://x.com/rye_bakery"],
    ],
    linkedin: [
        [
            "linkedin.com/company/rye-bakery",
            "https://www.linkedin.com/company/rye-bakery",
        ],
        [
            "https://in.linkedin.com/in/asha-rao-1a2b3c/",
            "https://www.linkedin.com/in/asha-rao-1a2b3c",
        ],
        ["company/rye-bakery", "https://www.linkedin.com/company/rye-bakery"],
    ],
    pinterest: [
        ["ryebakery", "https://www.pinterest.com/ryebakery/"],
        ["in.pinterest.com/ryebakery/", "https://www.pinterest.com/ryebakery/"],
    ],
    telegram: [
        ["@ryebakery", "https://t.me/ryebakery"],
        ["https://telegram.me/ryebakery", "https://t.me/ryebakery"],
    ],
};

describe("normaliseSocialLink (DEC-128)", () => {
    it.each(SOCIAL_NETWORKS)(
        "%s: a handle and a link become one address on its own host",
        (network) => {
            for (const [typed, kept] of KEPT[network]) {
                expect(url(network, typed), typed).toBe(kept);
            }
        },
    );

    it.each(SOCIAL_NETWORKS)(
        "%s: a kept address normalises to itself",
        (network) => {
            for (const [, kept] of KEPT[network]) {
                expect(url(network, kept)).toBe(kept);
            }
        },
    );

    it.each(SOCIAL_NETWORKS)(
        "%s: refuses another site, a script and a lookalike host",
        (network) => {
            for (const bad of [
                "https://evil.example/rye",
                "javascript:alert(1)",
                "data:text/html,<script>alert(1)</script>",
                "https://instagram.com.evil.example/rye",
                "https://evil.example/?next=instagram.com/rye",
                "https://user:pass@instagram.com/rye",
                "//evil.example",
                "rye bakery",
                '"><script>alert(1)</script>',
            ]) {
                const check = normaliseSocialLink(network, bad);
                // A network may read a few of these as its own (a plain
                // word is a handle): what it keeps is still its own host.
                if (check.ok) {
                    expect(check.url, bad).toMatch(/^https:\/\//);
                    expect(check.url, bad).not.toContain("evil");
                    expect(check.url, bad).not.toContain("script");
                } else {
                    expect(check.problem).not.toBe("");
                }
            }
        },
    );

    it("refuses a link filed under the wrong network", () => {
        expect(url("instagram", "https://facebook.com/rye")).toBeNull();
        expect(url("facebook", "https://instagram.com/rye")).toBeNull();
        expect(url("x", "https://t.me/rye")).toBeNull();
        expect(url("telegram", "https://x.com/rye")).toBeNull();
        expect(url("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBeNull();
        expect(url("linkedin", "https://x.com/in/rye")).toBeNull();
        expect(url("whatsapp", "https://t.me/919845012345")).toBeNull();
    });

    it("refuses a network's own pages that aren't a profile", () => {
        expect(url("instagram", "instagram.com/p/Cabc123")).toBeNull();
        expect(url("instagram", "instagram.com")).toBeNull();
        expect(url("instagram", "www.instagram.com")).toBeNull();
        expect(url("x", "x.com/intent/tweet")).toBeNull();
        expect(url("youtube", "youtube.com/watch?v=abc")).toBeNull();
        expect(url("youtube", "youtu.be")).toBeNull();
        expect(
            url("facebook", "facebook.com/l.php?u=https://evil.example"),
        ).toBeNull();
        expect(url("telegram", "t.me/+AbCdEf123")).toBeNull();
        expect(url("linkedin", "linkedin.com/feed")).toBeNull();
        expect(url("linkedin", "ryebakery")).toBeNull();
    });

    it("takes WhatsApp as a number with its country code", () => {
        const noCode = normaliseSocialLink("whatsapp", "98450 12345");
        expect(noCode).toEqual({
            ok: false,
            problem: "Start with + and the country code, like +91 98450 12345.",
        });
        expect(normaliseSocialLink("whatsapp", "+91 9845 0123")).toEqual({
            ok: false,
            problem: "An Indian number is +91 and then 10 digits.",
        });
        expect(url("whatsapp", "call us")).toBeNull();
        expect(url("whatsapp", "wa.me/message/ABCDEF")).toBeNull();
    });

    it("says what to type when it refuses", () => {
        expect(
            normaliseSocialLink("instagram", "https://evil.example/rye"),
        ).toEqual({
            ok: false,
            problem:
                "That isn't an Instagram link. Use @yourname or instagram.com/yourname.",
        });
        expect(normaliseSocialLink("x", "https://evil.example")).toEqual({
            ok: false,
            problem: "That isn't an X link. Use @yourname or x.com/yourname.",
        });
        expect(normaliseSocialLink("telegram", "  ").ok).toBe(false);
        expect(normaliseSocialLink("instagram", "a".repeat(601))).toEqual({
            ok: false,
            problem: "That link is too long.",
        });
    });

    it("has a name and a placeholder for every network", () => {
        for (const network of SOCIAL_NETWORKS) {
            expect(SOCIAL_LABELS[network]).not.toBe("");
            expect(SOCIAL_PLACEHOLDERS[network]).not.toBe("");
        }
    });
});

describe("whatsappLinkFromPhone", () => {
    it("is the wa.me link of an E.164 number, the business phone's shape", () => {
        expect(whatsappLinkFromPhone("+919845012345")).toBe(
            "https://wa.me/919845012345",
        );
        expect(whatsappLinkFromPhone("98450 12345")).toBeNull();
    });
});

describe("socialLinkShown", () => {
    it("reads as where the link opens", () => {
        expect(socialLinkShown("https://www.instagram.com/rye")).toBe(
            "instagram.com/rye",
        );
        expect(socialLinkShown("https://www.pinterest.com/rye/")).toBe(
            "pinterest.com/rye",
        );
        expect(socialLinkShown("https://wa.me/919845012345")).toBe(
            "wa.me/919845012345",
        );
        expect(
            socialLinkShown(`https://www.facebook.com/${"a".repeat(80)}`),
        ).toHaveLength(58);
    });
});

describe("parseSocialLinks", () => {
    it("keeps known networks whose value is already canonical", () => {
        expect(
            parseSocialLinks({
                instagram: "https://www.instagram.com/rye",
                whatsapp: "https://wa.me/919845012345",
            }),
        ).toEqual({
            instagram: "https://www.instagram.com/rye",
            whatsapp: "https://wa.me/919845012345",
        });
    });

    it("drops anything that was never accepted", () => {
        expect(
            parseSocialLinks({
                instagram: "https://evil.example/rye",
                facebook: "javascript:alert(1)",
                // Accepted when typed, but not the kept form.
                x: "@rye",
                youtube: 42,
                myspace: "https://myspace.com/rye",
                // Google Maps is a place's map now, not a social link.
                googleMaps: "https://maps.app.goo.gl/AbC123xyZ",
            }),
        ).toEqual({});
        for (const junk of [null, undefined, "x", 3, [], ["a"]]) {
            expect(parseSocialLinks(junk)).toEqual({});
        }
    });
});

describe("socialLinkItems and socialLinksSummary", () => {
    it("lists what is set, in the networks' order", () => {
        const links = {
            youtube: "https://www.youtube.com/@rye",
            instagram: "https://www.instagram.com/rye",
            whatsapp: "https://wa.me/919845012345",
        };
        expect(socialLinkItems(links).map((i) => i.network)).toEqual([
            "instagram",
            "whatsapp",
            "youtube",
        ]);
        expect(socialLinksSummary(links)).toBe("Instagram, WhatsApp, YouTube");
        expect(socialLinksSummary({})).toBe("");
    });
});

describe("normaliseMapLink (DEC-128)", () => {
    const map = (raw: string) => {
        const check = normaliseMapLink(raw);
        return check.ok ? check.url : null;
    };
    const KEPT_MAPS: [string, string][] = [
        [
            "https://maps.app.goo.gl/AbC123xyZ",
            "https://maps.app.goo.gl/AbC123xyZ",
        ],
        [
            "maps.app.goo.gl/AbC123xyZ?g_st=ic",
            "https://maps.app.goo.gl/AbC123xyZ",
        ],
        ["g.page/rye-bakery", "https://g.page/rye-bakery"],
        [
            "https://g.page/r/CabcDEF123/review",
            "https://g.page/r/CabcDEF123/review",
        ],
        ["goo.gl/maps/AbC123", "https://goo.gl/maps/AbC123"],
        [
            "https://www.google.co.in/maps/place/Rye+Bakery/@12.97,77.59,17z",
            "https://www.google.com/maps/place/Rye+Bakery/@12.97,77.59,17z",
        ],
        [
            "https://maps.google.com/?cid=1234567890",
            "https://maps.google.com/?cid=1234567890",
        ],
    ];

    it("keeps Google's own map links, as one address each", () => {
        for (const [typed, kept] of KEPT_MAPS) {
            expect(map(typed), typed).toBe(kept);
            // And a kept address normalises to itself.
            expect(map(kept)).toBe(kept);
            expect(mapLinkOrNull(kept)).toBe(kept);
        }
    });

    it("refuses another site, a script and Google's redirects", () => {
        for (const bad of [
            "https://evil.example/maps",
            "https://maps.evil.example/x",
            "javascript:alert(1)",
            "https://www.google.com/url?q=https://evil.example",
            "https://google.com/search?q=rye",
            "https://maps.google.com/url?q=x",
            "https://maps.app.goo.gl.evil.example/AbC",
            "rye bakery, 14 hill road",
            "@rye",
        ]) {
            expect(normaliseMapLink(bad), bad).toEqual({
                ok: false,
                problem:
                    "That isn't a Google Maps link. In Google Maps, press Share and paste the link here.",
            });
        }
        expect(normaliseMapLink("  ").ok).toBe(false);
        expect(
            normaliseMapLink(`https://www.google.com/maps/${"a".repeat(600)}`),
        ).toEqual({
            ok: false,
            problem: "That link is too long.",
        });
    });

    it("drops the fragment and keeps the place", () => {
        expect(map("https://google.com/maps/place/Rye#x")).toBe(
            "https://www.google.com/maps/place/Rye",
        );
    });

    it("never serves a stored value that isn't already canonical", () => {
        for (const junk of [
            null,
            3,
            "https://evil.example",
            "g.page/rye",
            "https://www.google.co.in/maps/place/Rye",
        ]) {
            expect(mapLinkOrNull(junk)).toBeNull();
        }
    });
});
