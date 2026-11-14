import type { FeatureAppList } from "../content/types";
import { CardLink } from "../links/card-link";
import { Section } from "./section";

/**
 * AI apps' "Apps you can use" (board VFAiApps): a card for each app the
 * site lists as live, then the apps named in one line. The site passes only
 * its live cards; names are set in type, never a logo or letter tile (R21).
 */
export function AppList({
    words,
    apps,
}: {
    words: FeatureAppList;
    apps: readonly {
        href: string;
        name: string;
        /** "AI assistant", "Automation". */
        kind?: string;
        line: string;
        /** The card's link words: "See Claude". */
        cta: string;
    }[];
}) {
    return (
        <Section
            titleId="apps-you-can-use"
            title={words.title}
            lead={words.lead}
            className="grid gap-7 pt-[130px]"
        >
            {/* auto-fill: two live apps keep the board's four-across card width. */}
            {apps.length > 0 ? (
                <ul className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,max(220px,calc((100%_-_48px)/4))),1fr))]">
                    {apps.map((app) => (
                        <li key={app.href} className="grid">
                            <CardLink
                                href={app.href}
                                title={app.name}
                                body={app.line}
                                meta={app.kind}
                                action={app.cta}
                            />
                        </li>
                    ))}
                </ul>
            ) : null}
            <p className="m-0 max-w-[80ch] text-mk-card-body text-mk-copy [text-wrap:pretty]">
                {words.also}
            </p>
        </Section>
    );
}
