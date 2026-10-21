import type { prisma } from "@saroh/database";

import type { UnpaidBillsRead } from "../analytics/unpaid-bills";

import { readGoing } from "./home-going";
import type {
    HomeAction,
    HomeGoing,
    HomeInput,
    HomeMoneyTotal,
    HomeTileMoneyIn,
    HomeUnavailable,
} from "./home-model";
import { holds } from "./home-model";
import { readMoneyToday } from "./home-money-today";
import { readAwaitingPayment } from "./home-pending-bookings";
import { stockLow } from "./home-site-stock-sources";
import type { HomeNarrow } from "./home-staff";
import type { TodayScope } from "./home-today";
import type { WeekScope } from "./home-week";

/**
 * The sources Home A adds (DEC-171, Home plan U1), read beside today's:
 * bookings awaiting payment, products running low, money in today, and
 * how it's going. Each through the service's own guard, so one failing is
 * named in `unavailable` and the rest still return. Kept out of
 * `home.service.ts` so that file doesn't grow past reading.
 */

/** The service's guard: read one source, naming it if it fails. */
export type Guard = <T>(
    source: HomeUnavailable,
    read: () => Promise<T>,
    fallback: T,
) => Promise<T>;

export interface TodayFirstReads {
    awaiting: (HomeAction & { totals: HomeMoneyTotal[] | null }) | null;
    low: HomeAction | null;
    moneyIn: HomeTileMoneyIn | null;
    going: HomeGoing | null;
}

export const TODAY_FIRST_SOURCES = {
    AWAITING: { moduleKey: "APPOINTMENTS", label: "Bookings awaiting payment" },
    LOW_STOCK: { moduleKey: "COMMERCE", label: "Low stock" },
    MONEY_IN: { moduleKey: "PAYMENTS", label: "Money in today" },
    GOING: { moduleKey: "HOME", label: "How it's going" },
} as const satisfies Record<string, HomeUnavailable>;

export function readTodayFirst(
    db: typeof prisma,
    guard: Guard,
    ctx: {
        input: HomeInput;
        available: ReadonlySet<string>;
        now: Date;
        zone: string;
        narrow: HomeNarrow;
        today: TodayScope | null;
        week: WeekScope | null;
        /** The build's one read of the unpaid bills (review #16). */
        unpaid?: UnpaidBillsRead;
    },
): Promise<
    [
        TodayFirstReads["awaiting"],
        HomeAction | null,
        HomeTileMoneyIn | null,
        HomeGoing | null,
    ]
> {
    const { input, available, now, zone, narrow } = ctx;
    const clock = { now, zone };
    const skip = <T>(value: T): Promise<T> => Promise.resolve(value);
    const money = holds(input, "payment:read");
    const week = ctx.week;
    return Promise.all([
        // A booking awaiting payment is on the diary: whoever reads it.
        ctx.today?.bookings
            ? guard(
                  TODAY_FIRST_SOURCES.AWAITING,
                  () => readAwaitingPayment(db, input, clock, narrow),
                  null,
              )
            : skip(null),
        // Products running low (A14), for whoever reads the stores' stock.
        available.has("COMMERCE") && holds(input, "store:read")
            ? guard(
                  TODAY_FIRST_SOURCES.LOW_STOCK,
                  () =>
                      stockLow(
                          db,
                          input.organizationId,
                          clock,
                          narrow.storeIds,
                      ),
                  null,
              )
            : skip(null),
        // Money in today: `payment:read`'s alone, as This week's takings.
        available.has("PAYMENTS") && money
            ? guard(
                  TODAY_FIRST_SOURCES.MONEY_IN,
                  () =>
                      readMoneyToday(db, input.organizationId, clock, {
                          calendar: !holds(input, "invoice:read"),
                      }),
                  null,
              )
            : skip(null),
        // How it's going: each figure for whoever holds its read.
        week
            ? guard(
                  TODAY_FIRST_SOURCES.GOING,
                  () =>
                      readGoing(db, input.organizationId, week, clock, {
                          money,
                          storeIds: narrow.storeIds,
                          unpaid: ctx.unpaid,
                      }),
                  null,
              )
            : skip(null),
    ]);
}
