import type { LookId, RenderedTestimonials } from "@saroh/block-contract";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import {
    FRONT_RING,
    FRONT_TYPE,
    FRONT_WRAP,
    LookEyebrow,
    said,
} from "./look-front";

/**
 * What customers said, under a look (DEC-172, plan U6, #1094), as each
 * look's Home board draws it. The owner's own testimonials stand in for
 * service reviews until Phase 2 (U21), so nothing here is a rating.
 *
 * - **Folio** (VA01): one pull quote, set large in the display face
 *   between two rules; the rest beside it on a desk. On a phone the page
 *   is kept short (VA-16): the pull quote, and the rest behind "Read all".
 * - **Quiet** (VD01): short quotes in the display face's italic, three
 *   centred columns on a desk, one under another between hairlines on a
 *   phone.
 * - **Live** (VB01): white cards, in a row that scrolls sideways on a
 *   phone and a grid on a desk.
 *
 * Each quote is a `<figure>` with its `<blockquote>` and `<figcaption>`, so
 * the words and who said them stay together for a screen reader. Every
 * quote the owner wrote is kept.
 */
export default function LookTestimonials({
    content,
    look,
}: {
    content: RenderedTestimonials;
    look: LookId;
}) {
    const items = content.items.filter(
        (item) => said(item.quote) !== null && said(item.name) !== null,
    );
    if (items.length === 0) return null;
    const heading = said(content.heading);
    const type = FRONT_TYPE[look];
    const title = (
        <>
            <LookEyebrow
                content={content}
                look={look}
                className={cn(
                    "pb-4",
                    look === "quiet" && "min-[700px]:text-center",
                )}
            />
            {heading ? (
                <h2
                    data-site-title=""
                    className={cn(
                        type.h2,
                        "pb-6 min-[700px]:pb-10",
                        look === "quiet" &&
                            "min-[700px]:pb-14 min-[700px]:text-center",
                    )}
                >
                    {heading}
                </h2>
            ) : null}
        </>
    );

    return (
        <section
            data-site-look-proof={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                {look === "folio" ? (
                    <FolioQuotes items={items} title={title} />
                ) : look === "quiet" ? (
                    <div>
                        {title}
                        {/* VD01: three centred columns on a desk, between
                            hairlines one under another on a phone. */}
                        <ul className="min-[700px]:flex min-[700px]:flex-wrap min-[700px]:justify-center min-[700px]:gap-12">
                            {items.map((item, i) => (
                                <li
                                    key={i}
                                    className="min-[700px]:basis-[calc((100%-6rem)/3)]"
                                >
                                    <figure className="border-site-border m-0 grid gap-2.5 border-t py-5 min-[700px]:border-t-0 min-[700px]:py-0 min-[700px]:text-center">
                                        <blockquote className="font-site-heading text-site-fg m-0 whitespace-pre-line text-[22px] italic leading-[1.3] [text-wrap:balance] min-[700px]:text-[26px]">
                                            “{item.quote}”
                                        </blockquote>
                                        <Caption
                                            item={item}
                                            className="text-site-muted text-[13.5px] leading-[1.55]"
                                        />
                                    </figure>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <>
                        {title}
                        <ul className="-mx-[var(--site-page-margin)] flex snap-x snap-mandatory scroll-px-[var(--site-page-margin)] gap-3 overflow-x-auto px-[var(--site-page-margin)] pb-1 [scrollbar-width:none] min-[700px]:mx-0 min-[700px]:grid min-[700px]:grid-cols-2 min-[700px]:gap-5 min-[700px]:overflow-visible min-[700px]:px-0 min-[1100px]:grid-cols-3">
                            {items.map((item, i) => (
                                <li
                                    key={i}
                                    className={cn(
                                        "w-[85%] shrink-0 snap-start min-[700px]:w-auto",
                                        items.length === 1 && "w-full",
                                    )}
                                >
                                    <figure className="bg-site-surface rounded-site-s m-0 grid h-full content-between gap-3 p-6">
                                        <blockquote className="text-site-fg m-0 whitespace-pre-line text-[18px] leading-[1.6] [text-wrap:pretty]">
                                            “{item.quote}”
                                        </blockquote>
                                        <Caption
                                            item={item}
                                            className="text-[14px] leading-[1.45]"
                                            bold
                                        />
                                    </figure>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </section>
    );
}

type Item = RenderedTestimonials["items"][number];

function Caption({
    item,
    className,
    bold = false,
}: {
    item: Item;
    className: string;
    bold?: boolean;
}) {
    const role = said(item.role);
    return (
        <figcaption className={className}>
            <span className={bold ? "text-site-fg font-bold" : undefined}>
                {item.name}
            </span>
            {role ? (
                <span className="text-site-muted">{` · ${role}`}</span>
            ) : null}
        </figcaption>
    );
}

/** Folio's pull quote, with the rest beside it, or behind "Read all". */
function FolioQuotes({ items, title }: { items: Item[]; title: ReactNode }) {
    const [lead, ...rest] = items;
    const others = (
        <ul className="grid gap-8">
            {rest.map((item, i) => (
                <li key={i}>
                    <figure className="border-site-fg m-0 grid gap-3.5 border-t pt-5">
                        <blockquote className="font-site-heading text-site-fg m-0 whitespace-pre-line text-[20px] font-light leading-[1.35] tracking-[-0.01em] min-[700px]:text-[24px]">
                            “{item.quote}”
                        </blockquote>
                        <Caption
                            item={item}
                            className="text-site-muted text-[12.5px] leading-[1.5]"
                        />
                    </figure>
                </li>
            ))}
        </ul>
    );
    return (
        <div
            className={cn(
                "grid gap-8",
                rest.length > 0 &&
                    "min-[1000px]:grid-cols-[7fr_5fr] min-[1000px]:items-start min-[1000px]:gap-[72px]",
            )}
        >
            <div className="grid content-start gap-8">
                {title ?? (
                    <p className="text-site-muted text-[12px] font-semibold uppercase tracking-[0.18em]">
                        What people say
                    </p>
                )}
                <figure className="m-0 grid gap-4">
                    <blockquote className="font-site-heading text-site-fg border-t-site-fg border-b-site-border m-0 whitespace-pre-line border-b border-t py-7 text-[40px] font-light italic leading-[1.25] tracking-[-0.02em] min-[700px]:py-10">
                        “{lead.quote}”
                    </blockquote>
                    <Caption
                        item={lead}
                        className="text-site-body text-[14px] leading-[1.55]"
                    />
                </figure>
            </div>
            {rest.length > 0 ? (
                <>
                    <div className="max-[999px]:hidden">{others}</div>
                    <details className="group min-[1000px]:hidden">
                        <summary
                            className={cn(
                                "text-site-fg inline-flex min-h-11 cursor-pointer list-none items-center text-[15px] font-semibold underline decoration-1 underline-offset-[5px] [&::-webkit-details-marker]:hidden",
                                FRONT_RING,
                            )}
                        >
                            <span className="group-open:hidden">
                                Read all {items.length}
                            </span>
                            <span className="hidden group-open:inline">
                                Show fewer
                            </span>
                        </summary>
                        <div className="pt-6">{others}</div>
                    </details>
                </>
            ) : null}
        </div>
    );
}
