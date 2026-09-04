import type { RichTextContent } from "@/lib/publication";

/**
 * `richText` v1 — authored rich content.
 *
 * SAFETY NOTE. When `format === "html"` we render `value` via
 * `dangerouslySetInnerHTML`. This is safe ONLY because the value was sanitized
 * server-side at publish: the publish step (S2-005) runs the contract's
 * `sanitizedFields` (here, `richText.value`) through an HTML sanitizer BEFORE
 * writing it into the immutable publication snapshot, so everything this
 * renderer reads back is already-cleaned, controlled HTML. This app never
 * receives raw/unsanitized author input — the only source is the public
 * snapshot API. Do NOT feed un-snapshotted HTML into this component.
 *
 * When `format === "markdown"` there is no markdown library in this app's deps,
 * so we render the raw markdown as pre-wrapped text (escaped by React) rather
 * than risk emitting unsanitized HTML.
 */
export default function RichTextSection({
    content,
}: {
    content: RichTextContent;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-md px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.format === "html" ? (
                <div
                    /* Typography's own greys are replaced by the merchant's
                       text colour (#189), and `dark:prose-invert` is gone with
                       them: once a palette is chosen, a visitor's OS setting
                       must not repaint a storefront its owner picked. */
                    className="prose max-w-none prose-headings:text-site-fg prose-p:text-site-fg/80 prose-a:text-site-accent prose-strong:text-site-fg prose-li:text-site-fg/80"
                    // Sanitized at publish (see the safety note above).
                    dangerouslySetInnerHTML={{ __html: content.value }}
                />
            ) : (
                <div className="prose max-w-none prose-p:text-site-fg/80">
                    <p className="whitespace-pre-wrap">{content.value}</p>
                </div>
            )}
        </section>
    );
}
