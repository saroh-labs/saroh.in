"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import {
    ChevronDown,
    Ellipsis,
    Eye,
    FlaskConical,
    Link2,
    ListChecks,
    MessageSquare,
    Monitor,
    Plus,
    Smartphone,
    Tablet,
    Undo2,
    UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { Device, Zoom } from "@/components/sites/editor-constants";
import { DEVICES, ZOOMS } from "@/components/sites/editor-constants";

/** What the bar's right-hand side can do: how the page is shown, and publish. */
export interface TopBarActionProps {
    device: Device;
    setDevice: (next: Device) => void;
    zoom: Zoom;
    setZoom: (next: Zoom) => void;
    previewing: boolean;
    setPreviewing: (on: boolean) => void;
    asking: boolean;
    inReview: boolean;
    askForReview: () => void;
    /** Take the open request back (UX-068). */
    withdrawReview: () => void;
    /**
     * Open the whole site's Feedback, where a preview link is made (UX-068):
     * the "anyone with the link" half of Share.
     */
    onSharePreview: () => void;
    publishing: boolean;
    publishDisabled: boolean;
    publishHint: string | undefined;
    flagCount: number;
    onPublish: () => void;
    /**
     * Narrow (G4): the inspector is out of sight until a block is chosen, so
     * Feedback — the whole site's review — gets its own way in.
     */
    onFeedback?: () => void;
    openNotes: number;
    /**
     * "Publishing needs approval" is on (DEC-071, R10): Publish reads "Needs
     * approval", and only an owner (`canOverride`) can press it.
     */
    needsApproval?: boolean;
    canOverride?: boolean;
    /**
     * Test releases (DEC-071, T11), beside Publish. Absent while they are off
     * for the business (KTD-16): then nothing is drawn.
     */
    testRelease?: TestReleaseActions;
}

/** What the "Test release" split button can do. */
export interface TestReleaseActions {
    /** Make one: `site:update`. Absent without it; the list opens instead. */
    onMake?: () => void;
    /** The site's releases: open them, share, go live, schedule. */
    onOpenList: () => void;
    /** How many are ready or scheduled, for the menu's count. */
    count: number;
}

const ACTION =
    "h-[34px] gap-[7px] rounded-[9px] px-3 text-[0.78125rem] font-semibold text-muted-foreground";

/**
 * The bar's actions: theme, width, zoom and Preview, then Share and
 * Publish. Moved out of `editor-top-bar.tsx` (G4) so a phone can show the same
 * controls in its menu, `stacked`, with every target sized for a thumb.
 */
