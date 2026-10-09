/**
 * Where the business has stopped taking orders on this site for now
 * (#800: a website or location past its plan's limit after a move to a
 * lower plan). Said plainly, in the site's palette, with nothing to click
 * that cannot work: no bag, no "Ask about ordering". Names no plan, limit
 * or price; the business hears why from its own notice.
 */
export const NOT_TAKING_ORDERS_TEXT =
    "This business isn't taking orders right now.";

export function NotTakingOrders({ banner = false }: { banner?: boolean }) {
    if (banner) {
        return (
            <div className="bg-site-bg mx-auto max-w-[1060px] px-5 pt-6">
                <p
                    role="status"
                    className="border-site-border bg-site-surface text-site-body rounded-[14px] border px-4 py-3 text-sm"
                >
                    {NOT_TAKING_ORDERS_TEXT}
                </p>
            </div>
        );
    }
    return (
        <p role="status" className="text-site-muted text-sm">
            {NOT_TAKING_ORDERS_TEXT}
        </p>
    );
}
