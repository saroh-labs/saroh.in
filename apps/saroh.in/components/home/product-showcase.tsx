import Image from "next/image";

/**
 * Real product screenshots, captured from app.saroh.in rather than mocked.
 *
 * This replaces a bento grid of placeholder skeletons — grey bars and magenta
 * dots standing in for a UI — which is the single least persuasive thing a
 * landing page can show. These three surfaces were chosen because they carry
 * the modularity story on their own: choosing capabilities by what the business
 * does, managing them afterwards, and a shell that only shows what is switched
 * on.
 *
 * `sizes` is set so the browser never downloads the 2x asset for a column it is
 * rendering at half width; `priority` is deliberately NOT set, since all of
 * these sit well below the fold.
 */
interface Shot {
    src: string;
    alt: string;
    eyebrow: string;
    title: string;
    body: string;
}

const SHOTS: Shot[] = [
    {
        src: "/product/choose.png",
        alt: "Saroh onboarding asking what the business needs to do, with capabilities like “Show up online”, “Take appointments” and “Sell products” shown as cards that can be switched on.",
        eyebrow: "Setup",
        title: "Chosen by what you do, not by plan tier",
        body: "You are asked what the business actually does. Nothing is bundled because it came with a pricing tier, and you can change the answer later.",
    },
    {
        src: "/product/modules.png",
        alt: "The Modules settings screen listing Website, CRM, Appointments, Payments, Communications and Automations, each with its setup state and an option to disable it.",
        eyebrow: "Control",
        title: "Turn things off without losing them",
        body: "Each module shows whether it is ready or still needs a step. Disabling one stops new activity — the history behind it stays exactly where it was.",
    },
    {
        src: "/product/home.png",
        alt: "The Saroh home screen showing a sidebar grouped into Customers, Appointments, Commerce, Website and Insights, beside a list of suggested next actions.",
        eyebrow: "Every day",
        title: "A workspace with only your modules in it",
        body: "The navigation is built from what you switched on, and the home screen leads with the next thing worth doing rather than an empty dashboard.",
    },
];

export function ProductShowcase() {
    return (
        <section className="border-t bg-background px-6 py-24 sm:py-28">
            <div className="mx-auto max-w-6xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    Inside Saroh
                </p>
                <h2 className="mt-4 max-w-[20ch] font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    This is the actual product.
                </h2>
                <p className="mt-4 max-w-[58ch] text-base text-muted-foreground">
                    No mockups. These are screens from the app you would be
                    using.
                </p>

                <div className="mt-16 space-y-20 sm:space-y-24">
                    {SHOTS.map((shot, i) => (
                        <article
                            key={shot.src}
                            className="grid items-center gap-8 lg:grid-cols-12 lg:gap-14"
                        >
                            <div
                                className={
                                    // Alternate sides so the eye zig-zags down
                                    // the page instead of scanning one gutter.
                                    i % 2 === 0
                                        ? "lg:col-span-4"
                                        : "lg:order-last lg:col-span-4"
                                }
                            >
                                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-highlight">
                                    {shot.eyebrow}
                                </p>
                                <h3 className="mt-3 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                                    {shot.title}
                                </h3>
                                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                    {shot.body}
                                </p>
                            </div>

                            <div className="lg:col-span-8">
                                <div className="overflow-hidden rounded-xl bg-card shadow-lg ring-1 ring-border/70">
                                    <Image
                                        src={shot.src}
                                        alt={shot.alt}
                                        width={1800}
                                        height={1125}
                                        sizes="(min-width: 1024px) 60vw, 100vw"
                                        className="h-auto w-full"
                                    />
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
