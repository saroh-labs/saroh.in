import type { RenderedGallery } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";
import { cn } from "../lib/utils";

/**
 * `gallery` v1 — an ordered set of images. `carousel` degrades to a horizontal
 * scroll strip; `grid` and `masonry` lay images out responsively. All variants
 * are keyboard/scroll accessible and never overflow the page horizontally.
 */
export default function GallerySection({
    content,
}: {
    content: RenderedGallery;
}) {
    /*
     * The look comes from `variant` now (#254). `resolveVariant` is what makes
     * that safe for content of any age: a `gallery@1` section carries `layout`
     * and no variant, and the rule reads that old field rather than defaulting
     * — so a published carousel stays a carousel.
     */
    const layout = resolveVariant("gallery", content);
    /*
     * A gallery shipped as a brief (KTD-5) has no images yet: the brief is a
     * note to the owner, and the live site draws nothing for it.
     */
    const images = Array.isArray(content.images)
        ? content.images.filter((img) => Boolean(img.src.trim()))
        : [];
    if (images.length === 0) return null;
    // Captions (U2): a line under a photo, drawn only where one was written.
    const captioned = images.some((img) => Boolean(img.caption?.trim()));

    if (layout === "carousel") {
        return (
            <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                <div className="flex snap-x snap-mandatory gap-[var(--site-grid-gap)] overflow-x-auto pb-4">
                    {images.map((img, i) =>
                        captioned ? (
                            <figure key={i} className="flex-none snap-start">
                                <img
                                    src={img.src}
                                    alt={img.alt ?? ""}
                                    className="h-64 w-auto rounded-[var(--site-radius)] object-cover"
                                />
                                <Caption text={img.caption} />
                            </figure>
                        ) : (
                            <img
                                key={i}
                                src={img.src}
                                alt={img.alt ?? ""}
                                className="h-64 w-auto flex-none snap-start rounded-[var(--site-radius)] object-cover"
                            />
                        ),
                    )}
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div
                className={cn(
                    layout === "masonry"
                        ? "columns-1 gap-[var(--site-grid-gap)] sm:columns-2 lg:columns-3 [&>*]:mb-[var(--site-grid-gap)]"
                        : "grid grid-cols-1 gap-[var(--site-grid-gap)] sm:grid-cols-2 lg:grid-cols-3",
                )}
            >
                {images.map((img, i) => {
                    const picture = (
                        <img
                            key={i}
                            src={img.src}
                            alt={img.alt ?? ""}
                            className={cn(
                                "w-full rounded-[var(--site-radius)] object-cover",
                                layout === "masonry"
                                    ? "h-auto"
                                    : captioned
                                      ? "aspect-square"
                                      : "aspect-square h-full",
                            )}
                        />
                    );
                    // Without a caption anywhere, exactly the markup it has
                    // always drawn (G5).
                    if (!captioned) return picture;
                    return (
                        <figure key={i} className="min-w-0 break-inside-avoid">
                            {picture}
                            <Caption text={img.caption} />
                        </figure>
                    );
                })}
            </div>
        </section>
    );
}

/** The line under a photo; nothing when none was written. */
function Caption({ text }: { text?: string }) {
    const said = text?.trim();
    if (!said) return null;
    return (
        <figcaption className="text-site-muted mt-2 text-[13px] leading-snug [overflow-wrap:anywhere]">
            {said}
        </figcaption>
    );
}
