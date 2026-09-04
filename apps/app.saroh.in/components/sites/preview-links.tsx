"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { env } from "@/env";
import {
    createPreviewLink,
    listPreviewLinks,
    revokePreviewLink,
} from "@/lib/sites/actions";
import { exactDate, shortDate } from "@/lib/sites/format-date";
import type { PreviewLinkDays, SitePreviewLinkView } from "@/lib/sites/service";

/**
 * Share a preview (#198): the Review tab's top block.
 *
 * The rail's empty state has said "Share a preview" since #193, and until now
 * there was nothing to click. This is the control it was describing. A link
 * shows the current draft to whoever holds it, for a set number of days,
 * until it is turned off — and the three facts a sharer needs are stated in
 * words before they send it, not discovered after: when it stops working,
 * whether anyone has opened it, and that turning it off is immediate.
 *
 * The link is copied the moment it is created. Creating it and then hunting
 * for a copy button is two steps where one was asked for.
 */

const DEFAULT_DAYS: PreviewLinkDays = 7;
const CHOICES: { days: PreviewLinkDays; label: string }[] = [
    { days: 1, label: "1 day" },
    { days: 7, label: "7 days" },
    { days: 30, label: "30 days" },
];

/** Where previews are served: the renderer's apex, never a tenant host. */
function previewUrl(token: string): string {
    const root = env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";
    return `https://${root}/preview/${encodeURIComponent(token)}`;
}

/** "11 September 2026" — the day, which is how people say when a link dies. */
function dayOf(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(iso));
}

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export function PreviewLinks({ siteId }: { siteId: string }) {
    const [links, setLinks] = useState<SitePreviewLinkView[] | null>(null);
    const [days, setDays] = useState<PreviewLinkDays>(DEFAULT_DAYS);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void listPreviewLinks(siteId).then((rows) => {
            if (!cancelled) setLinks(rows);
        });
        return () => {
            cancelled = true;
        };
    }, [siteId]);

    const active = (links ?? []).filter((l) => l.state === "active");

    async function create() {
        setBusy("create");
        const res = await createPreviewLink(siteId, days);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setLinks((prev) => [res.data, ...(prev ?? [])]);
        const copied = await copy(previewUrl(res.data.token));
        toast.success(
            copied
                ? `Link copied. It stops working on ${dayOf(res.data.expiresAt)}.`
                : `Link ready. It stops working on ${dayOf(res.data.expiresAt)}.`,
        );
    }

    async function revoke(link: SitePreviewLinkView) {
        setBusy(link.id);
        const res = await revokePreviewLink(siteId, link.id);
        setBusy(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setLinks((prev) =>
            (prev ?? []).map((l) => (l.id === link.id ? res.data : l)),
        );
        toast.success("Link turned off. Anyone opening it now is told so.");
    }

    return (
        <section className="border-b p-3">
            <h3 className="text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
                Share a preview
            </h3>

            {links === null ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    Checking for links…
                </p>
            ) : active.length > 0 ? (
                <ul className="mt-2 grid gap-2">
                    {active.map((link) => (
                        <li key={link.id} className="rounded border p-2">
                            <div className="flex items-center gap-1">
                                <code
                                    className="min-w-0 flex-1 truncate text-[0.6875rem]"
                                    title={previewUrl(link.token)}
                                >
                                    {previewUrl(link.token)}
                                </code>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 shrink-0 px-1.5 text-[0.6875rem]"
                                    onClick={() =>
                                        void copy(previewUrl(link.token)).then(
                                            (ok) =>
                                                ok
                                                    ? toast.success(
                                                          "Link copied.",
                                                      )
                                                    : toast.error(
                                                          "Could not copy. Select the link and copy it yourself.",
                                                      ),
                                        )
                                    }
                                >
                                    Copy
                                </Button>
                            </div>
                            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
                                Stops working on {dayOf(link.expiresAt)}.{" "}
                                {link.lastUsedAt ? (
                                    <span title={exactDate(link.lastUsedAt)}>
                                        Last opened {shortDate(link.lastUsedAt)}
                                        .
                                    </span>
                                ) : (
                                    "Not opened yet."
                                )}
                            </p>
                            <div className="mt-1.5 flex justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy === link.id}
                                    className="h-6 px-1.5 text-[0.6875rem]"
                                    onClick={() => void revoke(link)}
                                >
                                    Turn off
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Anyone with the link can read the current draft. It never
                    publishes anything, and you can turn it off at any time.
                </p>
            )}

            <div className="mt-2 flex items-center gap-1">
                <div
                    role="radiogroup"
                    aria-label="How long the link works"
                    className="flex rounded border p-0.5"
                >
                    {CHOICES.map((c) => (
                        <button
                            key={c.days}
                            type="button"
                            role="radio"
                            aria-checked={days === c.days}
                            onClick={() => setDays(c.days)}
                            className={cn(
                                "rounded px-1.5 py-0.5 text-[0.6875rem] transition-colors",
                                days === c.days
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="brand"
                    disabled={busy === "create"}
                    className="ml-auto h-6 px-2 text-[0.6875rem]"
                    onClick={() => void create()}
                >
                    {active.length > 0 ? "New link" : "Create link"}
                </Button>
            </div>
            <p className="mt-1.5 text-[0.625rem] leading-relaxed text-muted-foreground/80">
                The link stops working after{" "}
                {days === 1 ? "a day" : `${days} days`}, or when you turn it
                off.
            </p>
        </section>
    );
}
