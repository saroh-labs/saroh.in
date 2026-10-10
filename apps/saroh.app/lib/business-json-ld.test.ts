import { describe, expect, it } from "vitest";

import type { PublicContact } from "@saroh/site-blocks";

import { businessJsonLd, businessJsonLdScript } from "./business-json-ld";

const NONE: PublicContact = {
    phone: null,
    email: null,
    places: [],
    social: [],
};

const place = (name: string, address: string) => ({
    source: "location" as const,
    name,
    address,
    hours: null,
});

const input = (contact: Partial<PublicContact>) => ({
    name: "Rye & Co.",
    origin: "https://rye.saroh.app",
    contact: { ...NONE, ...contact },
});

describe("businessJsonLd (DEC-125)", () => {
    it("says nothing when nothing is set", () => {
        expect(businessJsonLd(input({}))).toBeNull();
        expect(businessJsonLdScript(input({}))).toBeNull();
    });

    it("is a LocalBusiness with its one place, phone, email and profiles", () => {
        expect(
            businessJsonLd(
                input({
                    phone: "+919845012345",
                    email: "hello@rye.example.com",
                    places: [place("Indiranagar", "12th Main\nBengaluru")],
                    social: [
                        {
                            network: "instagram",
                            url: "https://www.instagram.com/rye",
                        },
                        {
                            network: "whatsapp",
                            url: "https://wa.me/919845012345",
                        },
                        {
                            network: "googleMaps",
                            url: "https://maps.app.goo.gl/AbC123xyZ",
                        },
                        { network: "x", url: "https://x.com/rye" },
                    ],
                }),
            ),
        ).toEqual({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: "Rye & Co.",
            url: "https://rye.saroh.app/",
            telephone: "+919845012345",
            email: "hello@rye.example.com",
            address: {
                "@type": "PostalAddress",
                streetAddress: "12th Main, Bengaluru",
            },
            hasMap: "https://maps.app.goo.gl/AbC123xyZ",
            // A way to message and a map are not profiles.
            sameAs: ["https://www.instagram.com/rye", "https://x.com/rye"],
        });
    });

    it("is an Organization with only what is set when there is no place", () => {
        expect(
            businessJsonLd(
                input({
                    social: [
                        {
                            network: "instagram",
                            url: "https://www.instagram.com/rye",
                        },
                    ],
                }),
            ),
        ).toEqual({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Rye & Co.",
            url: "https://rye.saroh.app/",
            sameAs: ["https://www.instagram.com/rye"],
        });
    });

    it("lists each place when there are several", () => {
        const data = businessJsonLd(
            input({
                phone: "+919845012345",
                places: [
                    place("Indiranagar", "12th Main"),
                    place("Koramangala", "80 Feet Road"),
                ],
            }),
        );
        expect(data).toMatchObject({
            "@type": "Organization",
            location: [
                {
                    "@type": "Place",
                    name: "Indiranagar",
                    address: {
                        "@type": "PostalAddress",
                        streetAddress: "12th Main",
                    },
                },
                {
                    "@type": "Place",
                    name: "Koramangala",
                    address: {
                        "@type": "PostalAddress",
                        streetAddress: "80 Feet Road",
                    },
                },
            ],
        });
        expect(data).not.toHaveProperty("address");
    });

    it("never names Saroh", () => {
        const script = businessJsonLdScript(input({ phone: "+919845012345" }));
        expect(script).not.toMatch(/saroh\.in|Saroh/);
    });

    it("can't close its script tag from a name", () => {
        const script = businessJsonLdScript({
            ...input({ phone: "+919845012345" }),
            name: "</script><script>alert(1)</script>",
        });
        expect(script).not.toContain("</script>");
        expect(JSON.parse(script ?? "{}")).toMatchObject({
            name: "</script><script>alert(1)</script>",
        });
    });
});
