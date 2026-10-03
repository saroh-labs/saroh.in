import { cn } from "@/lib/cn";

import type { FaqItem } from "@/content/types";

import { Container } from "./container";

/**
 * "Questions": each a native `<details>`, so it opens with the keyboard and
 * works before any script runs. `id="faq"` is what the footer's "Questions"
 * link (`/#faq`) lands on.
 */
export function Faq({
    items,
    title = "Questions",
    id = "faq",
    className,
}: {
    items: FaqItem[];
    title?: string;
    id?: string;
    /** E.g. the Features and Solutions designs' `pt-[120px]` (Home's is 110). */
    className?: string;
}) {
    return (
        <Container
            as="section"
            id={id}
            aria-labelledby={`${id}-title`}
            className={cn(
                "mx-0 grid max-w-[860px] scroll-mt-6 gap-5 pt-[110px]",
                className,
            )}
        >
            <h2
                id={`${id}-title`}
                className="m-0 font-display text-mk-h2-sm font-bold"
            >
                {title}
            </h2>
            <div className="grid border-t border-border">
                {items.map((item) => (
                    <details
                        key={item.q}
                        className="border-b border-border py-1"
                    >
                        <summary className="cursor-pointer rounded-sm py-4 text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]">
                            {item.q}
                        </summary>
                        <p className="mb-[18px] mt-0 max-w-[64ch] text-mk-faq text-mk-copy [text-wrap:pretty]">
                            {item.a}
                        </p>
                    </details>
                ))}
            </div>
        </Container>
    );
}
