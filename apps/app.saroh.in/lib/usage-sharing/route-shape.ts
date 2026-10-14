/**
 * A workspace address as its route's shape (DEC-160): every segment that
 * came from the address as a parameter is replaced by the parameter's name,
 * so `/commerce/orders/cmf3k2x…` is `/commerce/orders/[orderId]`. It is
 * what a page visit says: no record's id, no invitation token, no query
 * string.
 *
 * Next knows which segments are parameters (`useParams`), which a guess
 * from the look of a segment does not: an id like `seed_order_7`, or a
 * token, reads like a word. A segment that still looks like an id after
 * that (a catch-all nobody named, a number) is hidden too.
 */
type Params = Record<string, string | string[] | undefined> | null;

const decoded = (segment: string) => {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
};

/** A segment no screen is named: a number, an id, anything long. */
const looksLikeAnId = (segment: string) =>
    segment.length > 32 || /\d/.test(segment) || /@|%40/i.test(segment);

export function routeShape(pathname: string | null, params: Params): string {
    const path = (pathname ?? "/").split(/[?#]/)[0] ?? "/";
    // Each parameter's values, as the segments they came from.
    const left: [name: string, value: string][] = [];
    for (const [name, value] of Object.entries(params ?? {}))
        for (const one of Array.isArray(value) ? value : [value])
            if (typeof one === "string" && one) left.push([name, decoded(one)]);
    const shape = path.split("/").map((segment) => {
        if (!segment) return segment;
        const at = left.findIndex(([, value]) => value === decoded(segment));
        if (at >= 0) {
            const [[name]] = left.splice(at, 1) as [[string, string]];
            return `[${name}]`;
        }
        return looksLikeAnId(segment) ? "[id]" : segment;
    });
    return shape.join("/").slice(0, 200) || "/";
}
