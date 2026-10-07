import type { RenderedRichText } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

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
    // The left-aligned look (template polish): the column at the page's
    // left edge, as the module page's intro already sits.
    const left = resolveVariant("richText", content) === "left";
    const wide = cards || left;
    /*
     * Part labels (template polish): the text's h3s as small capitals, as a
     * case study names its parts. Utilities on the prose wrapper, so the
     * sanitized markup itself is untouched.
     */
    const labels = content.partLabels
        ? " prose-h3:font-site-body prose-h3:text-site-muted prose-h3:mb-2 prose-h3:mt-8 prose-h3:text-[13px] prose-h3:font-semibold prose-h3:uppercase prose-h3:tracking-[0.1em]"
        : "";
    /*
     * Round 2: the text's own headings as the site's section titles, and
     * its facts list as labels. Attributes, not utilities: the rules are
     * `SiteTheme`'s, which already knows the label style and outranks the
     * prose plugin's own.
     */
    const marks = {
        ...(content.headingStyle === "label"
            ? { "data-site-headings": "label" }
            : {}),
        ...(content.factsStyle === "labels"
            ? { "data-site-facts": "labels" }
            : {}),
    };
    /*
     * A template's type scale (DEC-090) sets the body size and the reading
     * width through `--site-body-size` and `--site-measure`; without one the
     * fallbacks are the prose plugin's 1rem and no cap of its own, which is
     * what every text block has always drawn.
     */
    const prose =
        content.format === "html" ? (
            <div
                {...marks}
                /* Typography's own greys are replaced by the merchant's
                   text colour (#189), and `dark:prose-invert` is gone with
                   them: once a palette is chosen, a visitor's OS setting
                   must not repaint a storefront its owner picked. */
                className={`prose prose-headings:font-site-heading prose-headings:text-site-fg prose-p:text-site-fg/80 prose-a:text-site-accent prose-strong:text-site-fg prose-li:text-site-fg/80 max-w-[var(--site-measure,none)] text-[length:var(--site-body-size,1rem)]${labels}`}
                // Sanitized at publish (see the safety note above).
                dangerouslySetInnerHTML={{ __html: content.value }}
            />
        ) : (
            <div className="prose prose-p:text-site-fg/80 max-w-[var(--site-measure,none)] text-[length:var(--site-body-size,1rem)]">
                <p className="whitespace-pre-wrap">{content.value}</p>
            </div>
        );

    /*
     * The label over the text (round 2): an eyebrow in the accent, marked
     * `data-site-title` so a site that sets its section titles as an
     * eyebrow sets this one the same way. Not a heading — the text's own
     * `h2` is the section's heading.
     */
    const label = content.label?.trim();
    const text = label ? (
        <>
            <p
                data-site-title=""
                className="font-site-body text-site-accent mb-4 text-[13px] font-semibold uppercase leading-snug tracking-[0.1em]"
            >
                {label}
            </p>
            {prose}
        </>
    ) : (
        prose
    );

    const callout = content.callout?.text.trim() ? (
        <Callout label={content.callout.label} text={content.callout.text} />
    ) : null;

    /*
     * Without a photo this is the single column it has always been, markup
     * and all: every text block published before photos existed draws
     * exactly as it did (the G5 snapshot holds it).
     */
    const image = content.image?.src ? content.image : null;
    if (!image) {
        return wide ? (
            <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                <div className="max-w-[65ch]">
                    {text}
                    {callout}
                </div>
            </section>
        ) : (
            <section className="mx-auto w-full max-w-screen-md px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                {text}
                {callout}
            </section>
        );
    }

    /*
     * The photo above the text (template polish), at 16:9 and the width of
     * the text's column, as a case study opens on the thing it built.
     */
    if (content.imageSide === "above") {
        const photo = (
            <img
                src={image.src}
                alt={image.alt ?? ""}
                width={image.width}
                height={image.height}
                loading="lazy"
                className="bg-site-surface mb-8 aspect-video h-auto w-full rounded-[var(--site-radius)] object-cover"
            />
        );
        return wide ? (
            <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                <div className="max-w-[65ch]">
                    {photo}
                    {text}
                    {callout}
                </div>
            </section>
        ) : (
            <section className="mx-auto w-full max-w-screen-md px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                {photo}
                {text}
                {callout}
            </section>
        );
    }

    /*
     * With a photo (G7) the block widens to hold it beside the text, on the
     * side the merchant chose — the right unless they said left. On a phone
     * the two stack, photo first, the way a card reads.
     */
    const photoLeft = content.imageSide === "left";
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
                        photoLeft
                            ? "h-auto w-full rounded-[var(--site-radius)] object-cover"
                            : "h-auto w-full rounded-[var(--site-radius)] object-cover md:order-last"
                    }
                />
                <div className="min-w-0">
                    {text}
                    {callout}
                </div>
            </div>
        </section>
    );
}

/**
 * The boxed line after the text (template polish): the accent as a rule on
 * its left, never as the text's colour, so it reads at 4.5:1 on any palette;
 * the label says what the box is, so the rule is not the only signal.
 */
function Callout({ label, text }: { label?: string; text: string }) {
    const name = label?.trim();
    return (
        <aside
            aria-label={name === "" ? undefined : name}
            className="border-site-accent bg-site-surface text-site-fg mt-8 max-w-[var(--site-measure,65ch)] border-l-2 px-5 py-4"
        >
            {name ? (
                <p className="text-[13px] font-semibold uppercase tracking-[0.1em]">
                    {name}
                </p>
            ) : null}
            <p
                className={`whitespace-pre-line text-[length:var(--site-body-size,1rem)] leading-relaxed ${name ? "mt-1.5" : ""}`}
            >
                {text.trim()}
            </p>
        </aside>
    );
}
