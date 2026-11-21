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

    return (
        <section
            aria-label="Checked before you publish"
            data-pre-publish-checks=""
            className="grid gap-1.5 rounded-lg border px-3 py-2.5 text-sm"
        >
            <h3 className="font-semibold">Checked before you publish</h3>
            <ul className="grid gap-1.5">
                {checkRows(flags).map((row) => (
                    <li
                        key={row.key}
                        data-check={row.key}
                        data-ok={row.ok ? "" : undefined}
                        className="grid gap-1"
                    >
                        <span
                            className={cn(
                                "flex items-start gap-1.5",
                                row.ok
                                    ? "text-success-subtle-foreground"
                                    : "text-warning-subtle-foreground",
                            )}
                        >
                            {row.ok ? (
                                <Check
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0"
                                />
                            ) : (
                                <CircleAlert
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0"
                                />
                            )}
                            <span className="min-w-0">{row.title}</span>
                        </span>
                        {row.flags.length > 0 ? (
                            <ul className="grid gap-1 pl-6">
                                {row.flags.map((flag, i) => (
                                    <li
                                        key={i}
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
                                                flag.type ===
                                                "photoNoDescription"
                                                    ? setDescribing(flag)
                                                    : onShow(flag)
                                            }
                                        >
                                            {FIX_WORD[flag.type]}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </li>
                ))}
            </ul>
            <DescribePhotoDialog
                siteId={siteId}
                flag={describing}
                onClose={() => setDescribing(null)}
                onSaved={onChanged}
            />
        </section>
    );
}
