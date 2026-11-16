import type { SiteLook } from "../kit/site-drawing";

import { AddressBar, Facts, OkChip, SiteTop, splitHost } from "./panels";

/**
 * /features' first-screen drawing (board HWDesk): the example's site, live
 * at its address, and, where the example has one, a paid order sliding up
 * over it with where the money went and what Saroh holds. Words and facts
 * come from the page and its world.
 */
export function HeroVisual({
    label,
    look,
    site,
    live,
    name,
    nav,
    line,
    order,
}: {
    label: string;
    look: SiteLook;
    site: string;
    live: string;
    name: string;
    nav: readonly string[];
    line: string;
    order?: {
        id: string;
        paid: string;
        rows: readonly { label: string; value: string; strong?: boolean }[];
    };
}) {
    return (
        <figure
            aria-label={label}
            className="relative m-0 pb-6 min-[760px]:pb-10 min-[760px]:pr-[90px]"
        >
            <div className="overflow-hidden rounded-mk-card bg-card shadow-mk-panel">
                <div className="p-3.5">
                    <AddressBar {...splitHost(site)} state={live} />
                </div>
                <SiteTop look={look} name={name} nav={nav} line={line} />
            </div>
            {order ? (
                <div className="relative -mt-16 ml-auto w-[min(300px,85%)] overflow-hidden rounded-mk-card bg-card shadow-mk-hero min-[760px]:absolute min-[760px]:bottom-0 min-[760px]:right-0 min-[760px]:mt-0">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <b className="font-mono text-[14px] font-semibold">
                            {order.id}
                        </b>
                        <OkChip>{order.paid}</OkChip>
                    </div>
                    <Facts rows={order.rows} />
                </div>
            ) : null}
        </figure>
    );
}
