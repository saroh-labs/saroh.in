import { CITIES, COMPANY_SUFFIXES, FIRST_NAMES, LAST_NAMES } from "./data";
import type { Rng } from "./random";

/**
 * Generated people and the clock they live on.
 *
 * Every showcase business is in Bengaluru, so every wall-clock time here is
 * Asia/Kolkata. India has had no daylight saving since 1945, so the offset is
 * a constant and no zone library is needed to turn "Tuesday 7am" into UTC.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** The UTC instant of `minuteOfDay` on the Kolkata calendar day `dayOffset` from today. */
export function istAt(now: Date, dayOffset: number, minuteOfDay: number): Date {
    const local = new Date(now.getTime() + IST_OFFSET_MS);
    const midnight = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + dayOffset,
    );
    return new Date(midnight - IST_OFFSET_MS + minuteOfDay * 60_000);
}

/** 0 = Sunday … 6 = Saturday, on the Kolkata calendar — the schema's convention. */
export function istWeekday(now: Date, dayOffset: number): number {
    return new Date(
        istAt(now, dayOffset, 12 * 60).getTime() + IST_OFFSET_MS,
    ).getUTCDay();
}

/** "06:30" → 390 */
export const minuteOf = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};

/** Whole days between two instants, fractional. */
export const daysBetween = (from: Date, to: Date) =>
    (to.getTime() - from.getTime()) / DAY_MS;

export const addMinutes = (when: Date, minutes: number) =>
    new Date(when.getTime() + minutes * 60_000);

export const earliest = (...dates: Date[]) =>
    new Date(Math.min(...dates.map((d) => d.getTime())));

export interface Person {
    first: string;
    last: string;
    email: string;
    phone: string;
    company: string | null;
    city: { city: string; state: string; zip: string } | null;
}

const MOBILE_PREFIXES = ["98", "99", "97", "96", "90", "88", "70", "63"];

export const phoneNumber = (rng: Rng) =>
    `${rng.pick(MOBILE_PREFIXES)}${rng.int(100, 999)} ${rng.int(10000, 99999)}`;

const local = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * `count` people with distinct emails.
 *
 * `used` is shared with whatever already holds addresses in the same scope (a
 * store's customers, an organization's contacts), so a generated person never
 * collides with a base-seed row on a unique `(scope, email)` key. A repeat
 * name gets a number, as it would in anyone's inbox.
 */
export function makePeople(
    rng: Rng,
    count: number,
    used: Set<string>,
    options: {
        /** A fixed list to draw employers from, or generated trade names. */
        companies?: readonly string[] | "generated";
        /** Share of people who give a company at all. */
        companyShare?: number;
        cities?: boolean;
    } = {},
): Person[] {
    const people: Person[] = [];
    while (people.length < count) {
        const first = rng.pick(FIRST_NAMES);
        const last = rng.pick(LAST_NAMES);
        const base = `${local(first)}.${local(last)}`;
        let email = `${base}@example.com`;
        for (let n = 2; used.has(email); n++) email = `${base}${n}@example.com`;
        used.add(email);

        let company: string | null = null;
        if (options.companies && rng.chance(options.companyShare ?? 1)) {
            company =
                options.companies === "generated"
                    ? `${rng.pick(LAST_NAMES)} ${rng.pick(COMPANY_SUFFIXES)}`
                    : rng.pick(options.companies);
        }

        const city = options.cities
            ? rng.weighted(CITIES, (c) => c.weight)
            : null;

        people.push({
            first,
            last,
            email,
            phone: phoneNumber(rng),
            company,
            city: city
                ? { city: city.city, state: city.state, zip: city.zip }
                : null,
        });
    }
    return people;
}

/** A stable 32-bit hash, so each business and each concern gets its own stream. */
export function hashKey(...parts: string[]): number {
    let h = 2166136261;
    for (const ch of parts.join("/")) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
