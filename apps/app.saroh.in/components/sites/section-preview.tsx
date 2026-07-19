import type { Section } from "@/lib/sites/service";

/**
 * Lightweight presentational renderers for draft sections — used by the editor
 * to preview edits BEFORE publishing (it renders the client editor state, so no
 * network round-trip). This is intentionally simple: the real public render is
 * S2-006 in sites.saroh.in. richText HTML is NOT sanitized here because this
 * only ever shows the author their own draft, never third-party content.
 */

function SectionPreview({ section }: { section: Section }) {
    switch (section.type) {
        case "hero": {
            const { heading, subheading, cta, image } = section.content;
            return (
                <section className="rounded-lg border bg-muted/30 p-8 text-center">
                    {image?.src && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={image.src}
                            alt={image.alt ?? ""}
                            className="mx-auto mb-6 max-h-56 rounded-md object-cover"
                        />
                    )}
                    <h2 className="text-3xl font-bold tracking-tight">
                        {heading}
                    </h2>
                    {subheading && (
                        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                            {subheading}
                        </p>
                    )}
                    {cta?.label && (
                        <span className="mt-6 inline-block rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
                            {cta.label}
                        </span>
                    )}
                </section>
            );
        }
        case "richText": {
            const { format, value } = section.content;
            return (
                <section className="rounded-lg border p-6">
                    {format === "html" ? (
                        <div
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: value }}
                        />
                    ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm">
                            {value}
                        </pre>
                    )}
                </section>
            );
        }
        case "cta": {
            const { label } = section.content;
            return (
                <section className="rounded-lg border p-8 text-center">
                    <span className="inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
                        {label}
                    </span>
                </section>
            );
        }
        case "gallery": {
            const { images, layout } = section.content;
            return (
                <section className="rounded-lg border p-6">
                    <div
                        className={
                            layout === "carousel"
                                ? "flex gap-3 overflow-x-auto"
                                : "grid grid-cols-2 gap-3 sm:grid-cols-3"
                        }
                    >
                        {images.map((img, i) => (
                            <div
                                key={i}
                                className={
                                    layout === "carousel"
                                        ? "h-32 w-48 shrink-0"
                                        : "aspect-square"
                                }
                            >
                                {img.src ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={img.src}
                                        alt={img.alt ?? ""}
                                        className="h-full w-full rounded-md object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                                        image
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            );
        }
        default:
            return null;
    }
}

/** Render an ordered list of draft sections as a page preview. */
export function DraftPreview({ sections }: { sections: Section[] }) {
    if (sections.length === 0) {
        return (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No sections yet. Add one to preview it here.
            </p>
        );
    }
    return (
        <div className="space-y-4">
            {sections.map((section, i) => (
                <SectionPreview key={i} section={section} />
            ))}
        </div>
    );
}
