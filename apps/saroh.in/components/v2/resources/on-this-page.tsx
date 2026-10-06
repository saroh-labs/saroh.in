import { QUIET_LINK } from "./styles";

export interface PageHeading {
    /** The heading's `id`, which its link jumps to. */
    id: string;
    text: string;
}

/**
 * "On this page" (plan U1, R1): the page's own headings, down the right
 * from 1100px wide. Narrower, the page is short enough to scroll, so it
 * isn't drawn.
 */
export function OnThisPage({ headings }: { headings: PageHeading[] }) {
    if (headings.length < 2) return null;
    return (
        <nav
            aria-label="On this page"
            className="hidden min-w-0 min-[1100px]:block"
        >
            <div className="sticky top-6 grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    On this page
                </span>
                <ul className="m-0 grid list-none gap-1.5 border-l border-border p-0 pl-3.5 text-[13.5px] leading-[1.4]">
                    {headings.map((h) => (
                        <li key={h.id}>
                            <a href={`#${h.id}`} className={QUIET_LINK}>
                                {h.text}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </nav>
    );
}
