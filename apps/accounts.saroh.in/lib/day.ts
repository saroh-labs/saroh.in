import { editionProfile } from "@saroh/edition";

import { env } from "@/env";

const { numberLocale, defaultZone } = editionProfile(env.NEXT_PUBLIC_EDITION);

/**
 * The one day formatter in accounts (DEC-195's "one day formatter",
 * DEC-199): a day in the edition's own zone and way of writing it (India's
 * where Saroh bills; UTC on Global), never the browser's locale or a time of
 * day. "21 Nov", or "21 Nov 2026" with the year.
 */
export function day(at: string | Date, withYear = false): string {
    return new Date(at).toLocaleDateString(numberLocale, {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
        timeZone: defaultZone,
    });
}
