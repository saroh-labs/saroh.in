import { describe, expect, it } from "vitest";

import { serviceJsonLd, serviceJsonLdScript } from "./service-json-ld";

/**
 * What a business can be booked for, as search engines read it: only what
 * the booking page shows, and a price that is what the customer pays. Where
 * the business adds GST to its prices that is the API's amount to pay
 * (₹2,000 at 18% is ₹2,360); otherwise the typed price, to the paisa.
 */

const SERVICE = {
    id: "svc_1",
    name: "Deep tissue massage",
    description: "  Sixty minutes.  ",
    priceCents: 200000,
    currency: "INR",
};

const ADDS = {
    mode: "ADDED",
    rate: "18",
    listCents: 200000,
    gstCents: 36000,
    payCents: 236000,
};
const INCLUDES = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 200000,
    gstCents: 30508,
    payCents: 200000,
};

const build = (service: Record<string, unknown> = {}) =>
    serviceJsonLd({
        business: "Kavi Spa",
        origin: "https://kavi.example.com",
        services: [{ ...SERVICE, ...service }],
    })[0];

describe("serviceJsonLd", () => {
    it("describes a service from what the booking page shows", () => {
        expect(build()).toEqual({
            "@context": "https://schema.org",
            "@type": "Service",
            name: "Deep tissue massage",
            description: "Sixty minutes.",
            url: "https://kavi.example.com/book?service=svc_1",
            provider: {
                "@type": "Organization",
                name: "Kavi Spa",
                url: "https://kavi.example.com/",
            },
            offers: {
                "@type": "Offer",
                price: "2000.00",
                priceCurrency: "INR",
                url: "https://kavi.example.com/book?service=svc_1",
            },
        });
    });

    it("GST added: publishes the API's amount to pay", () => {
        expect(build({ gst: ADDS }).offers).toMatchObject({
            price: "2360.00",
            priceCurrency: "INR",
        });
    });

    it("GST included, none said, or something strange: the typed price, to the paisa", () => {
        const typed = build();
        for (const gst of [
            INCLUDES,
            null,
            undefined,
            "18",
            { mode: "ADDED" },
        ]) {
            expect(build({ gst })).toEqual(typed);
        }
    });

    it("a service with no price offers none, whatever the GST says", () => {
        for (const priceCents of [null, 0]) {
            expect(build({ priceCents, gst: ADDS })).not.toHaveProperty(
                "offers",
            );
        }
    });

    it("no services, no script", () => {
        expect(
            serviceJsonLdScript({
                business: "Kavi Spa",
                origin: "https://kavi.example.com",
                services: [],
            }),
        ).toBeNull();
    });
});
