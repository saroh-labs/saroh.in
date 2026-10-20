/**
 * One source of the Insights page: what came back, a role that may not
 * read it, or a read that failed — never an empty answer in place of a
 * failed one.
 *
 * The twelve-week takings read it once described (`GET analytics/takings`,
 * DEC-075) is retired: Money reads `GET analytics/money` for the page's
 * period (DEC-171, #1093, `lib/insights/reads.ts`).
 */
export type SourceRead<T> =
    { status: "ok"; data: T } | { status: "denied" } | { status: "failed" };
