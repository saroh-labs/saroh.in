import { StatCard } from "@saroh/ui/stat-card";

import { Panel } from "@/components/panel";
import { countryName } from "@/lib/format";
import type { WaitlistSummary } from "@/lib/waitlist";
import { kindLabel } from "@/lib/waitlist-words";

/**
 * The waitlist's counts (plan U11): who is waiting, invited and new this
 * week. Free-tool email gates are not counted as waiting (admin audit F4);
 * the API keeps them apart and says how many.
 */
export function WaitlistTiles({ summary }: { summary: WaitlistSummary }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
                label="Waiting"
                value={summary.waiting}
                hint={
                    [
                        summary.oldestWaitingDays > 0
                            ? `longest for ${summary.oldestWaitingDays} days`
                            : null,
                        summary.fromTools > 0
                            ? `${summary.fromTools} from free tools not counted`
                            : null,
                    ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                }
            />
            <StatCard
                label="Invited"
                value={summary.invited}
                hint={
                    summary.joined > 0 ? `${summary.joined} joined` : undefined
                }
            />
            <StatCard
                label="Joined the list, last week"
                value={summary.joinedLastWeek}
            />
            <StatCard label="Sources" value={summary.bySource.length} />
        </div>
    );
}

/** Everyone still waiting, broken down: kind, source, city, country, referrers. */
export function WaitlistBreakdowns({ summary }: { summary: WaitlistSummary }) {
    return (
        <div className="grid gap-3 lg:grid-cols-2">
            <CountPanel
                title="Kind of business"
                description="Everyone still waiting, by the kind they picked."
                rows={summary.byKind.map((row) => ({
                    key: row.kind ?? "none",
                    label: kindLabel(row.kind),
                    count: row.count,
                }))}
            />
            <CountPanel
                title="Where they came from"
                description="Everyone still waiting, by the page or link they signed up from."
                rows={summary.bySource.map((row) => ({
                    key: row.source ?? "none",
                    label: row.source ?? "Not recorded",
                    count: row.count,
                }))}
            />
            <CountPanel
                title="Cities"
                description="The cities people typed, most first. City is optional."
                rows={summary.byCity.map((row) => ({
                    key: row.city.toLowerCase(),
                    label: row.city,
                    count: row.count,
                }))}
            />
            <CountPanel
                title="Countries"
                description="Where people joined from, as saroh.in saw their connection. Not recorded before 5 Oct 2026."
                rows={summary.byCountry.map((row) => ({
                    key: row.country ?? "none",
                    label: row.country
                        ? countryName(row.country)
                        : "Not recorded",
                    count: row.count,
                }))}
            />
            <CountPanel
                title="Top referrers"
                description="Who sent the most people through their link. A self-referral is not counted."
                rows={summary.topReferrers.map((row) => ({
                    key: row.id,
                    label: row.businessName ?? row.email,
                    count: row.referrals,
                }))}
            />
        </div>
    );
}

/** One breakdown of the list: a label and a count per line, biggest first. */
function CountPanel({
    title,
    description,
    rows,
}: {
    title: string;
    description: string;
    rows: { key: string; label: string; count: number }[];
}) {
    return (
        <Panel title={title} description={description}>
            {() =>
                rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing yet.
                    </p>
                ) : (
                    <ul className="grid gap-1.5 text-sm">
                        {rows.map((row) => (
                            <li
                                key={row.key}
                                className="flex justify-between gap-3"
                            >
                                <span className="min-w-0 truncate">
                                    {row.label}
                                </span>
                                <span className="tabular-nums">
                                    {row.count}
                                </span>
                            </li>
                        ))}
                    </ul>
                )
            }
        </Panel>
    );
}
