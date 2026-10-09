"use client";

import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { FailedState } from "@saroh/ui/data-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { SearchTrackingSave } from "@/lib/sites/search-tracking";
import { SUPPORT_EMAIL, SWITCHED_OFF_LINE } from "@/lib/sites/search-tracking";
import type { TrackersLock } from "@/lib/sites/trackers-lock";

/**
 * The pieces the "Search and tracking" section (DEC-108, U7) shares
 * between its editable and read-only views.
 */

/** What a save came to, for the field that asked. */
export type SaveOutcome =
    | { ok: true }
    | {
          ok: false;
          error: string;
          /** The API's field (`verifications.google`, `trackers.ga4`, …). */
          field?: string;
      };

export type SaveSection = (input: SearchTrackingSave) => Promise<SaveOutcome>;

export const SECTION_TITLE = "Tracking";

/**
 * The section's cards, inside the settings' Tracking group (which draws
 * the heading). Everything here applies as soon as it's saved, the
 * settings' default, so it carries no "Next publish".
 */
export function SearchTrackingFrame({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-4" data-section="search-and-tracking">
            {children}
        </div>
    );
}

/** One titled card of rows inside the section. */
export function Block({
    title,
    description,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Card className="wk-surface">
            <CardContent className="divide-y divide-border p-0">
                <div className="space-y-1 px-4 py-3">
                    <h3 className="text-sm font-medium">{title}</h3>
                    {description ? (
                        <div className="text-sm text-muted-foreground">
                            {description}
                        </div>
                    ) : null}
                </div>
                {children}
            </CardContent>
        </Card>
    );
}

/** The read failed: say so, offer Retry, and draw no form to save over. */
export function SearchTrackingFailed() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <FailedState
            title="Tracking couldn't be loaded"
            description="Your codes and trackers are unchanged. Try again in a moment."
            action={
                <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => startTransition(() => router.refresh())}
                >
                    {pending ? "Trying…" : "Retry"}
                </Button>
            }
        />
    );
}

/** Saroh staff switched this site's trackers off (#897). */
export function SwitchedOffNotice() {
    return (
        <div
            role="status"
            className="rounded-lg border bg-muted px-4 py-3 text-sm"
        >
            <p className="font-medium">{SWITCHED_OFF_LINE}</p>
            <p className="text-muted-foreground">
                None of your trackers run, and none can be turned on. To ask
                why, or to have them back, write to{" "}
                <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-foreground underline underline-offset-2 hover:text-muted-foreground active:text-foreground"
                >
                    {SUPPORT_EMAIL}
                </a>
                .
            </p>
        </div>
    );
}

/** The plan leaves trackers off: what they'd get, and the way up. */
export function LockNotice({ lock }: { lock: TrackersLock }) {
    return (
        <div
            data-lock="trackers"
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
        >
            <span className="min-w-0">{lock.line}</span>
            <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={lock.href}>{lock.cta}</Link>
            </Button>
        </div>
    );
}

/** Copy a value, with a toast once it's on the clipboard. */
export function CopyValue({ value, label }: { value: string; label: string }) {
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            showSuccess(`${label} copied`);
        } catch {
            showError(`Couldn't copy. Select it and copy it yourself.`);
        }
    }
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void copy()}
            aria-label={`Copy ${label.toLowerCase()}`}
            className="shrink-0"
        >
            <Copy aria-hidden className="size-4" />
            Copy
        </Button>
    );
}

/** A label, the value, and its action — wrapping whole on a phone. */
export function LineRow({
    label,
    children,
    action,
}: {
    label: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="grid items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
                {children}
            </div>
            {action ? (
                <div className="justify-self-start sm:justify-self-end">
                    {action}
                </div>
            ) : (
                <div />
            )}
        </div>
    );
}
