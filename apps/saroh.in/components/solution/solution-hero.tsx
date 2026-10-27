import Link from "next/link";

import type { Solution } from "@/content/types";
import { demoHref, demoTrade } from "@/lib/demos";
import { ring } from "@/lib/ring";

import { ProductHero } from "../shared/sections/product-hero";

/**
 * The top of a solution page, drawn by `ProductHero`: "Solutions / Gyms &
 * studios", then the trade's words, its live demo, the hero shot and its
 * note. A page with no screen of its trade captured yet has neither
 * (`Solution.hero`).
 */
export function SolutionHero({
    solution,
    freeLine,
}: {
    solution: Solution;
    /** The free-plan line, from the catalogue (`freePlanLine`). */
    freeLine: string;
}) {
    const trade = demoTrade(solution.slug);
    return (
        <ProductHero
            crumb={
                <nav
                    aria-label="Breadcrumb"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <Link
                        href="/#solutions"
                        className={`rounded-sm text-muted-foreground no-underline hover:text-foreground ${ring()}`}
                    >
                        Solutions
                    </Link>
                    <span aria-hidden>/</span>
                    <span
                        aria-current="page"
                        className="font-semibold text-brand-700"
                    >
                        {solution.name}
                    </span>
                </nav>
            }
            headline={solution.headline}
            sub={solution.sub}
            actions={{
                src: `solutions-${solution.slug}-hero`,
                demo: {
                    href: demoHref(trade),
                    page: `solutions-${solution.slug}`,
                    trade,
                },
            }}
            freeLine={freeLine}
            shot={solution.hero}
            note={solution.heroNote}
        />
    );
}
