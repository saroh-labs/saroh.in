import Link from "next/link";

/**
 * The hero.
 *
 * Sits on `brand-surface` — the FILL token, which stays deep in both themes —
 * not `brand`, which lightens in dark mode for interactive contrast. Using the
 * wrong one is exactly what turns a hero pale; see @saroh/ui globals.css.
 *
 * The reveal is one orchestrated page-load stagger driven by animation delays,
 * rather than scattered micro-interactions, and it is CSS-only so nothing
 * blocks paint. @saroh/ui neutralises all durations under
 * prefers-reduced-motion, and `motion-reduce:animate-none` opts each element
 * out of the entrance entirely.
 */
export function Hero() {
    return (
        <section className="relative isolate overflow-hidden bg-brand-surface">
            {/* Texture rather than a flat fill: a faint grid, plus a cool bloom
                pushed off-centre so the composition is asymmetric.
                The bloom is the brand hue, NOT the lime accent — lime at low
                opacity over navy muddies into olive. The accent stays sharp and
                small (the eyebrow and the primary button), which is what makes
                it read as an accent rather than a wash. */}
            <div
                aria-hidden
                className="absolute inset-0 bg-grid-small-white/[0.05]"
            />
            <div
                aria-hidden
                className="absolute -top-48 right-[-14%] h-[36rem] w-[36rem] rounded-full bg-brand/20 blur-3xl"
            />
            <div
                aria-hidden
                className="absolute -top-24 right-[6%] h-56 w-56 rounded-full bg-highlight/10 blur-2xl"
            />
            <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-brand-surface to-transparent"
            />

            <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-28 sm:pb-32 sm:pt-36">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-highlight duration-700 animate-in fade-in slide-in-from-bottom-3 fill-mode-both motion-reduce:animate-none">
                    Modular business platform
                </p>

                <h1 className="mt-6 max-w-[16ch] font-display text-5xl font-bold leading-[1.02] tracking-tight text-white delay-100 duration-700 animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none sm:text-6xl md:text-7xl">
                    Run your whole business from one place.
                </h1>

                <p className="mt-7 max-w-[52ch] text-lg text-white/70 delay-200 duration-700 animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none sm:text-xl">
                    Website, commerce, appointments and CRM in one system —
                    switch on only the modules you need, and add the rest when
                    the business is ready for them.
                </p>

                <div className="mt-10 flex flex-wrap items-center gap-3 delay-300 duration-700 animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none">
                    <Link
                        href="#waitlist"
                        className="inline-flex h-11 items-center rounded-lg bg-highlight px-6 text-sm font-semibold text-highlight-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
                    >
                        Join the waitlist
                    </Link>
                    <Link
                        href="#modules"
                        className="inline-flex h-11 items-center rounded-lg border border-white/20 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                        See the modules
                    </Link>
                </div>

                <p className="mt-6 text-sm text-white/45 delay-500 duration-700 animate-in fade-in fill-mode-both motion-reduce:animate-none">
                    Eight modules. Switch any of them off without losing the
                    data behind them.
                </p>
            </div>
        </section>
    );
}

export default Hero;
