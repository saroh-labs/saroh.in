"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { useRef } from "react";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import type {
    ShellActions,
    ShellTone,
    StatusLine,
} from "@/lib/editor-shell/state";
import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";
import { TextLink } from "@saroh/ui/text-link";

export interface BannerHandlers {
    onPublish: () => void;
    onDiscard: () => void;
    onDelete: () => void;
    onRetry: () => void;
    onReload: () => void;
}

/**
 * The editor's sticky header: the page header every screen draws (where the
 * record sits, its title with its state pill), the status line under it (Saving…, Draft ·
 * saved, Not saved, "Priya changed this plan"), then View, Delete draft,
 * Discard changes and Publish. Why Publish is off sits under it, right-
 * aligned, and "When you publish: …" under that.
 *
 * Below 760px the actions move to a bar at the foot of the screen
 * (`PhoneActionBar`), where a thumb reaches them.
 */
export function PublishBanner({
    breadcrumb,
    title,
    pill,
    line,
    actions,
    handlers,
    busy,
    canEdit,
    view,
    changesText,
}: {
    breadcrumb?: React.ReactNode[];
    title: string;
    pill: { label: string; tone: ShellTone };
    line: StatusLine;
    actions: ShellActions;
    handlers: BannerHandlers;
    /** A publish, discard, delete or reload is out. */
    busy: boolean;
    canEdit: boolean;
    view: { href: string; label: string } | null;
    /** "When you publish: …", or null when nothing is waiting. */
    changesText: string | null;
}) {
    return (
        <>
            <div className="sticky top-[61px] z-10 border-b border-border bg-card px-4 py-3 dark:bg-background sm:px-[26px]">
                <PageHeader
                    holdsData
                    className="mb-0"
                    breadcrumb={breadcrumb}
                    title={title}
                    badge={
                        <StatusBadge tone={pill.tone}>{pill.label}</StatusBadge>
                    }
                    meta={
                        view ? (
                            <TextLink
                                href={view.href}
                                className="text-[13px] coarse:inline-flex coarse:min-h-11 coarse:items-center"
                            >
                                {view.label}
                            </TextLink>
                        ) : undefined
                    }
                    actions={
                        canEdit ? (
                            <div className="flex flex-wrap items-center gap-2 max-[759px]:hidden">
                                <ActionButtons
                                    actions={actions}
                                    handlers={handlers}
                                    busy={busy}
                                />
                            </div>
                        ) : undefined
                    }
                    description={
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <div
                                role="status"
                                className={cn(
                                    "text-pretty text-[12.5px]",
                                    line.tone === "danger"
                                        ? "text-destructive"
                                        : "text-muted-foreground",
                                )}
                            >
                                {line.text}
                            </div>
                            {canEdit && line.action === "retry" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={handlers.onRetry}
                                >
                                    Try again
                                </Button>
                            ) : null}
                            {line.action === "reload" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    disabled={busy}
                                    onClick={handlers.onReload}
                                >
                                    Reload
                                </Button>
                            ) : null}
                        </div>
                    }
                />
            </div>
            {canEdit && actions.publishWhy ? (
                <p className="m-0 px-4 pt-2 text-[12.5px] text-muted-foreground sm:px-[26px] sm:text-right">
                    {actions.publishWhy}
                </p>
            ) : null}
            {changesText ? (
                <p className="mx-4 mb-0 mt-3 text-pretty rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px] leading-[1.5] text-foreground sm:mx-[26px]">
                    {changesText}
                </p>
            ) : null}
        </>
    );
}

/** Delete draft · Discard changes · Publish, in the header or the phone bar. */
function ActionButtons({
    actions,
    handlers,
    busy,
    phone = false,
}: {
    actions: ShellActions;
    handlers: BannerHandlers;
    busy: boolean;
    phone?: boolean;
}) {
    return (
        <>
            {actions.deleteDraft ? (
                <Button
                    type="button"
                    variant="outline"
                    className="text-destructive"
                    disabled={busy}
                    onClick={handlers.onDelete}
                >
                    Delete draft
                </Button>
            ) : null}
            {actions.discard ? (
                <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={handlers.onDiscard}
                >
                    Discard changes
                </Button>
            ) : null}
            <Button
                type="button"
                className={cn(phone && "flex-1")}
                disabled={!actions.publishOn}
                onClick={handlers.onPublish}
            >
                {actions.publishLabel}
            </Button>
        </>
    );
}

/** The same actions at the foot of the screen on a phone, above the tab bar. */
export function PhoneActionBar({
    actions,
    handlers,
    busy,
}: {
    actions: ShellActions;
    handlers: BannerHandlers;
    busy: boolean;
}) {
    const bar = useRef<HTMLDivElement>(null);
    useBottomBarInset(bar);
    return (
        <div
            ref={bar}
            className="sticky bottom-[var(--tab-bar-inset)] z-10 hidden flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-3 dark:bg-background max-[759px]:flex"
        >
            <ActionButtons
                actions={actions}
                handlers={handlers}
                busy={busy}
                phone
            />
        </div>
    );
}
