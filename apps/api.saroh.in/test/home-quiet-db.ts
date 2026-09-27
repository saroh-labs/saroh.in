/**
 * For Home's specs that build the whole service on a mocked Prisma: gives
 * the header's reads (F6, `home-last-day.ts`) a quiet answer — a business
 * with nothing new in the last 24 hours — wherever the spec's own mock
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
};

export function quietLastDay<T extends object>(db: T): T {
    const tables = db as Record<string, Table | undefined>;
    for (const [name, methods] of Object.entries(QUIET)) {
        const table = (tables[name] ??= {});
        for (const [method, value] of Object.entries(methods)) {
            table[method] ??= () => Promise.resolve(value);
        }
    }
    return db;
}
