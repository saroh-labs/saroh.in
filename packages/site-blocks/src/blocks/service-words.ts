import type { GstOnPrice } from "../lib/gst-price";
import { browsePriceWords, gstOnPriceOf } from "../lib/gst-price";
import { siteMoney } from "../lib/money";

/*
 * A service's words, shared by the list (`services-list.tsx`) and each
 * look's rows (`services-look.tsx`), so neither imports the other.
 */

/** A service as the public endpoint returns it. */
export interface PublicService {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number | null;
    currency: string | null;
    /**
     * The GST in or on the price; null for none. Absent from an older API.
     * The list only browses, so it reads the mode alone: "+ GST" after a
     * price GST is added to.
     */
    gst?: GstOnPrice | null;
}

/**
 * A service's price as the list shows it: the price the business typed,
 * with "+ GST" after it when GST comes on top. Null for none to show.
 */
export function servicePriceWords(
    service: Pick<PublicService, "priceCents" | "currency" | "gst">,
    locale?: string,
): string | null {
    const price = formatPrice(service.priceCents, service.currency, locale);
    return price === null
        ? null
        : browsePriceWords(price, gstOnPriceOf(service.gst)?.mode === "ADDED");
}

/** "30 min", "1 hr", "1 hr 30 min". */
export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * A service price, or null when there is none to show; an absent price is
 * never "0".
 *
 * `priceCents` is the amount x 100 for EVERY currency: that is how the service
 * form writes it (`Math.round(price * 100)`) and how the workspace reads it
 * (`formatMoney`, amount / 100). Dividing by the currency's own minor unit
 * instead showed a ¥1,500 service as ¥150,000 (review of #255). Intl still
 * chooses the decimals to DISPLAY, so yen shows none.
 *
 * `locale` defaults to the visitor's; tests pin one.
 */
export function formatPrice(
    priceCents: number | null,
    currency: string | null,
    locale?: string,
): string | null {
    if (priceCents === null || !currency) return null;
    // Whole amounts without decimals (DEC-073 #11); an unknown currency
    // code is no price rather than a wrong one.
    return siteMoney(priceCents / 100, currency, locale);
}
