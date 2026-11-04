/**
 * The screenshots this site may show: copies of saroh.in's, read one by one for
 * rupees, GST, UPI, +91 and India's places, and only the clean ones kept. A key
 * missing here draws no frame (global edition plan, U11 captures the rest).
 */
import type { ShotKey } from "@saroh/marketing/content-types";
import type { Shot, ShotView } from "@saroh/marketing/shot";

const shot = (key: ShotKey, alt: string, width = 2880, height = 1800): Shot => {
    const src = `/shots/v2/${key}.webp`;
    const copies = [640, 960, 1280, 1920].map(
        (w) => `/shots/v2/sized/${key}-${w}.webp ${w}w`,
    );
    return {
        src,
        alt,
        width,
        height,
        srcSet: [...copies, `${src} ${width}w`].join(", "),
    };
};

export const GLOBAL_SHOTS: Partial<Record<ShotKey, Shot>> = {
    "s-insights": shot(
        "s-insights",
        "Insights: site views, visitors, enquiries and orders over the last 30 days, with views by day and top pages",
    ),
    "i-compare": shot(
        "i-compare",
        "Insights for 30 days: site views, unique visitors, enquiries and orders, views by day and the most-viewed pages",
        2340,
        1838,
    ),
    "i-weeks": shot(
        "i-weeks",
        "Ninety days of site views, a bar for each day",
        2340,
        632,
    ),
    "i-store": shot(
        "i-store",
        "Insights for the last seven days: site views, enquiries, orders and the most-viewed pages",
    ),
    "p-stock": shot(
        "p-stock",
        "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
    ),
};

/** The shot as `@saroh/marketing` draws it, or nothing when this site has none. */
export function shotView(key?: ShotKey, alt?: string): ShotView | undefined {
    const image = key && GLOBAL_SHOTS[key];
    return image ? { id: key, image, alt } : undefined;
}
