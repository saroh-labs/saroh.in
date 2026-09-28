"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { Pill } from "@/components/subscriptions/pill";
import type {
    ShellActions,
    ShellTone,
    StatusLine,
} from "@/lib/editor-shell/state";

const BTN = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";

export interface BannerHandlers {
    onPublish: () => void;
    onDiscard: () => void;
    onDelete: () => void;
    onRetry: () => void;
    onReload: () => void;
}

/**
 * The editor's sticky header, after the Plan Editor and Pack Editor designs:
 * the title with its state pill, the status line under it (Saving…, Draft ·
 * saved, Not saved, "Priya changed this plan"), then View, Delete draft,
 * Discard changes and Publish. Why Publish is off sits under it, right-
 * aligned, and "When you publish: …" under that.
 *
 * Below 760px the actions move to a bar at the foot of the screen
 * (`PhoneActionBar`), where a thumb reaches them.
 */
export function PublishBanner({
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
            <div className="sticky top-[61px] z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background px-6 py-3 max-[759px]:px-4">
                <div className="min-w-0 flex-[1_1_260px]">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="m-0 min-w-0 break-words font-display text-[22px] font-semibold tracking-[-0.02em]">
                            {title}
                        </h1>
                        <Pill tone={pill.tone}>{pill.label}</Pill>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
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
                                size="sm"
                                className="h-7 rounded-[8px] px-2.5 text-[12.5px] font-semibold"
                                onClick={handlers.onRetry}
                            >
                                Try again
                            </Button>
                        ) : null}
                        {line.action === "reload" ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-[8px] px-2.5 text-[12.5px] font-semibold"
                                disabled={busy}
                                onClick={handlers.onReload}
                            >
                                Reload
                            </Button>
                        ) : null}
                    </div>
                </div>
                {view ? (
                    <Link
                        href={view.href}
                        className="text-[13px] font-semibold text-brand hover:text-foreground coarse:inline-flex coarse:min-h-11 coarse:items-center"
                    >
                        {view.label}
                    </Link>
                ) : null}
                {canEdit ? (
                    <div className="flex flex-wrap items-center gap-2 max-[759px]:hidden">
                        <ActionButtons
                            actions={actions}
                            handlers={handlers}
                            busy={busy}
                        />
                    </div>
                ) : null}
            </div>
            {canEdit && actions.publishWhy ? (
                <p className="m-0 px-6 pt-2 text-right text-[12.5px] text-muted-foreground max-[759px]:px-4 max-[759px]:text-left">
                    {actions.publishWhy}
                </p>
            ) : null}
            {changesText ? (
                <p className="mx-6 mb-0 mt-3 text-pretty rounded-[10px] bg-brand-subtle px-3.5 py-2.5 text-[13px] leading-[1.5] text-brand-subtle-foreground max-[759px]:mx-4">
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
                    className={cn(BTN, "text-destructive")}
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
                    className={BTN}
                    disabled={busy}
                    onClick={handlers.onDiscard}
                >
                    Discard changes
                </Button>
            ) : null}
            <Button
                type="button"
                className={cn(BTN, phone && "flex-1")}
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
    return (
        <div className="sticky bottom-[var(--tab-bar-inset)] z-10 hidden flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-3 max-[759px]:flex">
            <ActionButtons
                actions={actions}
                handlers={handlers}
                busy={busy}
                phone
            />
        </div>
    );
}
