import { MODULES } from "./modules";

/**
 * The modules grid — the actual differentiator, so it gets the most page.
 *
 * Every card is a real entry from the API's module registry, dependencies
 * included. The `needs` line is the honest version of the modularity claim:
 * these compose rather than merely coexisting, and saying "Needs CRM" out loud
 * is more credible than a wall of equal-looking feature tiles.
 *
 * This replaces a bento grid of placeholder skeletons — grey bars and magenta
 * dots standing in for screenshots — which told a visitor nothing about what
 * the product does.
 */
export function ModulesSection() {
    return (
        <section
            id="modules"
            className="scroll-mt-16 border-t bg-background px-6 py-24 sm:py-28"
        >
            <div className="mx-auto max-w-6xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    The modules
                </p>
                <h2 className="mt-4 max-w-[20ch] font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Start with one. Add the rest when you need them.
                </h2>
                <p className="mt-4 max-w-[58ch] text-base text-muted-foreground">
                    Nothing is bundled by default. A studio taking bookings and
                    a shop shipping orders run the same platform with different
                    modules switched on.
                </p>

                <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
                    {MODULES.map((module) => (
                        <li
                            key={module.key}
                            className="duration-base group relative flex flex-col bg-card p-6 transition-colors ease-out hover:bg-brand-subtle/40"
                        >
                            <span
                                aria-hidden
                                className="duration-base mb-5 block h-1.5 w-1.5 rounded-full bg-highlight opacity-60 transition-opacity group-hover:opacity-100"
                            />
                            <h3 className="text-sm font-semibold text-foreground">
                                {module.label}
                            </h3>
                            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                                {module.blurb}
                            </p>
                            {module.needs ? (
                                <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                                    Needs {module.needs.join(" + ")}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