export function TopBarActions({
    stacked = false,
    compact = false,
    ...p
}: TopBarActionProps & {
    stacked?: boolean;
    /**
     * Narrow (UX-035): Preview, Feedback and Test release fold into "More",
     * so Publish stays on screen at tablet width.
     */
    compact?: boolean;
}) {
    const [moreOpen, setMoreOpen] = useState(false);
    /** Close "More" before an action that opens something over the editor. */
    const fromMore = (run: () => void) => (): void => {
        setMoreOpen(false);
        run();
    };
    return (
        <div
            className={
                stacked
                    ? "flex flex-col gap-2"
                    : "ml-auto flex shrink-0 items-center gap-2"
            }
        >
            <div
                className={cn(
                    "flex items-center gap-2",
                    stacked && "flex-wrap",
                )}
            >
                <ThemeToggle />
                {/*
                 * Width only — the preview is already local, and
                 * switching must not become a re-fetch.
                 */}
                <div
                    role="group"
                    aria-label="Preview width"
                    className="flex h-8 items-center gap-0.5 rounded-md border p-0.5 coarse:h-11"
                >
                    {DEVICES.map((d) => {
                        const Icon =
                            d.key === "phone"
                                ? Smartphone
                                : d.key === "tablet"
                                  ? Tablet
                                  : Monitor;
                        return (
                            <button
                                key={d.key}
                                type="button"
                                onClick={() => p.setDevice(d.key)}
                                aria-pressed={p.device === d.key}
                                aria-label={`Show at ${d.label.toLowerCase()} width`}
                                title={d.label}
                                className={cn(
                                    "flex h-full w-8 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:w-11",
                                    p.device === d.key
                                        ? "bg-secondary text-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Icon aria-hidden className="size-4" />
                            </button>
                        );
                    })}
                </div>

                {/*
                 * The zoom readout IS the control (spec §2): no ⌘scroll,
                 * no pinch, no shortcut.
                 */}
                <OptionSelect
                    aria-label="Zoom"
                    size="sm"
                    value={String(p.zoom)}
                    onValueChange={(v) => {
                        p.setZoom(v === "fit" ? "fit" : (Number(v) as Zoom));
                    }}
                    options={ZOOMS.map((z) => ({
                        value: String(z),
                        label: z === "fit" ? "Fit" : `${z}%`,
                    }))}
                    className="h-8 w-[4.75rem] tabular-nums text-muted-foreground coarse:h-11"
                />
            </div>

            {compact ? (
                <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="More: preview, feedback and test releases"
                            className={cn(ACTION, "w-[34px] px-0")}
                        >
                            <Ellipsis aria-hidden className="size-[15px]" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        className="flex w-60 flex-col gap-2 p-2"
                    >
                        <SecondaryActions
                            {...p}
                            stacked
                            setPreviewing={(on) =>
                                fromMore(() => p.setPreviewing(on))()
                            }
                            onFeedback={
                                p.onFeedback
                                    ? fromMore(p.onFeedback)
                                    : undefined
                            }
                            testRelease={
                                p.testRelease
                                    ? {
                                          ...p.testRelease,
                                          onMake: p.testRelease.onMake
                                              ? fromMore(p.testRelease.onMake)
                                              : undefined,
                                          onOpenList: fromMore(
                                              p.testRelease.onOpenList,
                                          ),
                                      }
                                    : undefined
                            }
                        />
                    </PopoverContent>
                </Popover>
            ) : (
                <SecondaryActions {...p} stacked={stacked} />
            )}

            {/*
             * Share (UX-068): one button, two ways — ask a teammate to
             * review, or hand anyone a preview link. While a review is
             * open it says so and offers to take the request back. Style
             * is the rail's Brand tab (G2), so the bar has no button for it.
             */}
            <ShareControl {...p} stacked={stacked} />

            {/*
             * The one action that puts the site in front of the
             * public. Not disabled while In review: publishing then
             * is allowed and recorded as a bypass (#278, DEC-047).
             * Its title says what it puts live (G2). Unlike the
             * design it stays pressable when nothing has changed:
             * publishing again is how a new version is made.
             */}
            <Button
                size="sm"
                className={cn(
                    "wk-press h-[34px] rounded-[9px] px-3.5 text-[0.78125rem] font-semibold",
                    stacked && "h-11 w-full",
                )}
                title={p.publishHint}
                onClick={p.onPublish}
                // With "Publishing needs approval" on, only an owner can
                // press it, and it says so rather than refusing on the press.
                disabled={
                    p.publishDisabled || (p.needsApproval && !p.canOverride)
                }
            >
                {p.publishing
                    ? "Publishing…"
                    : p.needsApproval
                      ? "Needs approval"
                      : "Publish"}
                {/*
                 * Things worth a look before publishing, as a dot (UX-081):
                 * a number here read as "changes to publish" when it
                 * counted warnings. The check lists them on the press, so
                 * the dot stays out of the button's name.
                 */}
                {!p.publishing && p.flagCount > 0 ? (
                    <span
                        aria-hidden
                        data-flag-dot=""
                        title={`${p.flagCount} ${p.flagCount === 1 ? "thing" : "things"} worth a look`}
                        className="ml-1.5 inline-block size-1.5 rounded-full bg-background/80"
                    />
                ) : null}
            </Button>
            {/* A phone has no hover, so what Publish puts live is written out. */}
            {stacked && p.publishHint ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                    {p.publishHint}
                </p>
            ) : null}
        </div>
    );
}

/**
 * Preview, Feedback and the Test release split: in the bar on a desk, in
 * "More" when narrow (UX-035), and full width in a phone's menu.
 */
function SecondaryActions({
    stacked,
    ...p
}: TopBarActionProps & { stacked: boolean }) {
    const touch = stacked && "h-11 w-full justify-start";
    return (
        <>
            {/*
             * Preview removes the editing tools from the same canvas;
             * it does not switch to another renderer (G5). While it is
             * on, the button says where it goes back to, as the design
             * does, and Escape returns too.
             */}
            <Button
                variant="outline"
                size="sm"
                aria-pressed={p.previewing}
                className={cn(ACTION, p.previewing && "bg-secondary", touch)}
                onClick={() => p.setPreviewing(!p.previewing)}
            >
                <Eye aria-hidden className="size-[15px]" />
                {p.previewing ? "Editing" : "Preview"}
            </Button>

            {p.onFeedback ? (
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(ACTION, touch)}
                    onClick={p.onFeedback}
                >
                    <MessageSquare aria-hidden className="size-[15px]" />
                    Feedback
                    {p.openNotes > 0 ? (
                        <span className="tabular-nums text-highlight">
                            {p.openNotes}
                        </span>
                    ) : null}
                </Button>
            ) : null}

            {p.testRelease ? (
                <TestReleaseSplit actions={p.testRelease} stacked={stacked} />
            ) : null}
        </>
    );
}

