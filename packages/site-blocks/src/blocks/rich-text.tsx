import type { RenderedRichText } from "@saroh/block-contract";

/**
 * `richText` v1 — authored rich content.
 *
 * SAFETY NOTE. When `format === "html"` we render `value` via
 * `dangerouslySetInnerHTML`. This is safe ONLY because the value has been
 * through the API's HTML sanitizer (`apps/api.saroh.in/.../sites/sanitize.ts`)
 * before it reaches this component. Two callers render it:
 * - the public renderer, from the publication snapshot, which publish writes
 *   only after sanitizing the contract's `sanitizedFields` (here
 *   `richText.value`);
 * - the editor preview in app.saroh.in, from the draft, which the API sanitizes
 *   when a draft is saved and again when it is loaded (#280). Until then the
 *   draft was cleaned only at publish, and the preview rendered it raw.
 *
 * Do NOT feed this component HTML that did not come through one of those paths.
 *
 * When `format === "markdown"` there is no markdown library in this app's deps,
 * so we render the raw markdown as pre-wrapped text (escaped by React) rather
 * than risk emitting unsanitized HTML.
 */
export default function RichTextSection({
    content,
    align = "column",
}: {
    content: RenderedRichText;
    /**
     * `column`: the centred reading column every page has always had.
     * `cards`: on a module page (DEC-073 #9), where the text is the page's
     * intro above its cards: it takes the cards' width and left edge, and
     * its lines keep a readable length.
     */
    align?: "column" | "cards";
}) {
    const cards = align === "cards";
    const text =
        content.format === "html" ? (
            <div
                /* Typography's own greys are replaced by the merchant's
                   text colour (#189), and `dark:prose-invert` is gone with
                   them: once a palette is chosen, a visitor's OS setting
                   must not repaint a storefront its owner picked. */
                className="prose prose-headings:text-site-fg prose-p:text-site-fg/80 prose-a:text-site-accent prose-strong:text-site-fg prose-li:text-site-fg/80 max-w-none"
                // Sanitized at publish (see the safety note above).
                dangerouslySetInnerHTML={{ __html: content.value }}
            />
        ) : (
            <div className="prose prose-p:text-site-fg/80 max-w-none">
                <p className="whitespace-pre-wrap">{content.value}</p>
            </div>
        );

    /*
     * Without a photo this is the single column it has always been, markup
     * and all: every text block published before photos existed draws
     * exactly as it did (the G5 snapshot holds it).
     */
    const image = content.image?.src ? content.image : null;
    if (!image) {
        return cards ? (
            <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                <div className="max-w-[65ch]">{text}</div>
            </section>
        ) : (
            <section className="mx-auto w-full max-w-screen-md px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                {text}
            </section>
        );
    }

    /*
     * With a photo (G7) the block widens to hold it beside the text, on the
     * side the merchant chose — the right unless they said left. On a phone
     * the two stack, photo first, the way a card reads.
     */
    const left = content.imageSide === "left";
    return (
        <section
            className={
                cards
                    ? "mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
                    : "mx-auto w-full max-w-screen-lg px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
            }
        >
            <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                {/* Remote publication images from arbitrary tenant origins —
                    a plain <img>, as the hero's, avoids next/image's
                    per-domain allowlist. */}
                <img
                    src={image.src}
                    alt={image.alt ?? ""}
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                    className={
                        left
                            ? "h-auto w-full rounded-[var(--site-radius)] object-cover"
                            : "h-auto w-full rounded-[var(--site-radius)] object-cover md:order-last"
                    }
                />
                <div className="min-w-0">{text}</div>
            </div>
        </section>
    );
}
