import { describe, expect, it } from "vitest";

import {
    readSocialField,
    socialDraftOf,
    socialFieldValue,
    socialNetworkOfField,
    socialPatch,
    socialProblems,
    socialRowSummary,
    socialSavedWords,
} from "./social-links";

const SAVED = {
    instagram: "https://www.instagram.com/rye",
    whatsapp: "https://wa.me/919845012345",
    pinterest: "https://www.pinterest.com/ryebakery/",
};

describe("the Social links row (DEC-125)", () => {
    it("names what is linked, in the networks' order", () => {
        expect(socialRowSummary(SAVED)).toBe("Instagram, WhatsApp, Pinterest");
    });

    it("says None yet when nothing is", () => {
        expect(socialRowSummary({})).toBe("None yet");
        expect(socialRowSummary(null)).toBe("None yet");
        expect(socialRowSummary(undefined)).toBe("None yet");
    });
});

describe("what the sheet starts from", () => {
    it("shows a saved link without its https, and WhatsApp as its number", () => {
        const draft = socialDraftOf(SAVED);
        expect(draft.instagram).toBe("instagram.com/rye");
        expect(draft.whatsapp).toBe("+91 98450 12345");
        expect(draft.pinterest).toBe("pinterest.com/ryebakery");
        expect(draft.facebook).toBe("");
    });

    it("types back as the same link, so an untouched sheet sends nothing", () => {
        expect(socialPatch(socialDraftOf(SAVED), SAVED)).toEqual({});
        expect(socialFieldValue("whatsapp", "https://wa.me/442079460958")).toBe(
            "+442079460958",
        );
    });
});

describe("what a field says under itself", () => {
    it("says nothing while it is empty", () => {
        expect(readSocialField("instagram", "  ")).toEqual({ kind: "empty" });
    });

    it("says where a handle or a link will open", () => {
        expect(readSocialField("instagram", "@rye.bakery")).toEqual({
            kind: "opens",
            url: "https://www.instagram.com/rye.bakery",
            shown: "instagram.com/rye.bakery",
        });
        expect(readSocialField("whatsapp", "+91 98450 12345")).toMatchObject({
            kind: "opens",
            shown: "wa.me/919845012345",
        });
    });

    it("says what is wrong with anything the API would refuse", () => {
        expect(
            readSocialField("instagram", "https://evil.example/rye"),
        ).toEqual({
            kind: "problem",
            problem:
                "That isn't an Instagram link. Use @yourname or instagram.com/yourname.",
        });
        expect(
            socialProblems({
                ...socialDraftOf({}),
                x: "https://evil.example",
                telegram: "@rye_co",
            }),
        ).toEqual({
            x: "That isn't an X link. Use @yourname or x.com/yourname.",
        });
    });
});

describe("what Save sends", () => {
    it("is only the networks that changed, as typed", () => {
        const draft = {
            ...socialDraftOf(SAVED),
            instagram: " @rye.bakery ",
            x: "x.com/rye",
        };
        expect(socialPatch(draft, SAVED)).toEqual({
            instagram: "@rye.bakery",
            x: "x.com/rye",
        });
    });

    it("clears a network with an empty string", () => {
        expect(
            socialPatch({ ...socialDraftOf(SAVED), whatsapp: "" }, SAVED),
        ).toEqual({ whatsapp: "" });
    });

    it("sends nothing for the same link typed another way", () => {
        expect(
            socialPatch(
                {
                    ...socialDraftOf(SAVED),
                    instagram: "https://instagram.com/rye/",
                },
                SAVED,
            ),
        ).toEqual({});
    });
});

describe("a refusal's field", () => {
    it("names its network", () => {
        expect(socialNetworkOfField("socialLinks.instagram")).toBe("instagram");
        expect(socialNetworkOfField("socialLinks.telegram")).toBe("telegram");
    });

    it("is nothing for any other field", () => {
        expect(socialNetworkOfField("phone")).toBeNull();
        expect(socialNetworkOfField("socialLinks.myspace")).toBeNull();
        // Google Maps is an address's map link now, not a network.
        expect(socialNetworkOfField("socialLinks.googleMaps")).toBeNull();
        expect(socialNetworkOfField(undefined)).toBeNull();
    });
});

describe("what a save says", () => {
    it("says where they show, or that they are gone", () => {
        expect(socialSavedWords(SAVED)).toBe(
            "Social links saved. Your website shows them now.",
        );
        expect(socialSavedWords({})).toBe(
            "Social links removed from your website",
        );
    });
});
