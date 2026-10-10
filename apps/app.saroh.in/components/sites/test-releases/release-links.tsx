"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { copyLink, LinkBox } from "@/components/sites/test-releases/link-box";
import { runAction } from "@/lib/api/run-action";
import type {
    CreatedTestReleaseLink,
    TestRelease,
    TestReleaseLinkDays,
} from "@/lib/sites/test-releases";
import {
    LINK_DAY_CHOICES,
    linkLine,
    sharedLinks,
} from "@/lib/sites/test-releases";
import {
    createTestReleaseLink,
    revokeTestReleaseLink,
} from "@/lib/sites/test-releases-actions";
import { Segmented } from "@saroh/ui/segmented";

/**
 * A release's shared links (KTD-6): each one's expiry and when it was last
 * opened, with Turn off; and New link, for 1, 7 or 30 days. A new link's
 * address is shown and copied once: the API keeps only its hash.
 */
export function ReleaseLinks({
    siteId,
    release,
    zone,
    canShare,
    onChanged,
}: {
    siteId: string;
    release: TestRelease;
    zone: string;
    /** `site:update`: make and turn off links. */
    canShare: boolean;
    onChanged: () => void;
}) {
    const [days, setDays] = useState<TestReleaseLinkDays>(7);
    const [busy, setBusy] = useState<string | null>(null);
    const [fresh, setFresh] = useState<CreatedTestReleaseLink | null>(null);
    const links = sharedLinks(release);
    const active = links.filter((l) => l.state === "active");

    async function create() {
        const res = await runAction(
            () => createTestReleaseLink(siteId, release.id, days),
            { setBusy: (on) => setBusy(on ? "create" : null) },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        setFresh(res.data);
        const copied = res.data.url ? await copyLink(res.data.url) : false;
        showSuccess(copied ? "New link copied." : "New link ready.");
        onChanged();
    }

    async function revoke(linkId: string) {
        const res = await runAction(
            () => revokeTestReleaseLink(siteId, linkId),
            { setBusy: (on) => setBusy(on ? linkId : null) },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        if (fresh?.id === linkId) setFresh(null);
        showSuccess("Link turned off. Anyone opening it now is told so.");
        onChanged();
    }

    return (
        <section aria-label="Links" className="grid gap-1.5">
            <h4 className="label">Links</h4>
            {fresh?.url ? (
                <LinkBox url={fresh.url} label="New link — shown once" />
            ) : null}
            {active.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No link works right now"
                    description={canShare ? "Make one to share it." : undefined}
                />
            ) : (
                <ul className="grid gap-1">
                    {active.map((link) => (
                        <li
                            key={link.id}
                            className="flex min-w-0 items-center gap-2 text-[12.5px]"
                        >
                            <span className="min-w-0 flex-1 text-muted-foreground">
                                {linkLine(link, zone)}
                                {link.createdBy.name
                                    ? ` · by ${link.createdBy.name}`
                                    : ""}
                            </span>
                            {canShare ? (
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    className="shrink-0"
                                    disabled={busy !== null}
                                    onClick={() => void revoke(link.id)}
                                >
                                    Turn off
                                </Button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
            {canShare ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                        label="How long the new link works"
                        value={String(days)}
                        onValueChange={(v) => {
                            const to = LINK_DAY_CHOICES.find(
                                (c) => String(c.days) === v,
                            );
                            if (to) setDays(to.days);
                        }}
                        options={LINK_DAY_CHOICES.map((c) => ({
                            value: String(c.days),
                            label: c.label,
                        }))}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void create()}
                        busy={busy === "create"}
                        busyLabel="Making…"
                    >
                        New link
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
