import { HttpException, HttpStatus } from "@nestjs/common";

import { env } from "../../env";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/**
 * Changes to Google Calendar a person may make in an hour (M2, L9): a
 * Meet made, who may join, a booking handed to someone, moving bookings.
 * Per person, so one Member can't use up the business's hour.
 */
export const memberChanges: WindowLimiter = new SharedRateLimiter(
    "google-calendar-changes",
    Number(env.GOOGLE_CALENDAR_CHANGES_PER_HOUR) || 120,
    HOUR,
);

/**
 * And the business's across its people (L1, L9): each change is one, and
 * "move my upcoming bookings" one a booking it queues, since each sends a
 * Google invitation from Saroh's one Google project.
 */
export const businessChanges: WindowLimiter = new SharedRateLimiter(
    "google-calendar-business-changes",
    1000,
    HOUR,
);

/**
 * Moving one's upcoming bookings to their "bookings go to" calendar (L1):
 * each move invites every customer again, so a few a day per person.
 */
export const moves: WindowLimiter = new SharedRateLimiter(
    "google-calendar-moves",
    3,
    DAY,
);

/** Choosing which calendar bookings go to, a person (L1): each can be followed by a move. */
export const bookingsCalendarChoices: WindowLimiter = new SharedRateLimiter(
    "google-calendar-bookings-calendar",
    10,
    DAY,
);

/** Reading or choosing a Google account's calendars, a person (L4): each asks Google. */
export const calendarReads: WindowLimiter = new SharedRateLimiter(
    "google-calendar-reads",
    30,
    10 * 60_000,
);

/** One person's key, for the windows above: a person is a membership here. */
export const personKey = (ctx: { organizationId: string; userId: string }) =>
    `${ctx.organizationId}:${ctx.userId}`;

/** Take one hit of `limiter` for this person, or refuse (429) saying `message`. */
export async function takeOrRefuse(
    limiter: WindowLimiter,
    ctx: { organizationId: string; userId: string },
    message: string,
): Promise<void> {
    if (!(await limiter.take(personKey(ctx)))) throw tooMany(message);
}

/** One change of the person's hour and one of the business's, or refuse (429). */
export async function takeGoogleChange(
    ctx: { organizationId: string; userId: string },
    member: WindowLimiter = memberChanges,
): Promise<void> {
    await takeOrRefuse(
        member,
        ctx,
        "You've made a lot of Google Calendar changes this hour. Try again later.",
    );
    await takeBusinessChanges(ctx.organizationId, 1);
}

/** `hits` of the business's hour, a booking each for a move (L1), or refuse (429). */
export async function takeBusinessChanges(
    organizationId: string,
    hits: number,
): Promise<void> {
    // shortcut: one Redis call a hit; fine while moves are 3 a day a person, else an INCRBY.
    for (let i = 0; i < hits; i++) {
        if (!(await businessChanges.take(organizationId))) {
            throw tooMany(
                hits > 1
                    ? "That's more Google Calendar changes than your business can make this hour. Try again later."
                    : "Your business has made a lot of Google Calendar changes this hour. Try again later.",
            );
        }
    }
}

function tooMany(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}
