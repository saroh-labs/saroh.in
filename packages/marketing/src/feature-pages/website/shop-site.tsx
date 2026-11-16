import { CalendarDays, Clock, ShoppingBag } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../cn";
import type { SiteLook } from "../../kit/site-drawing";
import { siteVars } from "../../kit/site-drawing";

import { Photo, photoFor } from "../reach/photo";

/** The words a merchant's site drawing shows; every one from the world. */
export interface ShopSiteWords {
    name: string;
    address: string;
    nav: readonly string[];
    order: string;
    headline: string;
    line: string;
    ctas: readonly string[];
    open: string;
    shopTitle: string;
    seeShop: string;
    products: readonly {
        key: string;
        name: string;
        unit?: string;
        price: string;
        badge?: string;
    }[];
    classTitle: string;
    classLine: string;
    slot: string;
    classShort: string;
    leftShort: string;
    book: string;
    foot: readonly string[];
    pins: { products: string; bookings: string; hours: string };
}

/** The look as the drawing's custom properties, band included. */
export function lookStyle(
    look: SiteLook,
    band?: { bg: string; fg: string },
): CSSProperties {
    // The dark one of the site's text and page colours: a card's dark band.
    const light = (hsl: string) =>
        Number(hsl.split(" ")[2]?.replace("%", "") ?? 0);
    const [ink, inkFg] =
        light(look.fg) < light(look.bg)
            ? [look.fg, look.bg]
            : [look.bg, look.fg];
    return {
        ...siteVars(look),
        "--site-band": band?.bg ?? look.accent,
        "--site-band-fg": band?.fg ?? look.accentFg,
        "--site-ink": ink,
        "--site-ink-fg": inkFg,
    } as CSSProperties;
}

const HEAD =
    "font-[family-name:var(--site-font-heading)] [font-weight:var(--site-heading-weight)]";

/** Saroh's own label over the merchant's site: where this part came from. */
function Pin({
    icon,
    children,
    className,
}: {
    icon: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "absolute z-[3] inline-flex h-8 items-center gap-[7px] whitespace-nowrap rounded-lg bg-foreground px-[11px] font-sans text-[13px] font-semibold text-background shadow-[0_6px_16px_-6px_rgba(0,0,0,0.4)] [&_svg]:size-[15px]",
                className,
            )}
        >
            {icon}
            {children}
        </span>
    );
}

/**
 * Rye & Co.'s site, large (FW's hero stage): its header, hero, this week's
 * bakes, the class band and the footer, each pinned to where Saroh read it
 * from. In the merchant's look (`--site-*`), never Saroh's. One column on
 * a phone. `shop` off (the `site-shop` claim) draws no products.
 */
