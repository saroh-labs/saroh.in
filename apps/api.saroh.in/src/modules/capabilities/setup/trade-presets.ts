/**
 * Trade starters (#1193, DEC-189): what turning Bookings on writes for a
 * business that picked its trade, in place of the one first service it would
 * otherwise type. Owners edit a ready setup rather than start from empty.
 *
 * Every service here is a sample: written with `isSample` and hidden from
 * the booking page until the owner keeps or edits it. The prices are made-up
 * sample prices for the merchant's own list (taken from the Gulmohar and
 * Pulse demo businesses), in minor units of the business's currency — not
 * anything Saroh charges.
 *
 * A gym's classes are services with more than one place (U19's rule), so a
 * class is a sample service like any other; no course or pack is written.
 */

/** The trades with a starter. "Something else" is no trade at all. */
export const TRADES = ["SALON", "GYM"] as const;
export type Trade = (typeof TRADES)[number];

export interface SampleService {
    name: string;
    description: string;
    durationMinutes: number;
    /** Minor units; null when it is free (a trial). */
    priceCents: number | null;
    /** Places per booking: more than one is a class. */
    capacity: number;
}

/** One weekly window, as the setup sheet's hours are sent. */
export interface PresetHours {
    /** 0 = Sunday … 6 = Saturday. */
    weekday: number;
    open: string;
    close: string;
}

export interface TradePreset {
    services: readonly SampleService[];
    /** The hours used when the setup sends none of its own. */
    hours: readonly PresetHours[];
}

const everyDay = (open: string, close: string): PresetHours[] =>
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open, close }));

const one = (
    name: string,
    description: string,
    durationMinutes: number,
    priceCents: number | null,
    capacity = 1,
): SampleService => ({
    name,
    description,
    durationMinutes,
    priceCents,
    capacity,
});

export const TRADE_PRESETS: Record<Trade, TradePreset> = {
    SALON: {
        services: [
            one(
                "Women's haircut & finish",
                "A consultation at the mirror, wash, cut and a simple blow-dry finish.",
                60,
                120_000,
            ),
            one(
                "Men's haircut",
                "Scissor or clipper cut, wash and styling.",
                30,
                45_000,
            ),
            one(
                "Beard trim & shape",
                "Line-up, trim and a hot towel.",
                30,
                25_000,
            ),
            one(
                "Blow-dry",
                "Wash and a smooth or bouncy blow-dry.",
                45,
                80_000,
            ),
            one(
                "Hydrating facial",
                "Cleanse, exfoliate, mask and massage for dry or tired skin.",
                60,
                250_000,
            ),
            one(
                "Classic manicure",
                "Shape, cuticle care, hand massage and polish.",
                45,
                90_000,
            ),
        ],
        hours: everyDay("10:00", "20:00"),
    },
    GYM: {
        services: [
            one(
                "Personal training",
                "One hour, one coach, a plan written for you.",
                60,
                120_000,
            ),
            one(
                "Free trial session",
                "Thirty minutes with a coach: a tour, a short assessment and which plan fits.",
                30,
                null,
            ),
            one(
                "Fitness assessment",
                "Posture, mobility, strength tests and body composition, written up with a plan.",
                45,
                80_000,
            ),
            one(
                "HIIT class",
                "Forty-five minutes of intervals in a small group.",
                45,
                50_000,
                12,
            ),
            one(
                "Yoga flow",
                "A steady vinyasa class for mobility and recovery. Mats provided.",
                60,
                40_000,
                15,
            ),
            one(
                "Strength foundations",
                "Squat, hinge, push and pull, taught properly in a small group.",
                60,
                60_000,
                10,
            ),
        ],
        hours: [
            ...[1, 2, 3, 4, 5, 6].map((weekday) => ({
                weekday,
                open: "06:00",
                close: "22:00",
            })),
            { weekday: 0, open: "07:00", close: "12:00" },
        ],
    },
};
