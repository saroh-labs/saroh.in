import type { RenderedFeatures } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import { cn } from "../lib/utils";

/**
 * `features` v1 — a heading over a set of short, titled points (#255).
 *
 * Three looks, drawing the same content. `grid` puts the points side by side
 * and reads as a summary; `list` stacks them so each has room to explain
 * itself; `steps` stacks them numbered 01, 02, 03 beside each title, for a
 * way of working done in order (the dietician template's "How I work"). The
 * numbers come from the position, so reordering renumbers, and the list is an
 * `<ol>` so a screen reader counts them too.
 * Which one is a merchant's choice, not a consequence of what they typed — the
 * mistake `hero` made, where the layout turned on whether an image happened to
 * be present.
 *
 * Template polish adds a `facts` look (a row of figures, value over label), a
 * figure per point (`value`, a rate or a span, the merchant's own words), two
 * columns for the list looks and a muted note under the points. Each is
 * absent by default, so a section without them draws exactly as before.
 *
 * Everything is drawn from the `--site-*` layer. Merchant sites must never
 * inherit Saroh's brand, and gate G2 fails the build if this file reaches for
 * one of Saroh's tokens.
 */
export default function FeaturesSection({
    content,
}: {
    content: RenderedFeatures;
}) {
    const variant = resolveVariant("features", content);
    if (variant === "facts") return <FactsRow content={content} />;
    const isSteps = variant === "steps";
    const isList = variant === "list" || isSteps;
    const List = isSteps ? "ol" : "ul";
    // Two columns (template polish): the list and steps looks only.
    const twoColumns = isList && content.columns === 2;
    const note = said(content.note);

    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.heading ? (
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg text-[calc(1.875rem*var(--site-heading-scale))] font-bold tracking-tight"
                >
                    {content.heading}
                </h2>
            ) : null}
            {content.intro ? (
                <p className="text-site-body mt-3 max-w-2xl text-lg">
                    {content.intro}
                </p>
            ) : null}

            <List
                className={
                    /*
                     * The grid caps at three columns rather than tracking the
                     * item count: a merchant with five points gets 3 + 2, not
                     * five columns squeezed to nothing. Single column on a
                     * phone in both looks — §18 makes the phone co-primary, and
                     * two columns at 375px is not a grid, it is two narrow
                     * strips.
                     */
                    isList
                        ? twoColumns
                            ? "mt-10 grid gap-[var(--site-grid-gap)] sm:grid-cols-2 sm:gap-x-10"
                            : "mt-10 grid gap-[var(--site-grid-gap)]"
                        : "mt-10 grid gap-[var(--site-grid-gap)] sm:grid-cols-2 lg:grid-cols-3"
                }
            >
                {content.items.map((item, i) => (
                    <li
                        key={i}
                        className={
                            isSteps
                                ? "border-site-border grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline border-t pt-5"
                                : isList
                                  ? "border-site-border border-t pt-5"
                                  : "rounded-[var(--site-radius)]"
                        }
                    >
                        {isSteps ? (
                            <span
                                aria-hidden="true"
                                className="font-site-heading text-site-accent text-[15px] tabular-nums"
                            >
                                {String(i + 1).padStart(2, "0")}
                            </span>
                        ) : null}
                        <h3 className="font-site-heading text-site-fg text-[calc(1.125rem*var(--site-heading-scale))] font-semibold">
                            {item.title}
                        </h3>
                        {said(item.value) ? (
                            <p
                                className={cn(
                                    "font-site-heading text-site-fg mt-1.5 text-[calc(1.4375rem*var(--site-heading-scale))] font-medium leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]",
                                    isSteps && "col-start-2",
                                )}
                            >
                                {said(item.value)}
                            </p>
                        ) : null}
                        {item.body ? (
                            <p
                                className={
                                    isSteps
                                        ? "text-site-body col-start-2 mt-2 max-w-2xl leading-relaxed"
                                        : isList
                                          ? "text-site-body mt-2 max-w-2xl leading-relaxed"
                                          : "text-site-body mt-2 leading-relaxed"
                                }
                            >
                                {item.body}
                            </p>
                        ) : null}
                    </li>
                ))}
            </List>
            {note ? <FeaturesNote text={note} /> : null}
        </section>
    );
}

/** Text a merchant actually wrote, or null for blank. */
function said(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** The muted line under the points (template polish): a caveat, plain text. */
function FeaturesNote({ text }: { text: string }) {
    return (
        <p className="text-site-muted mt-8 max-w-2xl whitespace-pre-line text-[14px] leading-relaxed">
            {text}
        </p>
    );
}

/**
 * The `facts` look (template polish): a row of figures, each point's value
 * set large in the heading face with its title as the label under it —
 * "14 years / In practice". A description list, so a screen reader reads the
 * label with its figure. A point with no figure shows its title alone.
 */
function FactsRow({ content }: { content: RenderedFeatures }) {
    const items = content.items.filter((item) => said(item.title) !== null);
    if (items.length === 0) return null;
    const note = said(content.note);
    const lead = Boolean(content.heading || content.intro);
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.heading ? (
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg text-[calc(1.875rem*var(--site-heading-scale))] font-bold tracking-tight"
                >
                    {content.heading}
                </h2>
            ) : null}
            {content.intro ? (
                <p className="text-site-body mt-3 max-w-2xl text-lg">
                    {content.intro}
                </p>
            ) : null}
            <dl
                className={cn(
                    "flex flex-wrap gap-x-12 gap-y-6",
                    lead && "mt-8",
                )}
            >
                {items.map((item, i) => (
                    <div key={i} className="flex min-w-0 flex-col-reverse">
                        <dt className="text-site-muted mt-1 text-[13px] leading-snug">
                            {item.title}
                        </dt>
                        {said(item.value) ? (
                            <dd className="font-site-heading text-site-fg text-[calc(1.5625rem*var(--site-heading-scale))] font-medium leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]">
                                {said(item.value)}
                            </dd>
                        ) : null}
                    </div>
                ))}
            </dl>
            {note ? <FeaturesNote text={note} /> : null}
        </section>
    );
}
