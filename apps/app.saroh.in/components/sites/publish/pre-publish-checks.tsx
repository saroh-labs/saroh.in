"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Check, CircleAlert } from "lucide-react";
import { useState } from "react";

import type { Flag, SitePage } from "@/lib/sites/service";
import { DescribePhotoDialog } from "./describe-photo-dialog";
import { checkRows, FIX_WORD } from "./pre-publish-words";

/**
 * "Checked before you publish" (plan U10, WXMPublish): prices match
 * Services, no "free" that isn't, every link works, every photo has a
 * description. Drawn at the top of the Publish sheet (U11). Advice only:
 * nothing here stops Publish. Each problem has its fix: a photo is
 * described here; anything else opens its place on the page (`onShow`).
 */
export function PrePublishChecks({
    siteId,
    flags,
    pages,
    onShow,
    onChanged,
}: {
    siteId: string;
    /** The site's flags (`getSiteFlags`); only the checks' types are read. */
    flags: readonly Flag[];
    pages: readonly Pick<SitePage, "id" | "title">[];
    onShow: (flag: Flag) => void;
    /** A photo was described: read the flags again. */
    onChanged: () => void;
}) {
    const [describing, setDescribing] = useState<Flag | null>(null);
    const pageTitle = (flag: Flag) =>
        pages.find((p) => p.id === flag.pageId)?.title ?? "This site";
    const rows = checkRows(flags);

    const lower = (t: string) => t[0].toLowerCase() + t.slice(1);
    const ok = rows.filter((r) => r.ok);
    const problems = rows.filter((r) => !r.ok);

    // One summary line, each check named in it, a problem in bold (P2,
    // `fix/WXNPublish`); each problem's fixes under it.
    return (
        <section
            aria-label="Checked before you publish"
            data-pre-publish-checks=""
            data-all-ok={problems.length === 0 ? "" : undefined}
            className="grid gap-1.5 text-sm"
        >
            <p
                className={cn(
                    "flex items-start gap-1.5",
                    problems.length === 0
                        ? "text-success-subtle-foreground"
                        : "text-warning-subtle-foreground",
                )}
            >
                {problems.length === 0 ? (
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
                ) : (
                    <CircleAlert
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0"
                    />
                )}
                <span className="min-w-0">
                    {ok.length > 0 ? (
                        <>
                            <b className="font-semibold">Checked:</b>{" "}
                            {ok.map((r) => lower(r.title)).join(", ")}
                            {problems.length > 0 ? ". " : ""}
                        </>
                    ) : null}
                    {problems.length > 0 ? (
                        <b className="font-semibold">
                            {problems.map((r) => `${r.title}.`).join(" ")}
                        </b>
                    ) : null}
                </span>
            </p>
            {problems.length > 0 ? (
                <ul className="grid gap-1 pl-6">
                    {problems.flatMap((row) =>
                        row.flags.map((flag, i) => (
                            <li
                                key={`${row.key}-${i}`}
                                data-check={row.key}
                                className="flex flex-wrap items-start gap-x-3 gap-y-0.5"
                            >
                                <span className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                                    {flag.type === "photoNoDescription"
                                        ? pageTitle(flag)
                                        : `${pageTitle(flag)} · ${flag.message}`}
                                </span>
                                <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="h-auto shrink-0 p-0 font-semibold coarse:min-h-11"
                                    onClick={() =>
                                        flag.type === "photoNoDescription"
                                            ? setDescribing(flag)
                                            : onShow(flag)
                                    }
                                >
                                    {FIX_WORD[flag.type]}
                                </Button>
                            </li>
                        )),
                    )}
                </ul>
            ) : null}
            <DescribePhotoDialog
                siteId={siteId}
                flag={describing}
                onClose={() => setDescribing(null)}
                onSaved={onChanged}
            />
        </section>
    );
}
