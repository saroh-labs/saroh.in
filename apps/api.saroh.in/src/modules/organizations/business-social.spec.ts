/**
 * A business's social links as the settings save writes them (DEC-125):
 * each network set, replaced and cleared on its own, a handle and a link
 * kept as one canonical address on the network's own host, and anything
 * else refused on its field. DB-free.
 */
import { BadRequestException } from "@nestjs/common";
import type { SocialNetwork } from "@saroh/block-contract";
import { SOCIAL_NETWORKS } from "@saroh/block-contract";

import {
    socialField,
    socialLinksRead,
    socialLinksWrite,
} from "./business-social";

/** A value each network accepts, and the address it is kept as. */
const SET: Record<SocialNetwork, [string, string]> = {
    instagram: ["@rye.bakery", "https://www.instagram.com/rye.bakery"],
    facebook: ["facebook.com/ryebakery", "https://www.facebook.com/ryebakery"],
    whatsapp: ["+91 98450 12345", "https://wa.me/919845012345"],
    youtube: ["@ryebakery", "https://www.youtube.com/@ryebakery"],
    x: ["https://twitter.com/rye_bakery", "https://x.com/rye_bakery"],
    linkedin: [
        "linkedin.com/company/rye-bakery",
        "https://www.linkedin.com/company/rye-bakery",
    ],
    pinterest: ["ryebakery", "https://www.pinterest.com/ryebakery/"],
    telegram: ["@ryebakery", "https://t.me/ryebakery"],
};

/** A second value, to replace the first with. */
const REPLACED: Record<SocialNetwork, [string, string]> = {
    instagram: ["instagram.com/rye", "https://www.instagram.com/rye"],
    facebook: ["ryeandco", "https://www.facebook.com/ryeandco"],
    whatsapp: ["wa.me/918040001234", "https://wa.me/918040001234"],
    youtube: ["youtube.com/c/Rye", "https://www.youtube.com/c/Rye"],
    x: ["@rye", "https://x.com/rye"],
    linkedin: ["in/asha-rao", "https://www.linkedin.com/in/asha-rao"],
    pinterest: ["pinterest.com/rye_co", "https://www.pinterest.com/rye_co/"],
    telegram: ["t.me/rye_co", "https://t.me/rye_co"],
};

function refusal(fn: () => unknown): { message: string; field?: string } {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const body = (error as BadRequestException).getResponse() as {
            message: string;
            details?: { field?: string };
        };
        return { message: body.message, field: body.details?.field };
    }
    throw new Error("expected a refusal");
}

describe("socialLinksWrite", () => {
    it.each(SOCIAL_NETWORKS)("%s is set, replaced and cleared", (network) => {
        const [typed, kept] = SET[network];
        const set = socialLinksWrite({ [network]: typed }, null);
        expect(set).toEqual({ socialLinks: { [network]: kept } });

        const [typedNext, keptNext] = REPLACED[network];
        const replaced = socialLinksWrite(
            { [network]: typedNext },
            set.socialLinks,
        );
        expect(replaced).toEqual({ socialLinks: { [network]: keptNext } });

        const cleared = socialLinksWrite(
            { [network]: "  " },
            replaced.socialLinks,
        );
        expect(cleared).toEqual({ socialLinks: {} });
    });

    it("leaves the networks that weren't sent as they are", () => {
        const stored = {
            instagram: "https://www.instagram.com/rye",
            telegram: "https://t.me/rye_co",
        };
        expect(socialLinksWrite({ x: "@rye" }, stored)).toEqual({
            socialLinks: { ...stored, x: "https://x.com/rye" },
        });
        expect(socialLinksWrite({ instagram: "" }, stored)).toEqual({
            socialLinks: { telegram: "https://t.me/rye_co" },
        });
    });

    it("writes nothing when nothing was sent", () => {
        expect(socialLinksWrite(undefined, { x: "https://x.com/rye" })).toEqual(
            {},
        );
        expect(socialLinksWrite({}, null)).toEqual({});
    });

    it.each(SOCIAL_NETWORKS)(
        "%s refuses another site's address, on its own field",
        (network) => {
            for (const bad of [
                "https://evil.example/rye",
                "javascript:alert(1)",
                "https://instagram.com.evil.example/rye",
            ]) {
                const refused = refusal(() =>
                    socialLinksWrite({ [network]: bad }, null),
                );
                expect(refused.field).toBe(socialField(network));
                expect(refused.message).not.toBe("");
                // The refusal never repeats what was typed.
                expect(refused.message).not.toContain("evil");
            }
        },
    );

    it("refuses a link filed under the wrong network", () => {
        expect(
            refusal(() =>
                socialLinksWrite(
                    { instagram: "https://facebook.com/rye" },
                    null,
                ),
            ),
        ).toEqual({
            field: "socialLinks.instagram",
            message:
                "That isn't an Instagram link. Use @yourname or instagram.com/yourname.",
        });
    });

    it("takes WhatsApp from a phone number, and says so when it isn't one", () => {
        expect(
            socialLinksWrite({ whatsapp: "+91 (98450) 12345" }, null),
        ).toEqual({ socialLinks: { whatsapp: "https://wa.me/919845012345" } });
        expect(
            refusal(() => socialLinksWrite({ whatsapp: "98450 12345" }, null)),
        ).toEqual({
            field: "socialLinks.whatsapp",
            message: "Start with + and the country code, like +91 98450 12345.",
        });
    });

    it("refuses the whole save when one link is wrong, keeping none of it", () => {
        expect(() =>
            socialLinksWrite(
                { instagram: "@rye", x: "https://evil.example" },
                null,
            ),
        ).toThrow(BadRequestException);
    });

    it("drops a stored value that was never canonical when it writes", () => {
        expect(
            socialLinksWrite(
                { x: "@rye" },
                { instagram: "https://evil.example/rye" },
            ),
        ).toEqual({ socialLinks: { x: "https://x.com/rye" } });
    });
});

describe("socialLinksRead", () => {
    it("serves only a network's own canonical address", () => {
        expect(
            socialLinksRead({
                instagram: "https://www.instagram.com/rye",
                facebook: "https://evil.example/rye",
                x: "javascript:alert(1)",
                other: "https://www.instagram.com/rye",
                // A place's map, not a social link: dropped if ever stored.
                googleMaps: "https://maps.app.goo.gl/AbC123xyZ",
            }),
        ).toEqual({ instagram: "https://www.instagram.com/rye" });
        expect(socialLinksRead(null)).toEqual({});
        expect(socialLinksRead("https://www.instagram.com/rye")).toEqual({});
    });
});
