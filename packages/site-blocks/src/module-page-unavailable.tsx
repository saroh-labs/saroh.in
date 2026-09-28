import Link from "next/link";

/**
 * A module page's address while its module is off (G15): Book with
 * Appointments switched off, Shop with Commerce off, and so on.
 *
 * Said in words with a way home, never a 404, so a link someone shared
 * still lands somewhere (Key Technical Decisions, plan 007). It names no
 * module: the visitor doesn't need to know how the business is set up, and
 * one that isn't rolled out is never named at all (DEC-057).
 *
 * Drawn in the site's own palette, like `BookingUnavailable` and
 * `ShopUnavailable`, which stay for a read that failed; this one is for a
 * page the business has taken off its site.
 */
export function ModulePageUnavailable({
    business,
    homeHref = "/",
}: {
    business: string;
    /** Where "Go to the home page" leads; a preview passes its own. */
    homeHref?: string;
}) {
    return (
        <div className="bg-site-bg mx-auto max-w-[1060px] px-5 py-16">
            <div className="border-site-border bg-site-surface max-w-xl rounded-[14px] border p-5">
                <h1 className="font-site-heading text-site-fg text-[26px] font-semibold tracking-[-0.03em]">
                    This isn&apos;t available right now
                </h1>
                <p className="text-site-body mt-2 text-sm">
                    {business} isn&apos;t offering this on their site at the
                    moment.
                </p>
                <Link
                    href={homeHref}
                    className="bg-site-accent text-site-accent-fg focus-visible:ring-site-accent focus-visible:ring-offset-site-surface coarse:min-h-11 mt-4 inline-flex h-10 cursor-pointer items-center rounded-[var(--site-radius)] px-4 text-sm font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-80"
                >
                    Go to the home page
                </Link>
            </div>
        </div>
    );
}
