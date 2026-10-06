import type { RenderedFeatures } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

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
    const isSteps = variant === "steps";
    const isList = variant === "list" || isSteps;
    const List = isSteps ? "ol" : "ul";

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
                        ? "mt-10 grid gap-[var(--site-grid-gap)]"
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
        </section>
    );
}
