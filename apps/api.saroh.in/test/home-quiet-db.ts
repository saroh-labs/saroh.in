/**
 * For Home's specs that build the whole service on a mocked Prisma: gives
 * the header's reads (F6, `home-last-day.ts`) and the paused-subscriptions
 * source (D8, `home-pause-sources.ts`) a quiet answer — a business with
 * nothing new in the last 24 hours and no pause waiting — wherever the spec's own mock
 * doesn't answer them, so what each spec asserts reads as it did.
 *
 * In `test/`, which the build leaves out as it does the specs.
 */
type Table = Record<string, unknown>;

const QUIET: Record<string, Table> = {
    order: { count: 0, findFirst: null },
    booking: { count: 0, findFirst: null },
    invoice: { findFirst: null, groupBy: [] },
    productReview: { count: 0 },
    organizationModule: { findFirst: null },
    customerSubscription: { count: 0, findMany: [] },
};

type Rows = (args?: unknown) => Promise<{ id: string }[]>;
type Count = (args?: unknown) => Promise<number>;

export function quietLastDay<T extends object>(db: T): T {
    const tables = db as Record<string, Table | undefined>;
    for (const [name, methods] of Object.entries(QUIET)) {
        const table = (tables[name] ??= {});
        for (const [method, value] of Object.entries(methods)) {
            table[method] ??= () => Promise.resolve(value);
        }
    }
    // Open orders are picked in one raw read (`home-open-orders.ts`, H-1):
    // answer it from the spec's own order mocks — its rows, oldest first as
    // given, and its count — so a spec that mocks `order.findMany` and
    // `order.count` reads open orders as it did. Late is the row's own
    // (`openOrderWords`); the raw read's lateness is covered against a real
    // Postgres (`home.open-orders.db.spec.ts`).
    const client = db as Record<string, unknown>;
    const order = tables.order as { findMany?: Rows; count?: Count };
    client.$queryRaw ??= async () => {
        const rows = (await order.findMany?.({})) ?? [];
        const total = (await order.count?.({})) ?? rows.length;
        return rows
            .slice(0, 5)
            .map((r) => ({ id: r.id, late: false, total, lates: 0 }));
    };
    return db;
}
