import type { RenderedFaq } from "@saroh/block-contract";

/**
 * `faq` v1 — questions and their answers (#255).
 *
 * Native `<details>`: each answer opens with a tap, a click or the keyboard,
 * with no JavaScript, and a visitor's find-in-page still reaches a closed
 * answer in browsers that support it. Answers keep the merchant's line breaks.
 *
 * Drawn from `--site-*` only; gate G2 fails the build otherwise.
 */
export default function FaqSection({ content }: { content: RenderedFaq }) {
    return (
        <section className="mx-auto w-full max-w-3xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.heading ? (
                <h2 className="text-site-fg text-[calc(1.875rem*var(--site-heading-scale))] font-bold tracking-tight">
                    {content.heading}
                </h2>
            ) : null}
            {content.intro ? (
                <p className="text-site-body mt-3 text-lg">{content.intro}</p>
            ) : null}

            <div className="border-site-border mt-8 border-t">
                {content.items.map((item, i) => (
                    <details
                        key={i}
                        className="border-site-border group border-b"
                    >
                        <summary className="text-site-fg focus-visible:ring-site-accent flex cursor-pointer list-none items-start justify-between gap-4 py-4 font-medium focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                            <span>{item.question}</span>
                            {/* Decorative: `<details>` already tells a screen
                                reader whether it is open. */}
                            <span
                                aria-hidden="true"
                                className="text-site-muted shrink-0 transition-transform group-open:rotate-45"
                            >
                                +
                            </span>
                        </summary>
                        <p className="text-site-body whitespace-pre-line pb-5 leading-relaxed">
                            {item.answer}
                        </p>
                    </details>
                ))}
            </div>
        </section>
    );
}
