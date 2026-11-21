"use client";

import { Button } from "@saroh/ui/button";
import { CopyButton } from "@saroh/ui/copy-button";
import { Lock, PenLine, Sparkles } from "lucide-react";
import Link from "next/link";

import { openAskAi } from "@/components/ask-ai/open";
import { QrButton } from "@/components/qr/link-qr/qr-button";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import {
    SiteAddressLink,
    StateBadge,
} from "@/components/sites/header/website-header";

import type { SitePublishData } from "@/components/sites/publish/site-publish";
import { SitePublish } from "@/components/sites/publish/site-publish";

import type { SwitcherSite } from "./site-switcher";
import { SiteSwitcher } from "./site-switcher";

/**
 * Every site screen's head (WXHSwitcher, WXHOverview): which site, its web
 * address with Copy and QR, its status, Open editor and Ask AI. It keeps
 * what today's header offers (00-universal §15): the picker and New site
 * (in the switcher), the address link or Preview, QR, the state and Paused
 * badges and Open editor. New post and Categories sit over Writing.
 *
 * The status chip opens the Publish sheet (U11) for someone who may
 * publish; for anyone else (a Reviewer approves in the editor) it is a
 * badge.
 */
export function SiteHeader({
    site,
    sites,
    address,
    liveUrl,
    qrUrl,
    canEdit,
    mayCreate,
    askAi,
    publish = null,
}: {
    site: SwitcherSite;
    sites: readonly SwitcherSite[];
    /** Where the public reaches it: "rye.saroh.app". */
    address: string;
    /** Set only while the site is live: the address opens it. */
    liveUrl: string | null;
    /** The address's link whenever it has one, for Copy and QR. */
    qrUrl: string | null;
    canEdit: boolean;
    mayCreate: boolean;
    /** Ask AI's panel is here for this person (`askAiOn`, not a Reviewer). */
    askAi: boolean;
    /** The Publish sheet's read; null: the chip is only a badge. */
    publish?: SitePublishData | null;
}) {
    const base = `/sites/${site.id}`;
    return (
        <header className="flex flex-col gap-3 border-b border-border pb-4 min-[760px]:flex-row min-[760px]:flex-wrap min-[760px]:items-center">
            <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                    <SiteSwitcher
                        site={site}
                        sites={sites}
                        mayCreate={mayCreate}
                    />
                </div>
                {/* A phone keeps both actions beside the switcher, as icons. */}
                <div className="flex shrink-0 items-center gap-1.5 min-[760px]:hidden">
                    <HeaderActions
                        base={base}
                        askAi={askAi}
                        canEdit={canEdit}
                        compact
                    />
                </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                <SiteAddressLink
                    address={address}
                    liveUrl={liveUrl}
                    previewHref={base}
                    siteName={site.name}
                />
                {qrUrl ? (
                    <>
                        <CopyButton
                            value={qrUrl}
                            label="Copy"
                            thing="web address"
                            variant="ghost"
                            className="-my-1"
                        />
                        <QrButton
                            compact="always"
                            variant="ghost"
                            className="-my-1"
                            link={{
                                mode: "saved",
                                kind: "SITE",
                                siteId: site.id,
                                url: qrUrl,
                                what: "your website",
                                from: "Website screen",
                            }}
                        />
                    </>
                ) : null}
                {publish ? (
                    <SitePublish
                        data={publish}
                        trigger={(open) => (
                            <Button
                                type="button"
                                variant="ghost"
                                size="inline"
                                aria-haspopup="dialog"
                                aria-label={`${site.status.label}: open Publish`}
                                data-status-chip=""
                                onClick={open}
                                className="-my-1 rounded-full p-0 hover:bg-transparent coarse:min-h-11"
                            >
                                <StateBadge state={site.status} />
                            </Button>
                        )}
                    />
                ) : (
                    <StateBadge state={site.status} />
                )}
                {site.paused ? (
                    <StatusBadge size="default" tone="warning">
                        Paused
                    </StatusBadge>
                ) : null}
                {canEdit ? null : (
                    <StatusBadge size="default" tone="neutral">
                        <Lock aria-hidden className="mr-1 size-3" />
                        Read only
                    </StatusBadge>
                )}
            </div>
            <div className="ml-auto hidden shrink-0 items-center gap-2 min-[760px]:flex">
                <HeaderActions base={base} askAi={askAi} canEdit={canEdit} />
            </div>
        </header>
    );
}

/** Open editor (read-only for a reader, DEC-200) and Ask AI; neither black. */
function HeaderActions({
    base,
    askAi,
    canEdit,
    compact = false,
}: {
    base: string;
    askAi: boolean;
    canEdit: boolean;
    compact?: boolean;
}) {
    const editor = canEdit ? "Open editor" : "Open editor, read only";
    return (
        <>
            <Button
                asChild
                variant="outline"
                size={compact ? "icon" : "default"}
            >
                <Link href={base} aria-label={compact ? editor : undefined}>
                    <PenLine aria-hidden className="size-4" />
                    {compact ? null : <span>Open editor</span>}
                </Link>
            </Button>
            {askAi ? (
                <Button
                    type="button"
                    variant="outline"
                    size={compact ? "icon" : "default"}
                    aria-label={compact ? "Ask AI" : undefined}
                    onClick={openAskAi}
                >
                    <Sparkles aria-hidden className="size-4" />
                    {compact ? null : <span>Ask AI</span>}
                </Button>
            ) : null}
        </>
    );
}
