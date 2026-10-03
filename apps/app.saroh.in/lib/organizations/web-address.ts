import { useEffect, useRef, useState } from "react";

import { MAX_ADDRESS_LENGTH } from "./address";

/**
 * The business's web address (DEC-069, plan L4): the read Settings › Business
 * shows, the words it says, and the live check the Change dialog runs.
 *
 * The API is the authority on everything here — which address is the
 * business's, where customers go, what is free and what the owner may do
 * (`GET/PUT organizations/:id/web-address`, L2). This file only words its
 * answers; `web-address-service.ts` reads them, `web-address-actions.ts`
 * is what the dialog calls.
 */

/** A web address the business held before, while it is still held. */
export interface PreviousWebAddress {
    address: string;
    /** Until when it forwards to the site. Null: held, but never forwards. */
    redirectUntil: string | null;
    /** Until when nobody else can take it. */
    reservedUntil: string;
}

/** `GET organizations/:id/web-address`, as the API types it (KTD-8). */
export interface WebAddressView {
    /** The address: the site's subdomain, else the one reserved at setup. */
    address: string;
    /** Where customers go: the verified custom domain, else the address. */
    origin: string;
    /** `https://<address>.saroh.app`, which still works with a domain. */
    platformOrigin: string;
    /** The verified custom domain's hostname, or null. */
    customDomain: string | null;
    /** Each link only while that page is live; null otherwise. */
    links: { site: string | null; shop: string | null; book: string | null };
    /** Addresses still held for the business, soonest released first. */
    previous: PreviousWebAddress[];
    /** Whether changing is switched on for this business (the rollout). */
    changeAvailable: boolean;
    /** Whether this person may change it now: the owner, with it on. */
    canChange: boolean;
}

/**
 * The read as Settings gets it: `missing` is an API older than the endpoint
 * (404), or no business open.
 */
export type WebAddressRead =
    { ok: true; data: WebAddressView } | { ok: false; missing: boolean };

/** `GET …/web-address/availability?address=`. */
export interface WebAddressAvailability {
    address: string;
    ok: boolean;
    /** Why not, in the merchant's words. Null when ok. */
    reason: string | null;
    /** A free address like it, when this one is taken. */
    suggestion: string | null;
}

/**
 * What the owner types into the Change field: lowercase letters, digits and
 * hyphens, anything else dropped as they type. Unlike setup's preview
 * (`cleanAddressInput`), two hyphens in a row are kept, so the API can say
 * the rule in its own words rather than the field quietly rewriting it.
 */
export function typedAddress(value: string): string {
    return value
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, MAX_ADDRESS_LENGTH);
}

/** How long an old address forwards and stays held (the API's 90 days). */
export const ADDRESS_HOLD_DAYS = 90;

const DAY_MS = 86_400_000;

/** A host from an origin: `https://rye.saroh.app` → `rye.saroh.app`. */
export function hostOf(origin: string): string {
    try {
        return new URL(origin).host;
    } catch {
        return origin.replace(/^https?:\/\//, "");
    }
}

/**
 * What follows the address on the platform: `.saroh.app`, or
 * `.saroh.app.localhost` in development — read from the API's
 * `platformOrigin`, never written into the app.
 */
export function suffixOf(
    view: Pick<WebAddressView, "address" | "platformOrigin">,
): string {
    const host = hostOf(view.platformOrigin);
    return host.startsWith(`${view.address}.`)
        ? host.slice(view.address.length)
        : ".saroh.app";
}

/** `rye` → `rye.saroh.app`, on this platform's suffix. */
export function addressHost(address: string, suffix: string): string {
    return `${address}${suffix}`;
}

/**
 * A day in the business's time zone: "28 Dec", with the year when it isn't
 * this one there. A hold ends at an instant; which day that is depends on
 * where the business keeps time, not on the browser or the server.
 */
export function holdDate(
    value: string | Date,
    zone: string,
    now: Date = new Date(),
): string {
    const at = new Date(value);
    const year = (d: Date) =>
        new Intl.DateTimeFormat("en-GB", {
            year: "numeric",
            timeZone: zone,
        }).format(d);
    return at.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        ...(year(at) === year(now) ? {} : { year: "numeric" }),
        timeZone: zone,
    });
}

/** When a hold made now would end: the API's 90 days from now. */
export function holdEndsFrom(now: Date = new Date()): Date {
    return new Date(now.getTime() + ADDRESS_HOLD_DAYS * DAY_MS);
}

/**
 * What an old address does while it is held: forwards to the site, or,
 * when nothing was ever served there, is only kept for the business.
 */
export function previousLine(
    held: PreviousWebAddress,
    suffix: string,
    zone: string,
    now: Date = new Date(),
): string {
    const host = addressHost(held.address, suffix);
    return held.redirectUntil
        ? `${host} forwards here until ${holdDate(held.redirectUntil, zone, now)}`
        : `${host} is kept for you until ${holdDate(held.reservedUntil, zone, now)}`;
}

/**
 * What changing the address does, said before the button (L4): the old
 * address forwards (or is only kept, with no live site to forward to) for
 * 90 days and is then released; shared links keep working until then;
 * customers signed in on the site sign in again, because their session
 * belongs to the old host.
 */
export function consequences(
    view: Pick<WebAddressView, "address" | "platformOrigin" | "links">,
    zone: string,
    now: Date = new Date(),
): string[] {
    const old = addressHost(view.address, suffixOf(view));
    const until = holdDate(holdEndsFrom(now), zone, now);
    if (!view.links.site) {
        return [`${old} stays yours until ${until}, then it's released`];
    }
    return [
        `${old} forwards here until ${until}, then it's released`,
        "Links you've shared keep working until then",
        "Customers signed in on your site will need to sign in again",
    ];
}

/** The live check's answer, as the field shows it. */
export type AddressCheck =
    | { state: "idle" }
    | { state: "checking" }
    | { state: "unchecked" }
    | { state: "answered"; answer: WebAddressAvailability };

/**
 * Ask whether `address` is free as the owner types, debounced; only the
 * newest answer may land, so a slow answer for "rye" arriving after a fast
 * one for "rye-bakery" never says the wrong address is taken. The answer is
 * "checking" whenever it is about another address than the field's, so a
 * stale one is never shown against a new address.
 */
export function useAddressCheck(
    address: string,
    ask: (address: string) => Promise<WebAddressAvailability | null>,
    opts: { skip?: boolean; delay?: number } = {},
): AddressCheck {
    const { skip = false, delay = 350 } = opts;
    const [answer, setAnswer] = useState<
        WebAddressAvailability | { address: string; unchecked: true } | null
    >(null);
    const asked = useRef(0);
    useEffect(() => {
        if (skip || address === "") return;
        const n = ++asked.current;
        const timer = setTimeout(() => {
            void ask(address).then((next) => {
                if (n !== asked.current) return;
                // Couldn't ask: say nothing rather than guess; Save asks
                // the API again either way.
                setAnswer(next ?? { address, unchecked: true });
            });
        }, delay);
        return () => clearTimeout(timer);
    }, [address, ask, skip, delay]);

    if (skip || address === "") return { state: "idle" };
    if (answer?.address !== address) return { state: "checking" };
    if ("unchecked" in answer) return { state: "unchecked" };
    return { state: "answered", answer };
}
