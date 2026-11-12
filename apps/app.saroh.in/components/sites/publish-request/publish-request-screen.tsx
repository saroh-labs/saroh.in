"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { GoingLive } from "@/components/sites/publish/publish-list";
import {
    PublishLiveBody,
    PublishLiveFoot,
} from "@/components/sites/publish/publish-live";
import { formatDateTime } from "@/lib/format/datetime";
import { describePendingChanges } from "@/lib/sites/pending";
import type { PublishRequestView } from "@/lib/sites/publish-requests";
import {
    addressOf,
    askedByLine,
    closedLine,
    confirmLabel,
    routeLine,
} from "@/lib/sites/publish-requests";
import { usePublishRequest } from "./use-publish-request";

/**
 * A publish an AI app prepared, answered here by the signed-in person
 * (DEC-215 as amended 12 Nov 2026). Read first: which app asked and on
 * whose connection, which site, what goes live with a preview, and where
 * it goes; then Publish (or Send for approval) or Don't publish. The answer
 * is finished on this screen, which turns into its result, the same one the
 * Publish sheet shows (DEC-185).
 */
export function PublishRequestScreen({
    view,
    requestId,
}: {
    view: PublishRequestView;
    requestId: string;
}) {
    const zone = useBusinessZone();
    const phone = usePhone();
    const router = useRouter();
    const r = usePublishRequest(view, requestId);
    const siteHref = `/sites/${encodeURIComponent(view.siteId)}`;

    if (r.state === "published") {
        return (
            <section
                data-publish-request="published"
                className="grid max-w-xl gap-4 rounded-xl border bg-card p-4 sm:p-5"
            >
                <PublishLiveBody
                    live={{
                        address: addressOf(r.answered?.liveUrl ?? null),
                        record: null,
                        siteName: view.siteName,
                    }}
                />
                <PublishLiveFoot
                    live={{
                        address: addressOf(r.answered?.liveUrl ?? null),
                        record: null,
                        siteName: view.siteName,
                    }}
                    phone={phone}
                    onDone={() => router.push(siteHref)}
                />
            </section>
        );
    }

    if (r.state === "sentForApproval") {
        return (
            <section
                data-publish-request="sent"
                className="grid max-w-xl gap-4"
            >
                <Notice tone="success" role="status">
                    Sent to the reviewers. {view.siteName} goes live once they
                    approve it.
                </Notice>
                <Button
                    asChild
                    variant="outline"
                    className="justify-self-start"
                >
                    <Link href={`${siteHref}/review`}>See the review</Link>
                </Button>
            </section>
        );
    }

    const closed = closedLine(r.state, view);
    if (closed) {
        return (
            <section
                data-publish-request={r.state}
                className="grid max-w-xl gap-4"
            >
                <Notice
                    tone={r.state === "declined" ? "neutral" : "warning"}
                    role="status"
                >
                    {closed}
                </Notice>
                <Button
                    asChild
                    variant="outline"
                    className="justify-self-start"
                >
                    <Link href={siteHref}>Back to the website</Link>
                </Button>
            </section>
        );
    }

    const summary = describePendingChanges(
        view.pendingChanges,
        view.pendingSiteChanges,
    );
    return (
        <section
            data-publish-request="open"
            aria-label="Publish request"
            className="grid max-w-xl gap-4 rounded-xl border bg-card p-4 sm:p-5"
        >
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Asked by</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">
                    {askedByLine(view)}{" "}
                    <span className="text-muted-foreground">
                        {formatDateTime(view.requestedAt, zone)}
                    </span>
                </dd>
                <dt className="text-muted-foreground">Website</dt>
                <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">
                    {view.siteName}
                </dd>
                <dt className="text-muted-foreground">Open until</dt>
                <dd>{formatDateTime(view.expiresAt, zone)}</dd>
            </dl>

            <GoingLive
                neverPublished={view.neverPublished}
                pendingKnown={
                    view.neverPublished ||
                    view.pendingChanges !== null ||
                    view.pendingSiteChanges !== null
                }
                pendingSummary={summary}
                pendingChanges={view.pendingChanges}
                pendingSiteChanges={view.pendingSiteChanges}
            />

            <Button
                type="button"
                variant="outline"
                className="justify-self-start coarse:min-h-11"
                onClick={() => void r.openPreview()}
                busy={r.previewing}
                busyLabel="Opening the preview…"
            >
                <Eye aria-hidden />
                Open the preview
            </Button>

            <Notice tone="info" role="note">
                {routeLine(view)} Nothing happens until you choose.
            </Notice>

            <div
                className={cn(
                    "flex gap-2 border-t pt-4",
                    phone ? "flex-col" : "flex-wrap items-center justify-end",
                )}
            >
                {r.error ? (
                    <p
                        role="alert"
                        className="mr-auto text-sm text-destructive-subtle-foreground"
                    >
                        {r.error}
                    </p>
                ) : null}
                <Button
                    type="button"
                    variant={phone ? "ghost" : "outline"}
                    disabled={r.busy !== null}
                    onClick={() => void r.decline()}
                    busy={r.busy === "decline"}
                    busyLabel="Saying no…"
                    className={cn(phone && "order-last")}
                >
                    Don&apos;t publish
                </Button>
                <Button
                    type="button"
                    disabled={r.busy !== null}
                    onClick={() => void r.confirm()}
                    busy={r.busy === "confirm"}
                    busyLabel={
                        view.will === "go_to_reviewers"
                            ? "Sending…"
                            : "Publishing…"
                    }
                >
                    {confirmLabel(view)}
                </Button>
            </div>
        </section>
    );
}
