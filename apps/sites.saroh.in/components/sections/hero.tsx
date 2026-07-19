import type { HeroContent } from "@/lib/publication";

import { CtaButton } from "./cta";

/**
 * `hero` v1 — a headline block with optional subheading, CTA and image.
 * Responsive: single column on mobile, two columns (copy + image) on large
 * screens when an image is present.
 */
export default function HeroSection({ content }: { content: HeroContent }) {
    const hasImage = Boolean(content.image?.src);
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-16 sm:px-8 sm:py-24">
            <div
                className={
                    hasImage
                        ? "grid items-center gap-10 lg:grid-cols-2"
                        : "mx-auto max-w-3xl text-center"
                }
            >
                <div className={hasImage ? "" : "flex flex-col items-center"}>
                    <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl md:text-6xl">
                        {content.heading}
                    </h1>
                    {content.subheading ? (
                        <p className="mt-6 max-w-2xl text-lg text-stone-600 dark:text-stone-300 sm:text-xl">
                            {content.subheading}
                        </p>
                    ) : null}
                    {content.cta ? (
                        <div className="mt-8">
                            <CtaButton content={content.cta} />
                        </div>
                    ) : null}
                </div>
                {content.image?.src ? (
                    // Remote publication images from arbitrary tenant origins —
                    // a plain <img> avoids next/image's per-domain allowlist.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={content.image.src}
                        alt={content.image.alt ?? ""}
                        width={content.image.width}
                        height={content.image.height}
                        className="h-auto w-full rounded-xl object-cover"
                    />
                ) : null}
            </div>
        </section>
    );
}
