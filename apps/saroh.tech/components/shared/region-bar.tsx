import { site } from "@/site.config";

/**
 * "In India? Go to saroh.in", never a redirect. Every page carries it hidden;
 * the Worker shows it to visitors Cloudflare places in India and points both
 * this link and the footer's at the matching saroh.in page.
 */
export function RegionBar() {
    return (
        <aside
            data-region-bar
            hidden
            aria-label="Region"
            className="flex items-center justify-center gap-3 bg-ink py-1 pl-4 pr-1 text-sm text-paper md:px-mk-gutter"
        >
            <span>
                <span className="hidden md:inline">
                    In India? Saroh for India has ₹ prices, GST invoices and
                    UPI.{" "}
                </span>
                <span className="md:hidden">In India? </span>
                <a
                    data-region-link
                    href={site.india}
                    className="inline-block py-3 font-semibold underline underline-offset-2 md:py-0"
                >
                    Go to saroh.in{" "}
                    <span className="md:hidden">for ₹, GST and UPI.</span>
                    <span aria-hidden="true" className="hidden md:inline">
                        →
                    </span>
                </a>
            </span>
            {/* A real request: the Worker answers it, there is no page to route to. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
                href="/region/hide"
                aria-label="Hide this message"
                className="inline-flex size-11 shrink-0 items-center justify-center text-lg no-underline focus-visible:outline-paper"
            >
                <span aria-hidden="true">×</span>
            </a>
        </aside>
    );
}
