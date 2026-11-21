"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { formatDate } from "@/lib/format/datetime";
import { initials } from "@/lib/names";
import { mayInclude, waitsForApproval } from "@/lib/sites/leave-out";
import type { ChangeUnit, SiteChanges } from "@/lib/sites/service";

/**
 * What publishing would change, by who changed it (U11, WXMPublish, RULES
 * §2): each change with Leave out (it stays in the draft, nothing is
 * lost), a teammate's change that waits for approval said as such, and
 * the posts that go live on their own Publish post.
 */
export function PublishChanges({
    siteId,
    changes,
    leftOut,
    canOverride,
    zone,
    onToggle,
    onAsk,
}: {
    siteId: string;
    changes: SiteChanges;
    leftOut: ReadonlySet<string>;
    /** An owner, who may put in a change that waits for approval. */
    canOverride: boolean;
    zone: string;
    onToggle: (key: string) => void;
    /** Ask the change's approver to look (a review request). */
    onAsk?: (name: string) => void;
}) {
    const byKey = new Map(changes.units.map((u) => [u.key, u]));
    const required = changes.approvalRequired === true;
    return (
        <>
            <ul className="grid gap-4" data-publish-changes="">
                {changes.groups.map((group) => {
                    const units = group.units
                        .map((k) => byKey.get(k))
                        .filter((u): u is ChangeUnit => u !== undefined);
                    if (units.length === 0) return null;
                    const name = group.you
                        ? "You"
                        : (group.name ?? "Changed earlier");
                    return (
                        <li key={group.userId ?? "earlier"}>
                            <h3 className="flex items-center gap-2 pb-1.5 text-sm font-semibold">
                                {group.userId ? (
                                    <span
                                        aria-hidden
                                        className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.6875rem] font-semibold"
                                    >
                                        {initials(group.name)}
                                    </span>
                                ) : null}
                                <span className="min-w-0 flex-1 truncate">
                                    {name}
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                    {units.length}
                                </span>
                            </h3>
                            <ul className="divide-y rounded-lg border">
                                {units.map((unit) => (
                                    <UnitRow
                                        key={unit.key}
                                        unit={unit}
                                        out={leftOut.has(unit.key)}
                                        waiting={waitsForApproval(
                                            unit,
                                            required,
                                        )}
                                        canInclude={mayInclude(
                                            unit,
                                            required,
                                            canOverride,
                                        )}
                                        zone={zone}
                                        onToggle={onToggle}
                                        onAsk={onAsk}
                                    />
                                ))}
                            </ul>
                        </li>
                    );
                })}
            </ul>
            {changes.posts.length > 0 ? (
                <section aria-label="Posts publish on their own">
                    <h3 className="flex items-center gap-2 pb-1.5 text-sm font-semibold">
                        <span className="flex-1">
                            Posts publish on their own
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                            {changes.posts.length}
                        </span>
                    </h3>
                    <ul className="divide-y rounded-lg border">
                        {changes.posts.map((post) => (
                            <li
                                key={post.id}
                                className="flex items-start gap-3 px-3 py-2"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                                        {post.title}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        Not live yet · edited{" "}
                                        {formatDate(post.updatedAt, zone)}
                                    </span>
                                </span>
                                <Button
                                    asChild
                                    variant="link"
                                    size="sm"
                                    className="h-auto shrink-0 p-0 font-semibold coarse:min-h-11"
                                >
                                    <Link
                                        href={`/sites/${siteId}/posts/${post.id}`}
                                    >
                                        Open
                                    </Link>
                                </Button>
                            </li>
                        ))}
                    </ul>
                    <p className="pt-1.5 text-xs text-muted-foreground">
                        Not part of this publish. Each post has its own Publish
                        post.
                    </p>
                </section>
            ) : null}
        </>
    );
}

function UnitRow({
    unit,
    out,
    waiting,
    canInclude,
    zone,
    onToggle,
    onAsk,
}: {
    unit: ChangeUnit;
    out: boolean;
    waiting: boolean;
    canInclude: boolean;
    zone: string;
    onToggle: (key: string) => void;
    onAsk?: (name: string) => void;
}) {
    const approval = unit.approval;
    const approver = approval.approvers[0]?.name ?? null;
    const line = [
        unit.where,
        unit.editedAt ? formatDate(unit.editedAt, zone) : null,
        approval.state === "approved" && approval.by?.name
            ? `${approval.by.name} approved it`
            : null,
    ]
        .filter(Boolean)
        .join(" · ");
    const state =
        waiting && approval.state === "asked"
            ? `${approval.by?.name ?? "A reviewer"} asked for changes${approval.reason ? `: “${approval.reason}”` : ""}`
            : waiting
              ? `Waiting for ${approver ? `${approver}’s` : "an"} approval${out ? " · left out, stays in the draft" : ""}`
              : out
                ? "Left out · stays in the draft"
                : null;
    return (
        <li
            data-unit={unit.key}
            data-left-out={out ? "" : undefined}
            className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2"
        >
            <span className="min-w-0 flex-1">
                <span
                    className={cn(
                        "block text-sm font-medium [overflow-wrap:anywhere]",
                        out && "text-muted-foreground",
                    )}
                >
                    {unit.label}
                </span>
                <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {line}
                </span>
                {state ? (
                    <span
                        className={cn(
                            "block text-xs",
                            waiting
                                ? "text-warning-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {state}
                    </span>
                ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-3">
                {waiting && approver && onAsk ? (
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 font-semibold coarse:min-h-11"
                        onClick={() => onAsk(approver)}
                    >
                        Ask {approver}
                    </Button>
                ) : null}
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 font-semibold coarse:min-h-11"
                    aria-label={`${out ? "Include" : "Leave out"}: ${unit.label}`}
                    disabled={out && !canInclude}
                    onClick={() => onToggle(unit.key)}
                >
                    {out ? "Include" : "Leave out"}
                </Button>
            </span>
        </li>
    );
}
