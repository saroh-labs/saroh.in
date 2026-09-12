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
}: {
    content: RenderedRichText;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-md px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.format === "html" ? (
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
            )}
        </section>
    );
}
