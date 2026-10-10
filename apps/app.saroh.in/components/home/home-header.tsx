import { PageHeader } from "@saroh/ui/page-header";

import { dateLine, greeting, sinceLinks } from "@/lib/home/last-day";
import type { HomeLastDay } from "@/lib/home/service";
import { TextLink } from "@saroh/ui/text-link";

/**
 * Home's page header (round 2, F6), the one every screen draws: the greeting in the
 * business's part of the day, the business's date and name, and "Last 24
 * hours" — each figure a link to exactly the rows it counts (`?since=`).
 *
 * It replaces the page title "Home": the rail already says where you are,
 * and the design spends the line on who and when instead. The strip is left
 * out for a new business and on a quiet day, never drawn as zeros; a strip
 * that couldn't be read is named in the notice under it, with the rest.
 */
export function HomeHeader({
    lastDay,
    name,
    businessName,
    only = null,
    kind,
}: {
    lastDay: HomeLastDay | null;
    /** The viewer's own name, from their session. */
    name: string | null | undefined;
    businessName: string;
    /** A staff member's storefronts, "Hill Road only" (F11); else null. */
    only?: string | null;
    /** What is being set up (DEC-070); its words for a new business. */
    kind?: unknown;
}) {
    const links = sinceLinks(lastDay);

    return (
        <PageHeader
            className="mb-0"
            breadcrumb={["Home"]}
            title={greeting(lastDay, name)}
            description={
                <>
                    <p>{dateLine(lastDay, businessName, only, kind)}</p>
                    {links.length > 0 ? (
                        <div
                            role="group"
                            aria-labelledby="home-last-24-hours"
                            className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-[13px] text-foreground/80"
                        >
                            <span id="home-last-24-hours" className="label">
                                Last 24 hours
                            </span>
                            {links.map((link) => (
                                <TextLink key={link.key} href={link.href}>
                                    {link.label}
                                </TextLink>
                            ))}
                        </div>
                    ) : null}
                </>
            }
        />
    );
}
