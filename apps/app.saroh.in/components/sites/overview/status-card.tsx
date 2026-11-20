import { Button } from "@saroh/ui/button";
import { CopyButton } from "@saroh/ui/copy-button";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";

import { QrButton } from "@/components/qr/link-qr/qr-button";
import { StateBadge } from "@/components/sites/header/website-header";
import type { SharePage } from "@/components/sites/share/share-page-sheet";
import { SharePageButton } from "@/components/sites/share/share-page-sheet";
import { formatDate } from "@/lib/format/datetime";
import type { SiteOverview } from "@/lib/sites/service";
import type { SiteStateTone } from "@/lib/sites/site-state";

import { firstName } from "./overview-words";

const CARD =
    "flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-5";

/**
 * Where people reach the site (WXHOverview's left card): the business's
 * web address (DEC-230) with Copy, Open the live site, its QR for the
 * counter, and Share this page for the home page while the site is live.
 */
export function AddressCard({
    siteId,
    host,
    url,
    live,
    share,
}: {
    siteId: string;
    host: string | null;
    url: string | null;
    live: boolean;
    /** The home page and the business's name; null: nothing to share. */
    share?: { page: SharePage; business: string } | null;
}) {
    return (
        <section aria-labelledby="ov-address" className={CARD}>
            <div className="min-w-0">
                <h2
                    id="ov-address"
                    className="mb-1.5 text-sm text-muted-foreground"
                >
                    Web address
                </h2>
                <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate font-mono text-xl font-medium">
                        {host ?? "No web address yet"}
                    </span>
                    {url ? (
                        <CopyButton
                            value={url}
                            label="Copy"
                            thing="web address"
                            variant="ghost"
                        />
                    ) : null}
                </div>
            </div>
            {url ? (
                <div className="flex min-w-0 items-center gap-3">
                    <QrButton
                        compact="always"
                        variant="outline"
                        link={{
                            mode: "saved",
                            kind: "SITE",
                            siteId,
                            url,
                            what: "your website",
                            from: "Website overview",
                        }}
                    />
                    <div className="grid min-w-0 gap-1">
                        <p className="text-sm text-muted-foreground">
                            Print it on the bill counter or a mirror card.
                        </p>
                        {live && host && share ? (
                            <SharePageButton
                                siteId={siteId}
                                host={host}
                                page={share.page}
                                business={share.business}
                            />
                        ) : null}
                    </div>
                </div>
            ) : null}
            {live && url ? (
                <TextLink href={url} external className="self-start text-sm">
                    Open the live site
                </TextLink>
            ) : null}
        </section>
    );
}

/**
 * Whether the site is right (WXHOverview's right card): its status, how
 * many changes wait, when it was last published and by whom, and Review
 * and publish for someone who may publish. Publish lives in the editor
 * until the Publish sheet comes out (U11); who made each change comes
 * with U7.
 */
export function StatusCard({
    siteId,
    status,
    lastPublished,
    canPublish,
    timeZone,
    now,
}: {
    siteId: string;
    status: { label: string; tone: SiteStateTone; waiting: number };
    lastPublished: SiteOverview["lastPublished"];
    canPublish: boolean;
    timeZone: string;
    now: Date;
}) {
    const by = firstName(lastPublished?.by ?? null);
    const published = lastPublished
        ? `Last published ${formatDate(lastPublished.at, timeZone, { now })}${by ? ` by ${by}` : ""}`
        : "Not published yet. Publish to put it live.";
    const offerPublish =
        canPublish && (status.waiting > 0 || lastPublished === null);
    return (
        <section aria-labelledby="ov-status" className={CARD}>
            <h2 id="ov-status" className="sr-only">
                Status
            </h2>
            <div className="flex flex-wrap items-center gap-2">
                <StateBadge state={status} />
            </div>
            <p className="text-sm text-muted-foreground">{published}</p>
            {offerPublish ? (
                <Button asChild className="self-start">
                    <Link href={`/sites/${siteId}`}>Review and publish</Link>
                </Button>
            ) : null}
        </section>
    );
}
