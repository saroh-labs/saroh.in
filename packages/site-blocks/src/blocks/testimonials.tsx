import type { RenderedTestimonials } from "@saroh/block-contract";

/**
 * `testimonials` v1 — what customers said, under their names (#255).
 *
 * `<figure>` with a `<blockquote>` and a `<figcaption>`, so the quote and who
 * said it stay tied together for a screen reader. One column on a phone; at
 * most three side by side, the same cap `features` uses.
 *
 * Drawn from `--site-*` only; gate G2 fails the build otherwise.
 */
export default function TestimonialsSection({
    content,
}: {
    content: RenderedTestimonials;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.heading ? (
                <h2 className="text-site-fg text-[calc(1.875rem*var(--site-heading-scale))] font-bold tracking-tight">
                    {content.heading}
                </h2>
            ) : null}

            <ul className="mt-10 grid gap-[var(--site-grid-gap)] sm:grid-cols-2 lg:grid-cols-3">
                {content.items.map((item, i) => (
                    <li key={i}>
                        <figure className="border-site-border bg-site-surface flex h-full flex-col justify-between gap-6 rounded-[var(--site-radius)] border p-6">
                            <blockquote className="text-site-fg whitespace-pre-line text-lg leading-relaxed">
                                “{item.quote}”
                            </blockquote>
                            <figcaption className="text-sm">
                                <span className="text-site-fg block font-semibold">
                                    {item.name}
                                </span>
                                {item.role ? (
                                    <span className="text-site-muted block">
                                        {item.role}
                                    </span>
                                ) : null}
                            </figcaption>
                        </figure>
                    </li>
                ))}
            </ul>
        </section>
    );
}
