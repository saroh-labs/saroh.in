import { ChevronDown } from "lucide-react";

import type { FaqItem } from "@/content/types";

import { Container } from "./container";

/**
 * "Questions": each a native `<details>`, so it opens with the keyboard and
 * works before any script runs. The browser's ▶ marker is hidden; a
 * chevron at the row's right end turns over when the question opens (D-9). `id="faq"` is what the footer's "Questions"
 * link (`/#faq`) lands on.
 */
export function Faq({
    items,
    title = "Questions",
    id = "faq",
}: {
    items: FaqItem[];
    title?: string;
    id?: string;
}) {
    return (
        <Container
            as="section"
            id={id}
            aria-labelledby={`${id}-title`}
            className="mx-0 grid max-w-[860px] scroll-mt-6 gap-5 pt-[110px]"
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
                        className="group border-b border-border py-1"
                    >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] [&::-webkit-details-marker]:hidden">
                            {item.q}
                            <ChevronDown
                                aria-hidden
                                data-chevron
                                strokeWidth={2}
                                className="size-[19px] shrink-0 text-muted-foreground transition-transform duration-base ease-out group-open:rotate-180 motion-reduce:transition-none"
                            />
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
