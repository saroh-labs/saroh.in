"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { copyLink, LinkBox } from "@/components/sites/test-releases/link-box";
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
        setBusy("create");
        const res = await createTestReleaseLink(siteId, release.id, days);
        setBusy(null);
        if (!res.ok) return showError(res.error);
        setFresh(res.data);
        const copied = res.data.url ? await copyLink(res.data.url) : false;
        showSuccess(copied ? "New link copied." : "New link ready.");
        onChanged();
    }

    async function revoke(linkId: string) {
        setBusy(linkId);
        const res = await revokeTestReleaseLink(siteId, linkId);
        setBusy(null);
        if (!res.ok) return showError(res.error);
        if (fresh?.id === linkId) setFresh(null);
        showSuccess("Link turned off. Anyone opening it now is told so.");
        onChanged();
    }

    return (
        <section aria-label="Links" className="grid gap-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Links
            </h4>
            {fresh?.url ? (
                <LinkBox url={fresh.url} label="New link — shown once" />
            ) : null}
            {active.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                    No link works right now.
                    {canShare ? " Make one to share it." : ""}
                </p>
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
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 shrink-0 px-2 text-[12px]"
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
                    >
                        {busy === "create" ? "Making…" : "New link"}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
