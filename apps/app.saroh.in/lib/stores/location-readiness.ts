import { PLAN_AND_BILLING_HREF } from "@/lib/billing/paused";
import { providerName } from "@/lib/payments/providers";
import type { SiteSelling } from "@/lib/sites/sells-from";
import { SELLS_FROM_ANCHOR } from "@/lib/sites/sells-from";

import type { StorefrontFulfilmentType } from "./fulfilment-types";
import { STOREFRONT_FULFILMENT_TYPES } from "./fulfilment-types";
import { FULFILMENT_LABEL } from "./late-after";
import type { StorefrontSettings } from "./storefronts";

/**
 * A location's own page (Sell › Location, the 9 Oct audit): its sections, the
 * line under its name, and "Ready for online orders · N of M" at the top.
 *
 * Pure, so the rules are tested without a screen. Every item is read from
 * what the screen already holds (the storefront, the website's Sells from),
 * never guessed: a fact the page couldn't read is left out, not counted.
 */

/** The page's tabs, in order: each one's address value and its name. */
export const LOCATION_SECTIONS = {
    place: { id: "the-place", label: "The place" },
    payments: { id: "payments", label: "Payments" },
    delivery: { id: "delivery", label: "Delivery" },
    customers: { id: "customers", label: "Customers" },
    people: { id: "people", label: "People" },
    closing: { id: "pause-or-close", label: "Pause or close" },
} as const;

export type LocationSectionKey = keyof typeof LOCATION_SECTIONS;

/** A tab, as the address carries it (`?section=delivery`). */
export type LocationTab = (typeof LOCATION_SECTIONS)[LocationSectionKey]["id"];

export const LOCATION_TABS: readonly LocationTab[] = Object.values(
    LOCATION_SECTIONS,
).map((s) => s.id);

/** The query parameter the open tab lives in, as Settings › Business. */
export const LOCATION_TAB_PARAM = "section";

/** Where "Connect a provider" goes, as it did from the old Checkout card. */
export const PROVIDERS_HREF = "/settings/providers";

/** The fields a readiness action can jump to and focus. */
export const ADDRESS_FIELD_ID = "storefront-address";
export const HOURS_FIELD_ID = "storefront-hours";
/** "Do customers come here?": where a place without a counter gets one. */
export const KIND_FIELD_ID = "location-kind";

type Store = Pick<
    StorefrontSettings,
    | "id"
    | "kind"
    | "address"
    | "openingHours"
    | "fulfilmentTypes"
    | "collectionEnabled"
    | "shippingEnabled"
    | "providers"
    | "effectiveProvider"
    | "offerPayOnHandover"
    | "onlinePaymentsPlan"
    | "pausedAt"
>;

/**
 * The line under the location's name: where it is, for a place customers
 * visit (the first line of its address), or what it is for, for one with no
 * counter.
 */
export function locationSubtitle(
    store: Pick<StorefrontSettings, "kind" | "address">,
): string {
    if (store.kind === "ONLINE") return "No counter · stock for online orders";
    const first = store.address
        ?.split("\n")
        .map((l) => l.trim())
        .find(Boolean);
    return first
        ? `Customers visit · ${first}`
        : "Customers visit · no address yet";
}

/**
 * The ways it offers, as saved. An API from before B17's chips sends none,
 * so they are read from its two switches.
 */
export function savedWays(
    store: Pick<
        Store,
        "kind" | "fulfilmentTypes" | "collectionEnabled" | "shippingEnabled"
    >,
): StorefrontFulfilmentType[] {
    if (store.fulfilmentTypes) return [...store.fulfilmentTypes];
    return STOREFRONT_FULFILMENT_TYPES.filter((t) =>
        t === "PICKUP"
            ? store.collectionEnabled && store.kind === "SHOP"
            : t === "SHIPPING" && store.shippingEnabled,
    );
}

