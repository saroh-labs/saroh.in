import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { MODULES } from "@/lib/modules";

/**
 * The close. Every module is linked here, which is the cheapest real
 * improvement to a marketing site's internal linking — and it means a visitor
 * who scrolled past the table still has one route into each page.
 */
export function SiteFooter() {
    return (
        <footer className="border-t border-border">
            <div className="mx-auto max-w-6xl px-6 py-14">
                <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
                    <div>
                        <Wordmark style={{ fontSize: "1.0625rem" }} />
                        <p className="mt-3 max-w-[34ch] text-[13.5px] leading-relaxed text-muted-foreground">
                            Website, commerce, appointments and CRM in one
                            system. Switch on only what your business needs.
                        </p>
                    </div>

                    <nav aria-label="Modules">
                        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            Modules
                        </h2>
                        <ul className="mt-4 grid gap-2">
                            {MODULES.slice(0, 4).map((m) => (
                                <li key={m.slug}>
                                    <Link
                                        href={`/modules/${m.slug}`}
                                        className="text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {m.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <nav aria-label="More modules">
                        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            &nbsp;
                        </h2>
                        <ul className="mt-4 grid gap-2">
                            {MODULES.slice(4).map((m) => (
                                <li key={m.slug}>
                                    <Link
                                        href={`/modules/${m.slug}`}
                                        className="text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {m.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>

                <div className="mt-12 flex flex-wrap justify-between gap-4 border-t border-border pt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>Saroh — modular business platform</span>
                    {/* Stated plainly wherever a screenshot appears: the data in
                        every screen on this site is seeded demo data, not a
                        customer's. */}
                    <span>Screens show seeded demo data</span>
                </div>
            </div>
        </footer>
    );
}
