"use client";

import { Button } from "@saroh/ui/button";
import { CopyButton } from "@saroh/ui/copy-button";
import { Check, ExternalLink, Megaphone } from "lucide-react";

import { ShareLinkButton } from "@/components/shared/share-link/share-link-button";
import { count } from "@/lib/format/plural";
import { shareLink } from "@/lib/sites/share-links";
import type { WentLive } from "./use-publish";
import type { PublishChanges as Changes } from "./use-publish-changes";

/**
 * The Publish sheet's result (wave G, DEC-185): the same sheet, turned into
 * where the site now is. A plain statement, announced politely, with the
 * address to copy and the one next thing worth doing, passing it on
 * (Tell people, U12; else Share and its QR code).
 */
export function PublishLiveBody({ live }: { live: WentLive }) {
    const url = live.address ? `https://${live.address}` : null;
    return (
        <div
            role="status"
            className="grid gap-4 duration-slow ease-out animate-in fade-in-0 motion-reduce:animate-none"
        >
            <div className="flex items-start gap-3">
                <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground"
                >
                    <Check className="size-5" />
                </span>
                <div className="min-w-0">
                    <p className="text-balance text-base font-semibold [overflow-wrap:anywhere]">
                        {live.siteName} is live
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Anyone can open it now.
                    </p>
                    {live.record ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                            {live.record}
                        </p>
                    ) : null}
                </div>
            </div>
            {url && live.address ? (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 py-1 pl-3 pr-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">
                        {live.address}
                    </span>
                    <CopyButton
                        value={url}
                        label="Copy address"
                        thing="address"
                        variant="ghost"
                        className="coarse:min-h-11"
                    />
                </div>
            ) : null}
        </div>
    );
}

/** The result's foot: Share link (and its QR code), Done, Open site. */
export function PublishLiveFoot({
    live,
    phone,
    onDone,
    onTellPeople,
}: {
    live: WentLive;
    phone: boolean;
    onDone: () => void;
    /** Tell people (U12): the page's share sheet, after a publish. */
    onTellPeople?: () => void;
}) {
    const url = live.address ? `https://${live.address}` : null;
    // The same share button and QR code the first-run screens offer.
    const share = shareLink({ links: { site: url, shop: null, book: null } }, [
        "site",
    ]);
    const open = url ? (
        <Button asChild>
            <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Open site
            </a>
        </Button>
    ) : null;
    // Tell people when there is a page to tell them about; else the site's
    // share button and QR code, as the first-run screens offer.
    const shareRow = onTellPeople ? (
        <Button
            type="button"
            variant="outline"
            onClick={onTellPeople}
            data-tell-people=""
        >
            <Megaphone aria-hidden />
            Tell people
        </Button>
    ) : share ? (
        <ShareLinkButton link={share} className="mt-0 justify-start" />
    ) : null;
    const done = (
        <Button type="button" variant="outline" onClick={onDone}>
            Done
        </Button>
    );
    // A phone: Open site under the thumb first. A desk: passing it on,
    // then Done and Open site at the right.
    return phone ? (
        <div className="flex flex-col gap-2 [&>*]:w-full">
            {open}
            {shareRow}
            {done}
        </div>
    ) : (
        <div className="flex flex-col gap-2">
            {shareRow}
            <div className="flex justify-end gap-2">
                {done}
                {open}
            </div>
        </div>
    );
}

/** After a publish that left some out: they still wait, and which went with them. */
export function LeftOutLine({
    live,
    changes,
}: {
    live: WentLive;
    changes: Changes | null;
}) {
    if (!live.leftOut) return null;
    const labelOf = (key: string) =>
        changes?.changes?.units.find((u) => u.key === key)?.label ?? null;
    const also = (live.alsoLeftOut ?? [])
        .map(labelOf)
        .filter((l): l is string => l !== null);
    return (
        <p className="text-sm text-muted-foreground" data-left-out-line="">
            {count(live.leftOut + also.length, "change")} left out, still
            waiting in the draft.
            {also.length > 0
                ? ` Also left out, because they need one you left out: ${also.join(", ")}.`
                : ""}
        </p>
    );
}
