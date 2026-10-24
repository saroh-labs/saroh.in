/**
 * Where the business has stopped taking orders on this site for now
 * (#800: a website or location past its plan's limit after a move to a
 * lower plan). Said plainly, in the site's palette, with nothing to click
 * that cannot work: no bag, no "Ask about ordering". Names no plan, limit
 * or price; the business hears why from its own notice.
 *
 * Over the shop it is a band on the page's own column, above the heading.
 * On a product page it stands where the button would: a note with a rule
 * in the accent down its side, in the body colour, so it reads as the
 * answer to "how do I buy this" and not as small print.
 *
 * On a demo business (DEC-188) the same note says it is a demo instead,
 * where Book, Add to bag and Pay would be.
 */
export const NOT_TAKING_ORDERS_TEXT =
    "This business isn't taking orders right now.";

/** What a demo business's pages say where Book and Pay would be. */
export const DEMO_TEXT =
    "This is a demo. Booking, paying and sending things are turned off.";

export function NotTakingOrders({
    banner = false,
    demo = false,
}: {
    banner?: boolean;
    demo?: boolean;
}) {
    const text = demo ? DEMO_TEXT : NOT_TAKING_ORDERS_TEXT;
    if (banner) {
        return (
            <div className="bg-site-bg max-w-site-content mx-auto w-full px-5 pt-6 sm:px-[var(--site-page-margin)]">
                <p
                    role="status"
                    className="border-site-border bg-site-surface text-site-fg rounded-[calc(var(--site-radius,2px)+10px)] border px-4 py-3 text-[15px] font-medium"
                >
                    {text}
                </p>
            </div>
        );
    }
    return (
        <p
            role="status"
            className="border-site-accent text-site-fg border-l-2 py-1 pl-3.5 text-[15px] font-medium leading-normal"
        >
            {text}
        </p>
    );
}
