import type { ApiUsageScope, ApiUsageView } from "@saroh/api-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { LimitReachedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { ListTable } from "@saroh/ui/list-table";
import { ProgressBar } from "@saroh/ui/progress-bar";

import { formatTime } from "@/lib/format/datetime";
import { helpHomeUrl } from "@/lib/help/links";
import { RefreshButton } from "./refresh-button";

const SURFACE: Record<
    ApiUsageScope,
    { name: string; term?: string; per: string; one: string }
> = {
    mcp: {
        name: "AI assistants",
        per: "calls a minute, the whole business",
        one: "calls a minute from AI assistants",
    },
    secret: {
        name: "Your server and tools",
        term: "server keys",
        per: "requests a minute, all server keys",
        one: "requests a minute from your server and tools",
    },
    storefront: {
        name: "Your website",
        term: "website keys",
        per: "requests a minute, all website keys",
        one: "requests a minute from your website",
    },
};

interface Row {
    name: string;
    term?: string;
    used: number;
    cap: number | null;
    per: string;
    /** At a per-minute cap: calls are refused this minute. */
    refusing: boolean;
}

function rowsOf(usage: ApiUsageView): Row[] {
    const rows: Row[] = usage.minute.map((m) => ({
        ...SURFACE[m.scope],
        used: m.used,
        cap: m.cap,
        refusing: m.cap > 0 && m.used >= m.cap,
    }));
    if (usage.keys && usage.keys.open.length > 0) {
        rows.push({
            name: "Keys",
            used: usage.keys.count,
            cap: usage.keys.cap,
            per: "keys",
            refusing: false,
        });
    }
    if (usage.webhooks?.open) {
        rows.push({
            name: "Notification addresses",
            term: "webhooks",
            used: usage.webhooks.count,
            cap: usage.webhooks.cap,
            per: "addresses",
            refusing: false,
        });
    }
    return rows;
}

/**
 * Settings › API and AI apps › Usage ("API and AI apps" board 6): this
 * minute's calls against the business's own caps, and its keys and
 * addresses against theirs. The numbers are the API's, read from the
 * business's plan; none is written here. A surface at its cap says what
 * happens; going over is never charged.
 */
export function Usage({
    usage,
    plan,
    upgrade,
    zone,
}: {
    usage: ApiUsageView;
    /** "Pro": the plan the caps are from, when known. */
    plan: string | null;
    /** A plan with more room, and where it is; none at the top. */
    upgrade: { plan: string; href: string } | null;
    zone: string;
}) {
    const rows = rowsOf(usage);
    const full = usage.minute.find((m) => m.cap > 0 && m.used >= m.cap);
    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
                <h2 data-ph-unmask="" className="text-[15px] font-semibold">
                    This minute
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    {plan ? `${plan} plan limits · ` : ""}as of{" "}
                    {formatTime(usage.at, zone)}
                </span>
                <span className="ml-auto">
                    <RefreshButton />
                </span>
            </div>
            <div className="grid gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0">
                    <ListTable>
                        <ul>
                            {rows.map((r) => (
                                <li
                                    key={r.name}
                                    data-usage-row={r.name}
                                    className="grid min-h-14 items-center gap-x-3 gap-y-1.5 border-b border-border px-[14px] py-[11px] text-[13.5px] last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.8fr)]"
                                >
                                    <span className="font-semibold">
                                        {r.name}
                                        {r.term ? (
                                            <small className="ml-1.5 text-[11.5px] font-medium text-muted-foreground">
                                                {r.term}
                                            </small>
                                        ) : null}
                                    </span>
                                    {r.cap ? (
                                        <ProgressBar
                                            value={r.used}
                                            max={r.cap}
                                            tone={r.refusing ? "danger" : "ink"}
                                            label={`${r.used} of ${r.cap} ${r.per}`}
                                        />
                                    ) : (
                                        <span className="max-sm:hidden" />
                                    )}
                                    <span>
                                        <b className="tabular-nums">{r.used}</b>
                                        {r.cap ? (
                                            <span className="tabular-nums">
                                                {" "}
                                                of {r.cap}
                                            </span>
                                        ) : null}
                                        <span className="block text-[12.5px] text-muted-foreground">
                                            {r.per}
                                        </span>
                                        {r.refusing ? (
                                            <Badge
                                                variant="warning"
                                                size="sm"
                                                className={cn("mt-1 w-fit")}
                                            >
                                                Calls are being refused this
                                                minute
                                            </Badge>
                                        ) : null}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </ListTable>
                    <p
                        data-ph-unmask=""
                        className="mt-2.5 text-[12.5px] text-muted-foreground"
                    >
                        Going over is never charged.
                    </p>
                </div>
                {full ? (
                    <LimitReachedState
                        size="panel"
                        className="self-start"
                        title={`You're at ${full.cap} ${SURFACE[full.scope].one}.`}
                        description={
                            upgrade
                                ? "Calls over it are refused for the rest of this minute and work again the next."
                                : "Calls over it are refused for the rest of this minute and work again the next. This is the most a plan allows."
                        }
                        plan={upgrade?.plan}
                        href={upgrade?.href}
                        secondary={
                            upgrade ? undefined : (
                                <Button asChild variant="outline" size="sm">
                                    <a
                                        href={helpHomeUrl()}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Contact us
                                    </a>
                                </Button>
                            )
                        }
                    />
                ) : null}
            </div>
        </div>
    );
}