/** One row of the Share menu: what it does, then what that means. */
function ShareChoice({
    icon,
    label,
    hint,
    onSelect,
    disabled,
}: {
    icon: ReactNode;
    label: string;
    hint: string;
    onSelect: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onSelect}
            className="flex w-full gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 coarse:min-h-11"
        >
            <span aria-hidden className="mt-0.5 text-muted-foreground">
                {icon}
            </span>
            <span className="grid gap-0.5">
                <span className="text-[0.8125rem] font-semibold">{label}</span>
                <span className="text-xs leading-snug text-muted-foreground">
                    {hint}
                </span>
            </span>
        </button>
    );
}

/**
 * Share (UX-068). "Share for review" used to flip the site to In review on
 * the press, while the link anyone could open sat in Feedback; now both are
 * named choices, and an open review can be withdrawn.
 */
function ShareControl({
    stacked,
    ...p
}: TopBarActionProps & { stacked: boolean }) {
    const [open, setOpen] = useState(false);
    const pick = (run: () => void) => () => {
        setOpen(false);
        run();
    };
    const choices = (
        <>
            {p.inReview ? (
                <ShareChoice
                    icon={<Undo2 className="size-4" />}
                    label="Withdraw the review request"
                    hint="The site stops reading In review. Notes stay."
                    disabled={p.asking}
                    onSelect={pick(p.withdrawReview)}
                />
            ) : (
                <ShareChoice
                    icon={<UserCheck className="size-4" />}
                    label="Ask a teammate to review"
                    hint="Puts the site In review. Reviewers comment on blocks; publishing still works."
                    disabled={p.asking}
                    onSelect={pick(p.askForReview)}
                />
            )}
            <ShareChoice
                icon={<Link2 className="size-4" />}
                label="Share a preview link"
                hint="A link anyone can open to read the draft. Nothing goes live."
                onSelect={pick(p.onSharePreview)}
            />
        </>
    );
    if (stacked) {
        return (
            <div
                role="group"
                aria-label={p.inReview ? "In review" : "Share"}
                className="grid gap-1 rounded-lg border p-1"
            >
                {choices}
            </div>
        );
    }
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    aria-haspopup="dialog"
                    className={ACTION}
                >
                    <Link2 aria-hidden className="size-[15px]" />
                    {p.inReview ? "In review" : "Share"}
                    <ChevronDown aria-hidden className="size-[13px]" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="grid w-72 gap-1 p-1">
                {choices}
            </PopoverContent>
        </Popover>
    );
}

/**
 * "Test release" beside Publish (DEC-071, T11): the main half makes one (or,
 * without `site:update`, opens the list), and the chevron offers both. In a
 * phone's menu the two are full-width buttons: a menu inside a menu is a
 * trap for a thumb.
 */
function TestReleaseSplit({
    actions,
    stacked,
}: {
    actions: TestReleaseActions;
    stacked: boolean;
}) {
    const listLabel =
        actions.count > 0
            ? `Test releases · ${actions.count}`
            : "Test releases";
    if (stacked) {
        return (
            <>
                {actions.onMake ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(ACTION, "h-11 w-full justify-start")}
                        onClick={actions.onMake}
                    >
                        <Plus aria-hidden className="size-[15px]" />
                        Make a test release
                    </Button>
                ) : null}
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(ACTION, "h-11 w-full justify-start")}
                    onClick={actions.onOpenList}
                >
                    <FlaskConical aria-hidden className="size-[15px]" />
                    {listLabel}
                </Button>
            </>
        );
    }
    return (
        <div role="group" aria-label="Test release" className="flex">
            <Button
                variant="outline"
                size="sm"
                className={cn(ACTION, "rounded-r-none")}
                title={
                    actions.onMake
                        ? "Freeze the draft into a test release, to share and go live with later"
                        : "See this site's test releases"
                }
                onClick={actions.onMake ?? actions.onOpenList}
            >
                <FlaskConical aria-hidden className="size-[15px]" />
                Test release
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label="More test release actions"
                        className="h-[34px] w-8 rounded-l-none rounded-r-[9px] border-l-0 px-0 text-muted-foreground"
                    >
                        <ChevronDown aria-hidden className="size-[13px]" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {actions.onMake ? (
                        <DropdownMenuItem onSelect={actions.onMake}>
                            <Plus aria-hidden className="size-4" />
                            Make a test release
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={actions.onOpenList}>
                        <ListChecks aria-hidden className="size-4" />
                        {listLabel}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