/**
 * Whether Pick-up can be offered on the website from here (UX-025, the
 * API's `pickupPlaceOf`): only from a place customers visit, with its
 * address, so a customer knows where to go.
 */
export function pickupHasPlace(
    store: Pick<StorefrontSettings, "kind" | "address">,
): boolean {
    return store.kind === "SHOP" && Boolean(store.address?.trim());
}

/** The ways the website's checkout really offers from here. */
export function websiteWays(store: Store): StorefrontFulfilmentType[] {
    return savedWays(store).filter(
        (t) => t !== "PICKUP" || pickupHasPlace(store),
    );
}

/** "Pick-up", "Local delivery and shipping", "Pick-up, local delivery and shipping". */
export function waysWords(ways: readonly StorefrontFulfilmentType[]): string {
    const words = ways.map((t, i) =>
        i === 0 ? FULFILMENT_LABEL[t] : FULFILMENT_LABEL[t].toLowerCase(),
    );
    if (words.length <= 1) return words.join("");
    return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

export interface ReadyItem {
    key: string;
    done: boolean;
    label: string;
    /**
     * The one thing that does it: a page elsewhere, or `#id` for a field or
     * part of this page. Absent when nothing here can do it.
     */
    action?: {
        label: string;
        href: string;
        inPage: boolean;
        /** The tab it is on, and the field to put the keyboard on there. */
        tab?: LocationTab;
        focus?: string;
    };
    /** Where a done step can be seen: the live shop, in a new tab. */
    view?: { label: string; href: string };
}

export interface LocationReadiness {
    heading: string;
    /**
     * Where it sells, when the items don't say it (DEC-069): "Sells in
     * person only" for a counter the online shop doesn't sell from. Absent
     * when the website couldn't be read.
     */
    note?: string;
    /** Done first (what's already behind the owner), then what's left. */
    items: ReadyItem[];
    done: number;
    total: number;
}

const inPage = (label: string, tab: LocationTab, focus?: string) => ({
    label,
    href: `?${LOCATION_TAB_PARAM}=${tab}`,
    inPage: true,
    tab,
    focus,
});
const away = (label: string, href: string) => ({
    label,
    href,
    inPage: false,
});

/** Whether the website's online shop sells from this location. */
export function sellsOnlineHere(
    storeId: string,
    site: SiteSelling | null | undefined,
): boolean {
    return site?.sellsFrom?.storefront?.id === storeId;
}

/**
 * "Ready for online orders" for a location with no counter, or one the
 * online shop sells from; "Ready for the counter" for a place customers
 * visit that sells in person only. Each item is a true fact the page holds:
 *
 * - the counter: its address (on the receipt, and where pick-up is
 *   collected) and its opening hours (saved, not the starting week);
 * - online: a way the website's checkout offers from here, a way to pay
 *   (the API's checkout rule: a provider in use, paying on handover, or a
 *   plan that only takes payment in person), and the online shop selling
 *   from here and live. A website the page couldn't read, or a shop not
 *   open to the business, adds no item rather than a guess.
 * - paused, or not taking orders on the plan (#800): a step left, since
 *   nothing can be paid for here until it is back.
 */
export function locationReadiness(
    store: Store,
    site: SiteSelling | null | undefined,
    options: { notTakingOrders?: boolean } = {},
): LocationReadiness {
    const counter = store.kind === "SHOP";
    const online = !counter || sellsOnlineHere(store.id, site);
    const items: ReadyItem[] = [];

    if (options.notTakingOrders) {
        items.push({
            key: "plan",
            done: false,
            label: "Not taking orders on your plan",
            action: away("See Plan and billing", PLAN_AND_BILLING_HREF),
        });
    }
    if (store.pausedAt) {
        items.push({
            key: "paused",
            done: false,
            label: "Paused: customers can't pay here",
            action: inPage("Resume", "pause-or-close"),
        });
    }

    if (counter) {
        const address = Boolean(store.address?.trim());
        items.push(
            address
                ? { key: "address", done: true, label: "Address on receipts" }
                : {
                      key: "address",
                      done: false,
                      label: "Add the address customers come to",
                      action: inPage(
                          "Add address",
                          "the-place",
                          ADDRESS_FIELD_ID,
                      ),
                  },
            store.openingHours
                ? { key: "hours", done: true, label: "Opening hours set" }
                : {
                      key: "hours",
                      done: false,
                      label: "Save its opening hours",
                      action: inPage("Set hours", "the-place", HOURS_FIELD_ID),
                  },
        );
    }

    if (online) {
        const ways = websiteWays(store);
        items.push(
            ways.length > 0
                ? { key: "ways", done: true, label: `${waysWords(ways)} on` }
                : {
                      key: "ways",
                      done: false,
                      label: counter
                          ? "Offer a way for orders to leave"
                          : "Offer local delivery or shipping",
                      action: inPage("Set up delivery", "delivery"),
                  },
            paymentsItem(store),
        );
        const listing = listingItem(store.id, site);
        if (listing) items.push(listing);
    }

    const done = items.filter((i) => i.done);
    const left = items.filter((i) => !i.done);
    return {
        heading:
            counter && online
                ? "Ready for the counter and online orders"
                : counter
                  ? "Ready for the counter"
                  : "Ready for online orders",
        ...(counter && !online && site !== undefined
            ? { note: "Sells in person only" }
            : {}),
        items: [...done, ...left],
        done: done.length,
        total: items.length,
    };
}

function paymentsItem(store: Store): ReadyItem {
    if (store.effectiveProvider) {
        return {
            key: "payments",
            done: true,
            label: `Takes payments through ${providerName(store.effectiveProvider)}`,
        };
    }
    if (store.onlinePaymentsPlan === false || store.offerPayOnHandover) {
        return {
            key: "payments",
            done: true,
            label: "Customers pay when they collect or on delivery",
        };
    }
    const connected = store.providers.some((p) => p.status === "CONNECTED");
    return connected
        ? {
              key: "payments",
              done: false,
              label: "Choose which provider checkout uses",
              action: inPage("Choose", "payments"),
          }
        : {
              key: "payments",
              done: false,
              label: "Take payments online",
              action: away("Connect a provider", PROVIDERS_HREF),
          };
}

function listingItem(
    storeId: string,
    site: SiteSelling | null | undefined,
): ReadyItem | null {
    // Couldn't read the website: say nothing rather than guess.
    if (site === undefined) return null;
    if (site === null) {
        return {
            key: "listed",
            done: false,
            label: "Sell on your website",
            action: away("Make your website", "/sites/new"),
        };
    }
    const sellsFrom = site.sellsFrom;
    // The shop isn't open to this business yet: nothing the owner can do.
    if (!sellsFrom) return null;
    const settings = `/sites/${encodeURIComponent(site.siteId)}/settings#${SELLS_FROM_ANCHOR}`;
    if (sellsFrom.storefront?.id !== storeId) {
        return {
            key: "listed",
            done: false,
            label: sellsFrom.storefront
                ? `Your online shop sells from ${sellsFrom.storefront.name}`
                : "List it in your online shop",
            action: away(
                sellsFrom.storefront
                    ? "Sell from here instead"
                    : "Turn on your shop",
                settings,
            ),
        };
    }
    const products =
        sellsFrom.choices.find((c) => c.id === storeId)?.products ?? 0;
    if (products === 0) {
        return {
            key: "listed",
            done: false,
            label: "Put products in your online shop",
            action: away("Go to Products", "/commerce/products"),
        };
    }
    if (!site.origin) {
        return {
            key: "listed",
            done: false,
            label: "Publish your website",
            action: away(
                "Open your website",
                `/sites/${encodeURIComponent(site.siteId)}`,
            ),
        };
    }
    return {
        key: "listed",
        done: true,
        label: "Listed in your online shop",
        view: { label: "Your online shop", href: `${site.origin}/shop` },
    };
}
