import Link from "next/link";

import { Arrow } from "@/components/v2/arrow";
import type { GalleryTemplate } from "@/content/templates";

import { BrowserFrame } from "./browser-frame";
import { TemplatePageView } from "./template-page-view";

/**
 * A gallery card (Templates design): the template's home page in a browser
 * frame with its sample address, then its name, its kind and "Preview →".
 * One link, the whole card; the frame is cropped to 16:10 from the top.
 */
export function TemplateCard({
    template,
    previewLabel,
    headingLevel = 2,
}: {
    template: GalleryTemplate;
    previewLabel: string;
    headingLevel?: 2 | 3;
}) {
    const home = template.pages.at(0);
    const Heading = headingLevel === 2 ? "h2" : "h3";
    return (
        <Link
            href={template.href}
            data-template={template.slug}
            className="group grid cursor-pointer content-start gap-4 rounded-[16px] text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
        >
            <BrowserFrame
                host={template.sample.host}
                className="transition-[border-color,box-shadow] duration-base ease-out group-hover:border-foreground group-hover:shadow-mk-lift"
            >
                <span className="block aspect-[16/10] overflow-hidden">
                    {home ? (
                        <TemplatePageView
                            template={template}
                            page={home}
                            decorative
                            sizes="(min-width: 1280px) 400px, (min-width: 760px) 50vw, 100vw"
                        />
                    ) : null}
                </span>
            </BrowserFrame>
            <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="grid gap-0.5">
                    <Heading className="m-0 text-[19px] font-semibold tracking-[-0.01em]">
                        {template.name}
                    </Heading>
                    <span className="text-[14px] text-muted-foreground">
                        {template.kindLabel}
                    </span>
                </span>
                <span className="text-[14px] font-semibold text-brand-700 group-hover:text-foreground">
                    {previewLabel}
                    <Arrow />
                </span>
            </span>
        </Link>
    );
}
