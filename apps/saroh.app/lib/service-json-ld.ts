import { jsonLdScript } from "./product-json-ld";

/**
 * What a business can be booked for, as search engines read it
 * (schema.org `Service`), on its booking page.
 *
 * Built only from what that page shows: each service's name, its
 * description where the business wrote one, and its price where it has
 * one. Who provides it is the site's name. Nothing is claimed that the
 * page doesn't say: no rating, no area served, no availability. No
 * services, no script.
 */

const SCHEMA = "https://schema.org";

export interface ServiceJsonLdInput {
    /** The site's name. */
    business: string;
    /** `https://<primary host>`. */
    origin: string;
    services: readonly {
        id: string;
        name: string;
        description?: string | null;
        /** In minor units; null or 0 for a service with no price shown. */
        priceCents: number | null;
        currency: string | null;
    }[];
}

export function serviceJsonLd({
    business,
    origin,
    services,
}: ServiceJsonLdInput): Record<string, unknown>[] {
    return services.map((service) => {
        const url = `${origin}/book?service=${encodeURIComponent(service.id)}`;
        const description = service.description?.trim();
        const priced =
            typeof service.priceCents === "number" &&
            service.priceCents > 0 &&
            !!service.currency;
        return {
            "@context": SCHEMA,
            "@type": "Service",
            name: service.name,
            ...(description ? { description } : {}),
            url,
            provider: {
                "@type": "Organization",
                name: business,
                url: `${origin}/`,
            },
            ...(priced
                ? {
                      offers: {
                          "@type": "Offer",
                          price: ((service.priceCents ?? 0) / 100).toFixed(2),
                          priceCurrency: service.currency,
                          url,
                      },
                  }
                : {}),
        };
    });
}

/** The script's body, or null when there is nothing to say. */
export function serviceJsonLdScript(input: ServiceJsonLdInput): string | null {
    const data = serviceJsonLd(input);
    return data.length > 0 ? jsonLdScript(data) : null;
}
