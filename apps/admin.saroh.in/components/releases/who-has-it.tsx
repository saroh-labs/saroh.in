"use client";

import { Badge } from "@saroh/ui/badge";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import Link from "next/link";
import { useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import type {
    AdminFlag,
    AdminOrganization,
    FlagExplanation,
} from "@/lib/control-plane";
import type { ReleaseChange, WhoRow } from "@/lib/releases";
import { QUICK_REASONS, releaseHref, whoHasIt } from "@/lib/releases";

import { REASON_LABEL } from "./release-actions";
import { applyChange, useReleaseFeedback } from "./use-release-change";

const SOURCE: Record<FlagExplanation["source"], string> = {
    OVERRIDE:
        "because it was turned that way for this business alone, which wins over the default",
    DEFAULT:
        "because that is the default for everyone, and this business follows it",
    UNCONFIGURED: "because this release has never been turned on for anyone",
    UNKNOWN_KEY:
        "because this is not a release the code knows, and an unknown one is off",
};

/** Most rows drawn at once; search narrows past it. */
const SHOW_AT_MOST = 200;

/**
 * Every business, what it gets and why: turned on or off for it alone, or
 * following the default. A business turned the same way as the default
 * changes nothing today but would the day the default moves, so it says so.
 * "Why?" asks the resolver itself, in place. Each name opens the business
 * (R11), and "Use the default…" is the one way back to the default.
 */
export function WhoHasIt({
    flag,
    organizations,
    canPublish,
    explained,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
    canPublish: boolean;
    explained: { organizationId: string; explanation: FlagExplanation } | null;
}) {
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();
    const rows = whoHasIt(flag, organizations).filter(
        (row) => !q || row.name.toLowerCase().includes(q),
    );
    const own = flag.overrides.length;

    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    {own === 0
                        ? "Every business follows the default."
                        : `${own} ${own === 1 ? "business is" : "businesses are"} turned on or off for them alone.`}
                </p>
                <div className="w-full sm:w-64">
                    <Label htmlFor="who-search" className="sr-only">
                        Search businesses
                    </Label>
                    <Input
                        id="who-search"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search businesses"
                        autoComplete="off"
                    />
                </div>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No business matches “{query.trim()}”.
                </p>
            ) : (
                <ul className="divide-y rounded-md border">
                    {rows.slice(0, SHOW_AT_MOST).map((row) => (
                        <WhoRowItem
                            key={row.organizationId}
                            flag={flag}
                            row={row}
                            canPublish={canPublish}
                            explanation={
                                explained?.organizationId === row.organizationId
                                    ? explained.explanation
                                    : null
                            }
                        />
                    ))}
                </ul>
            )}
            {rows.length > SHOW_AT_MOST && (
                <p className="text-xs text-muted-foreground">
                    Showing {SHOW_AT_MOST} of {rows.length}. Search to find the
                    rest.
                </p>
            )}
        </div>
    );
}

function WhoRowItem({
    flag,
    row,
    canPublish,
    explanation,
}: {
    flag: AdminFlag;
    row: WhoRow;
    canPublish: boolean;
    explanation: FlagExplanation | null;
}) {
    const feedback = useReleaseFeedback(flag);
    const why =
        row.override === null
            ? "follows the default"
            : `turned ${row.override ? "on" : "off"} for this business${row.sameAsDefault ? " · same as the default" : ""}`;
    const whyHref = `${releaseHref(flag.key, "who")}?organizationId=${encodeURIComponent(row.organizationId)}`;

    return (
        <li className="grid gap-1.5 px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                        href={`/businesses/${encodeURIComponent(row.organizationId)}`}
                        className="truncate font-medium underline-offset-2 hover:underline"
                    >
                        {row.name}
                    </Link>
                    <Badge variant={row.on ? "success" : "neutral"}>
                        {row.on ? "On" : "Off"}
                    </Badge>
                    <span className="text-muted-foreground">{why}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href={whyHref}
                        scroll={false}
                        className="text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        aria-label={`Why does ${row.name} have ${flag.metadata.shownAs} ${row.on ? "on" : "off"}?`}
                    >
                        Why?
                    </Link>
                    {canPublish && row.override !== null && (
                        <OperatorDialog
                            trigger="Use the default…"
                            triggerVariant="ghost"
                            title={`Use the default for ${row.name}?`}
                            effect={
                                <p>
                                    {row.name} follows the default for{" "}
                                    {flag.metadata.shownAs} again, and gets{" "}
                                    {row.sameAsDefault
                                        ? "the same as now"
                                        : `it ${(flag.enabledByDefault ?? false) ? "on" : "off"}`}
                                    .
                                </p>
                            }
                            submitLabel="Use the default"
                            quickReasons={QUICK_REASONS}
                            reasonLabel={REASON_LABEL}
                            onSubmit={async ({ reason, idempotencyKey }) => {
                                const change: ReleaseChange = {
                                    kind: "clear",
                                    organizationId: row.organizationId,
                                };
                                const result = await applyChange(
                                    flag.key,
                                    change,
                                    reason,
                                    idempotencyKey,
                                );
                                if (result.ok) {
                                    feedback(
                                        [{ change, name: row.name }],
                                        reason,
                                    );
                                }
                                return result;
                            }}
                        />
                    )}
                </div>
            </div>
            {explanation && (
                <p role="status" className="text-[13px] text-muted-foreground">
                    {row.name} has {flag.metadata.shownAs}{" "}
                    {explanation.value ? "on" : "off"}{" "}
                    {SOURCE[explanation.source]}.
                </p>
            )}
        </li>
    );
}
