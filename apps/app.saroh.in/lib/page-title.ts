import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

/**
 * What a browser tab says in the workspace (12 Oct 2026).
 *
 * `‹Page› · ‹Business› · Saroh` inside a business, `‹Page› · Saroh` before
 * one is chosen. People belong to several businesses and keep them open
 * side by side, so the tab says whose page it is. The unread count goes in
 * front of whatever this makes (`useUnreadTitle`): "(3) Orders · Rye & Co.
 * · Saroh".
 *
 * A page writes only its own name (`metadata = { title: "Orders" }`); the
 * shell's layout adds the rest through {@link titleTemplate}. A record's
 * page names the record with {@link recordTitle}.
 *
 * **Never a person.** A title shows in the tab strip on a shared screen, in
 * history and in bookmarks, and is sent nowhere the page isn't. So a record
 * is named by its reference (`Order #1042`, `Invoice INV-0042`) or by the
 * business's own nouns (a product, a service, a plan), and a customer, a
 * contact, a lead or a subscription stays "Customer", "Contact", "Lead",
 * "Subscription": no name, address, phone number or amount.
 */

/** A name this long is cut, so the business and "Saroh" still fit. */
const LONGEST = 60;

/** One line, trimmed, and cut with an ellipsis past {@link LONGEST}. */
export function clip(name: string): string {
    const line = name.replace(/\s+/g, " ").trim();
    return line.length > LONGEST
        ? `${line.slice(0, LONGEST - 1).trimEnd()}…`
        : line;
}

/**
 * The shell's title for the active business: the template its pages are
 * written into, and what a page with no title of its own would show.
 * `null` (no business yet, or its name couldn't be read) leaves the root
 * layout's "%s · Saroh".
 */
export function titleTemplate(
    business: string | null | undefined,
): { default: string; template: string } | null {
    const name = business ? clip(business) : "";
    if (!name) return null;
    // Next fills every "%s" in a template with the page's title, so one in a
    // business's own name ("50%sale") is kept from reading as a slot.
    const safe = name.replace(/%s/g, "%⁠s");
    return { default: name, template: `%s · ${safe} · Saroh` };
}

/** `notFound()` or `forbidden()`, thrown by a read (`getJson`). */
function isAccessAnswer(error: unknown): boolean {
    const digest = (error as { digest?: unknown } | null)?.digest;
    return (
        typeof digest === "string" &&
        digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
    );
}

/**
 * A record's page title from the read the page itself makes.
 *
 * Pass the page's own read wrapped in React's `cache`, so the title and the
 * page share one request to the API:
 *
 * ```ts
 * const readOrder = cache((id: string) => getOrderRead(id));
 * export async function generateMetadata({ params }) {
 *     const { orderId } = await params;
 *     return recordTitle(() => readOrder(orderId), (o) => `Order #${o.orderId}`, "Order");
 * }
 * ```
 *
 * It never decides what the page shows. A record that isn't there, a role
 * the API refuses or an API that didn't answer gives `fallback`, and the
 * page then says which of those it was, in its own words (its not-found, its
 * locked card, its error boundary). That is why a refusal is swallowed here
 * and nowhere else: `getJson` answers a 403 by throwing `forbidden()`, and
 * letting that out of the title would replace a page's own locked card with
 * the general one.
 */
export async function recordTitle<T>(
    read: () => Promise<T | null | undefined>,
    name: (record: T) => string | null | undefined,
    fallback: string,
    /** The section it sits in, put after it: "Website" → "‹post› · Website". */
    section?: string,
): Promise<Metadata> {
    const titled = (own: string) => ({
        title: section ? `${own} · ${section}` : own,
    });
    try {
        const record = await read();
        const named = record ? name(record) : null;
        return titled((named ? clip(named) : "") || fallback);
    } catch (error) {
        // Next's own signals (a redirect, "this page is dynamic") go on up.
        if (!isAccessAnswer(error)) unstable_rethrow(error);
        return titled(fallback);
    }
}
