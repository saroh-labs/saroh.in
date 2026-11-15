import { SwipeRow } from "@saroh/marketing/kit/swipe-row";

import { LinkCard } from "./card";

/** Related pages: three or more swipe on a phone (PHONE.md). */
export function RelatedGrid({
    title,
    items,
}: {
    title: string;
    items: readonly { title: string; line: string; href: string }[];
}) {
    return (
        <section className="flex flex-col gap-6">
            <h2 className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]">
                {title}
            </h2>
            <SwipeRow label={title}>
                {items.map((item) => (
                    <LinkCard key={item.href} className="h-full" {...item} />
                ))}
            </SwipeRow>
        </section>
    );
}
