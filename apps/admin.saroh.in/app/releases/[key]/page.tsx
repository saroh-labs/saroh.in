import Link from "next/link";

import { ReleaseHistory } from "@/components/releases/release-history";
import { flagHistory } from "@/lib/control-plane";
import { releaseForTab } from "@/lib/release-data";
import { releaseCounts, releaseHref } from "@/lib/releases";

/** The newest changes the Overview shows. */
const RECENT = 3;

/**
 * A release at a glance (R11): what it is for, the default, how many
 * businesses are turned on or off for them alone, how many follow the
 * default, and its last few changes.
 */
export default async function ReleaseOverviewPage({
    params,
}: {
    params: Promise<{ key: string }>;
}) {
    const data = await releaseForTab(params);
    if (!data) return null;
    const { flag, organizations } = data;
    const history = await flagHistory(flag.key).catch(() => null);
    const counts = releaseCounts(flag, organizations);

    return (
        <div className="grid gap-6">
            <p className="max-w-[68ch] text-sm">{flag.metadata.purpose}</p>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure
                    label="Default for everyone"
                    value={counts.defaultLabel}
                />
                <Figure
                    label="Turned on for them alone"
                    value={counts.turnedOn}
                />
                <Figure
                    label="Turned off for them alone"
                    value={counts.turnedOff}
                />
                <Figure
                    label={counts.followingLabel}
                    value={counts.following}
                />
            </dl>
            <p className="text-sm text-muted-foreground">
                {counts.have} of {counts.total}{" "}
                {counts.total === 1 ? "business has" : "businesses have"} it
                now.{" "}
                <Link
                    href={releaseHref(flag.key, "who")}
                    className="text-foreground underline underline-offset-2"
                >
                    See who has it
                </Link>
            </p>
            <section className="grid gap-3" aria-labelledby="recent-changes">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2
                        id="recent-changes"
                        className="text-[15px] font-semibold"
                    >
                        Recent changes
                    </h2>
                    {history && history.length > RECENT && (
                        <Link
                            href={releaseHref(flag.key, "history")}
                            className="text-sm underline underline-offset-2"
                        >
                            See all changes
                        </Link>
                    )}
                </div>
                <ReleaseHistory history={history} limit={RECENT} />
            </section>
        </div>
    );
}

function Figure({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="grid content-start gap-1 rounded-md border p-3">
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
    );
}