export function ShopSite({
    words,
    shop,
}: {
    words: ShopSiteWords;
    shop: boolean;
}) {
    return (
        <div className="bg-[hsl(var(--site-bg))] font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))]">
            <div className="flex items-center gap-[26px] border-b border-[hsl(var(--site-fg)/0.12)] px-5 py-4 min-[760px]:px-[34px] min-[760px]:py-[18px]">
                <span
                    className={cn(
                        HEAD,
                        "text-[22px] tracking-[-0.01em] min-[760px]:text-[26px]",
                    )}
                >
                    {words.name}
                </span>
                <span className="hidden gap-[22px] text-[15px] text-[hsl(var(--site-muted))] min-[1080px]:flex">
                    {words.nav.map((n, i) => (
                        <span
                            key={n}
                            className={cn(
                                i === 0 &&
                                    "border-b-[1.5px] border-[hsl(var(--site-fg))] font-medium text-[hsl(var(--site-fg))]",
                            )}
                        >
                            {n}
                        </span>
                    ))}
                </span>
                <span className="ml-auto inline-flex h-[42px] items-center rounded-[var(--site-radius)] bg-[hsl(var(--site-accent))] px-[18px] text-[15px] font-bold text-[hsl(var(--site-accent-fg))]">
                    {words.order}
                </span>
            </div>
            <div className="grid items-center gap-6 px-5 py-6 min-[760px]:grid-cols-[1.05fr_1fr] min-[760px]:gap-[34px] min-[760px]:px-[34px] min-[760px]:pb-[34px] min-[760px]:pt-[38px]">
                <div>
                    <h3
                        className={cn(
                            HEAD,
                            "m-0 text-[32px] leading-[1.02] tracking-[-0.02em] min-[1080px]:text-[54px]",
                        )}
                    >
                        {words.headline}
                    </h3>
                    <p className="m-0 mt-4 max-w-[390px] text-[16px] leading-normal text-[hsl(var(--site-muted))] min-[760px]:text-[17px]">
                        {words.line}
                    </p>
                    <div className="mt-[22px] flex flex-wrap gap-2.5">
                        {words.ctas.map((c, i) => (
                            <span
                                key={c}
                                className={cn(
                                    "inline-flex h-[46px] items-center rounded-[var(--site-radius)] px-5 text-[15px] font-bold",
                                    i === 0
                                        ? "bg-[hsl(var(--site-accent))] text-[hsl(var(--site-accent-fg))]"
                                        : "border-[1.5px] border-[hsl(var(--site-fg))]",
                                )}
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                    <p className="m-0 mt-[18px] flex items-center gap-2 text-[14.5px] text-[hsl(var(--site-muted))]">
                        <span
                            aria-hidden
                            className="size-2 rounded-full bg-[hsl(var(--site-band))]"
                        />
                        {words.open}
                    </p>
                </div>
                <Photo
                    kind="buns"
                    className="h-[200px] rounded-[var(--site-radius)] min-[1080px]:h-[300px]"
                />
            </div>
            {shop ? (
                <div className="relative px-5 pb-[34px] pt-2.5 min-[760px]:px-[34px]">
                    <Pin
                        icon={<ShoppingBag aria-hidden />}
                        className="-top-[22px] left-2 min-[760px]:-left-1.5"
                    >
                        {words.pins.products}
                    </Pin>
                    <div className="flex items-baseline justify-between gap-4">
                        <h4
                            className={cn(
                                HEAD,
                                "m-0 text-[24px] tracking-[-0.01em] min-[760px]:text-[30px]",
                            )}
                        >
                            {words.shopTitle}
                        </h4>
                        <span className="text-[15px] underline underline-offset-4">
                            {words.seeShop}
                        </span>
                    </div>
                    <div className="mt-[18px] grid grid-cols-2 gap-3.5 min-[1080px]:grid-cols-4">
                        {words.products.map((p) => (
                            <div
                                key={p.key}
                                className="relative overflow-hidden rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))]"
                            >
                                {p.badge ? (
                                    <span className="absolute left-2.5 top-2.5 z-[1] rounded-[3px] bg-[hsl(var(--site-accent))] px-2 py-[3px] text-[12px] font-bold text-[hsl(var(--site-accent-fg))]">
                                        {p.badge}
                                    </span>
                                ) : null}
                                <Photo
                                    kind={photoFor(p.key)}
                                    className="h-[100px] min-[760px]:h-[122px]"
                                />
                                <div className="px-3.5 pb-3.5 pt-3">
                                    <b
                                        className={cn(
                                            HEAD,
                                            "block text-[16px] leading-[1.15] min-[760px]:text-[17px]",
                                        )}
                                    >
                                        {p.name}
                                    </b>
                                    {p.unit ? (
                                        <span className="mt-1 block text-[13.5px] text-[hsl(var(--site-muted))]">
                                            {p.unit}
                                        </span>
                                    ) : null}
                                    <em className="mt-2 block text-[15px] font-bold not-italic">
                                        {p.price}
                                    </em>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            <div className="relative">
                <Pin
                    icon={<CalendarDays aria-hidden />}
                    className="-top-3.5 right-3 min-[760px]:right-5"
                >
                    {words.pins.bookings}
                </Pin>
                <div className="mx-5 mb-[34px] grid items-center gap-5 rounded-[var(--site-radius)] bg-[hsl(var(--site-band))] px-6 py-6 text-[hsl(var(--site-band-fg))] min-[760px]:mx-[34px] min-[760px]:grid-cols-[1fr_auto] min-[760px]:px-7">
                    <div>
                        <h4
                            className={cn(
                                HEAD,
                                "m-0 text-[22px] min-[760px]:text-[26px]",
                            )}
                        >
                            {words.classTitle}
                        </h4>
                        <p className="m-0 mt-1.5 text-[15px] opacity-90">
                            {words.classLine}
                        </p>
                        <span className="mt-3.5 inline-flex h-10 items-center rounded-[var(--site-radius)] bg-[hsl(var(--site-band-fg))] px-3.5 text-[14.5px] font-bold text-[hsl(var(--site-band))]">
                            {words.slot}
                        </span>
                    </div>
                    <span className="inline-flex h-[46px] w-fit items-center rounded-[var(--site-radius)] bg-[hsl(var(--site-band-fg))] px-5 font-bold text-[hsl(var(--site-band))]">
                        {words.book}
                    </span>
                </div>
            </div>
            <div className="relative flex flex-wrap gap-x-7 gap-y-1 border-t border-[hsl(var(--site-fg)/0.12)] px-5 pb-14 pt-4 text-[14px] text-[hsl(var(--site-muted))] min-[760px]:px-[34px] min-[760px]:pb-5">
                {words.foot.map((f) => (
                    <span key={f}>{f}</span>
                ))}
                <Pin
                    icon={<Clock aria-hidden />}
                    className="bottom-3 right-3 min-[760px]:bottom-auto min-[760px]:right-5 min-[760px]:top-2.5"
                >
                    {words.pins.hours}
                </Pin>
            </div>
        </div>
    );
}

/** The small re-skin beside the big site (`.ms`): the same words in another look. */
export function MiniSite({
    words,
    shop,
    caps = false,
    fit = false,
}: {
    words: ShopSiteWords;
    shop: boolean;
    /** The gym look sets its name in capitals. */
    caps?: boolean;
    /** As tall as its content, not the switcher's fixed frame. */
    fit?: boolean;
}) {
    const [first] = words.products;
    return (
        <div
            className={`flex ${fit ? "" : "h-[286px]"}flex-col gap-[9px] overflow-hidden bg-[hsl(var(--site-bg))] px-4 pb-4 pt-3.5 font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))]`}
        >
            <div className="flex items-center justify-between text-[12px]">
                <span
                    className={cn(
                        HEAD,
                        "text-[16px]",
                        caps && "uppercase tracking-[-0.02em]",
                    )}
                >
                    {words.name}
                </span>
                <span className="inline-flex h-[26px] items-center rounded-[var(--site-radius)] bg-[hsl(var(--site-accent))] px-2.5 font-bold text-[hsl(var(--site-accent-fg))]">
                    {words.order}
                </span>
            </div>
            <Photo
                kind="buns"
                className="h-[62px] shrink-0 rounded-[var(--site-radius)]"
            />
            <h5
                className={cn(
                    HEAD,
                    "m-0 text-[22px] leading-[1.05] tracking-[-0.02em]",
                )}
            >
                {words.headline}
            </h5>
            {shop ? (
                <div className="flex items-center justify-between rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))] px-2.5 py-2 text-[13px]">
                    <span>
                        {first.name}
                        {first.unit ? (
                            <span className="opacity-70"> · {first.unit}</span>
                        ) : null}
                    </span>
                    <b>{first.price}</b>
                </div>
            ) : null}
            <div className="flex items-center justify-between rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))] px-2.5 py-2 text-[13px]">
                <span>{words.classShort}</span>
                <b className="text-[hsl(var(--site-accent))]">
                    {words.leftShort}
                </b>
            </div>
        </div>
    );
}
