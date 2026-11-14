import { PointGrid } from "@saroh/marketing/point-grid";
import { Section } from "@saroh/marketing/section";
import { TextLink } from "@saroh/marketing/text-link";

import { BrowserFrame } from "@/components/templates/browser-frame";
import { TemplatePageView } from "@/components/templates/template-page-view";
import type { GalleryTemplate } from "@/content/templates";
import { galleryTemplate, TEMPLATES_PATH } from "@/content/templates";
import type { FeatureTemplates as Words } from "@saroh/marketing/content-types";

/**
 * "Pick a template for your trade" (DEC-216, board VSWebsite): the picker
 * and the preview drawn from the gallery's own templates, then the three
 * points and a link to /templates. The caller draws it only while
 * templates are switched on (`NEXT_PUBLIC_TEMPLATES`).
 */
export function FeatureTemplates({ words }: { words: Words }) {
    const picks = words.picks.flatMap((slug) => {
        const t = galleryTemplate(slug);
        return t ? [t] : [];
    });
    const first = picks.at(0);
    return (
        <Section
            titleId="templates"
            eyebrow="Templates"
            title={words.title}
            lead={words.lead}
            className="grid gap-9 pt-[120px]"
        >
            {first ? (
                <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
                    <Picker picks={picks} suggested={words.suggested} />
                    <Preview template={first} />
                </div>
            ) : null}
            <PointGrid points={words.points} />
            <TextLink
                href={TEMPLATES_PATH}
                arrow
                className="justify-self-start"
            >
                {words.linkLabel}
            </TextLink>
        </Section>
    );
}

const FIGURE =
    "m-0 overflow-hidden rounded-[16px] border border-border bg-card shadow-[0_24px_60px_-30px_rgba(28,28,26,.35)]";

const CHIP = "rounded-full border px-3 py-1 text-[12px] font-semibold";

function Picker({
    picks,
    suggested,
}: {
    picks: readonly GalleryTemplate[];
    suggested: string;
}) {
    return (
        <figure className={FIGURE}>
            <figcaption className="sr-only">
                Drawing of choosing a template in Saroh, with the salon template
                suggested first
            </figcaption>
            <div
                aria-hidden
                className="flex gap-2 border-b border-border px-3.5 py-2.5 text-[13px] text-muted-foreground"
            >
                <b className="text-foreground">Website</b>›<span>New site</span>
                ›<span>Template</span>
            </div>
            <div aria-hidden className="grid gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap gap-2">
                    <span
                        className={`${CHIP} border-foreground bg-foreground text-background`}
                    >
                        {suggested}
                    </span>
                    <span className={`${CHIP} border-border`}>All</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {picks.map((t, i) => (
                        <div
                            key={t.slug}
                            className={`grid content-start gap-2 rounded-[12px] border bg-card p-2 ${i === 0 ? "border-foreground ring-1 ring-foreground" : "border-border"}`}
                        >
                            <span className="block aspect-[4/3] overflow-hidden rounded-[8px]">
                                {t.pages.at(0) ? (
                                    <TemplatePageView
                                        template={t}
                                        page={t.pages[0]}
                                        decorative
                                        sizes="160px"
                                    />
                                ) : null}
                            </span>
                            <span className="grid gap-px px-0.5 pb-0.5">
                                <b className="text-[13px]">{t.name}</b>
                                <span className="text-[11.5px] text-muted-foreground">
                                    {i === 0 ? suggested : "Also available"}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </figure>
    );
}

function Preview({ template }: { template: GalleryTemplate }) {
    const home = template.pages.at(0);
    return (
        <figure className={`${FIGURE} grid gap-3 p-4 sm:p-[18px]`}>
            <figcaption className="sr-only">
                {`Drawing of the ${template.name} template's preview in Saroh, on a computer and a phone`}
            </figcaption>
            <div aria-hidden className="flex items-baseline gap-2">
                <b className="text-[14px]">{template.name}</b>
                <span className="text-[12.5px] text-muted-foreground">
                    with your details
                </span>
            </div>
            {home ? (
                <div aria-hidden className="flex items-start gap-3">
                    <BrowserFrame
                        host={template.sample.host}
                        className="flex-1"
                    >
                        <span className="block aspect-[16/10] overflow-hidden">
                            <TemplatePageView
                                template={template}
                                page={home}
                                decorative
                                sizes="320px"
                            />
                        </span>
                    </BrowserFrame>
                    <span className="block aspect-[9/19] w-[74px] flex-none overflow-hidden rounded-[12px] border-[3px] border-foreground">
                        <TemplatePageView
                            template={template}
                            page={home}
                            device="phone"
                            decorative
                            sizes="74px"
                        />
                    </span>
                </div>
            ) : null}
            <div
                aria-hidden
                className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]"
            >
                <span className="text-muted-foreground">
                    {template.pages.map((p) => p.title).join(", ")}
                </span>
                <span className="rounded-[8px] bg-foreground px-3.5 py-[7px] font-semibold text-background">
                    Use this template
                </span>
            </div>
        </figure>
    );
}
