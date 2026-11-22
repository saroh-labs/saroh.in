"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { FlaskConical } from "lucide-react";

import { formatDate, formatDateTime } from "@/lib/format/datetime";
import { initials } from "@/lib/names";
import { releaseTitle, versionRowCopy } from "@/lib/sites/release-review";
import type { SitePublication } from "@/lib/sites/service";

import type { EditorModel } from "../shell/editor-model";

/** History's rows (U46b): who, what, when, as `fix/WXEHistory` draws them. */

export function Who({ name, className }: { name: string; className?: string }) {
    return (
        <span
            aria-hidden
            className={cn(
                "grid size-[30px] shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold",
                className,
            )}
        >
            {initials(name)}
        </span>
    );
}

export const ROW =
    "flex w-full items-start gap-2.5 border-t py-2.5 pl-4 pr-3 text-left first:border-t-0";
/** A row that opens something: the Button, laid out as a row. */
export const ROW_BUTTON =
    "h-auto justify-start whitespace-normal rounded-none font-normal hover:bg-card";

type VersionItem =
    | { kind: "version"; at: string; version: SitePublication }
    | {
          kind: "test";
          at: string;
          id: string;
          by: string | null;
          title: string;
      };

export function VersionRows({
    versions,
    releases,
    zone,
    comparing,
    onCompare,
    onOpenTestLinks,
}: {
    versions: SitePublication[];
    releases: EditorModel["releases"]["releases"];
    zone: string;
    comparing: string | null;
    onCompare: (version: SitePublication) => void;
    onOpenTestLinks: () => void;
}) {
    const items: VersionItem[] = [
        ...versions.map((v) => ({
            kind: "version" as const,
            at: v.publishedAt,
            version: v,
        })),
        ...releases
            .filter((r) => r.discardedAt === null)
            .map((r) => ({
                kind: "test" as const,
                at: r.createdAt,
                id: r.id,
                by: r.createdBy.name,
                title: releaseTitle(r),
            })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    if (items.length === 0) {
        return (
            <EmptyState
                size="inline"
                className="px-4"
                title="No versions yet"
                description="Each time you publish, the version is kept here."
            />
        );
    }
    return (
        <ul data-history-versions="">
            {items.map((item) => {
                if (item.kind === "test") {
                    const by = item.by ?? "Someone";
                    return (
                        <li key={`t-${item.id}`}>
                            <Button
                                type="button"
                                variant="ghost"
                                data-ph-mask=""
                                className={cn(ROW, ROW_BUTTON)}
                                onClick={onOpenTestLinks}
                            >
                                <Who name={by} />
                                <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-muted-foreground">
                                    <b className="font-semibold text-foreground">
                                        {by}
                                    </b>{" "}
                                    shared a test link, “{item.title}”
                                    <span className="mt-0.5 block text-xs">
                                        {formatDate(item.at, zone)}
                                    </span>
                                </span>
                                <Badge variant="neutral">
                                    <FlaskConical
                                        aria-hidden
                                        className="size-3"
                                    />
                                    Test
                                </Badge>
                            </Button>
                        </li>
                    );
                }
                const v = item.version;
                const by = v.publishedBy ?? "Someone";
                const badges = versionRowCopy(v).badges;
                return (
                    <li key={v.id}>
                        <Button
                            type="button"
                            variant="ghost"
                            data-ph-mask=""
                            aria-pressed={comparing === v.id}
                            aria-label={`Compare ${formatDateTime(v.publishedAt, zone)} with your draft`}
                            className={cn(
                                ROW,
                                ROW_BUTTON,
                                comparing === v.id &&
                                    "bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))]",
                            )}
                            onClick={() => onCompare(v)}
                        >
                            <Who name={by} />
                            <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-muted-foreground">
                                <b className="font-semibold text-foreground">
                                    {by}
                                </b>{" "}
                                {v.testRelease
                                    ? "put a test link live"
                                    : "published"}
                                <span className="mt-0.5 block text-xs">
                                    {formatDateTime(v.publishedAt, zone)}
                                    {v.isCurrent ? " · Live now" : ""}
                                </span>
                            </span>
                            {badges.map((b) => (
                                <Badge key={b.label} variant={b.tone}>
                                    {b.label}
                                </Badge>
                            ))}
                        </Button>
                    </li>
                );
            })}
        </ul>
    );
}
