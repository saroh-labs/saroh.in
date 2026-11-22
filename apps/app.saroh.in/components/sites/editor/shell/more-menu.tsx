"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import {
    FlaskConical,
    History,
    Link2,
    MessageSquare,
    Moon,
    MoreHorizontal,
    Search,
    Settings2,
    Share2,
    Sun,
    Undo2,
    UserCheck,
} from "lucide-react";
import { useTheme } from "next-themes";

import { COMMAND_MENU_READY } from "../panels/command-menu";
import type { TopBarActionProps } from "../top-bar-actions";
import type { EditorModel } from "./editor-model";

/**
 * ⋯ More on the desk bar (`fix/WXKRest`, RULES §3): the rarer actions.
 * Find, Page settings, test links, review and preview link, History,
 * Feedback (the 1440 board's; the rail has it wider), and Theme. Width and
 * zoom moved to the canvas bar and Redo beside Undo (owner, 21 Nov).
 * Each item does exactly what its old control did (00-universal §15).
 */
export function MoreMenu({
    model,
    actions,
    onPageSettings,
    onFind,
}: {
    model: EditorModel;
    /** The old bar's actions (`useEditorBar`): width, zoom, share, test links. */
    actions: TopBarActionProps;
    onPageSettings: () => void;
    /** Find (⌘K); shown once the command menu is built (U46c). */
    onFind?: () => void;
}) {
    const { readOnly } = model;
    const release = actions.testRelease;
    const { resolvedTheme, setTheme } = useTheme();
    const dark = resolvedTheme === "dark";
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label="More: find (Command K), page settings, test links, review, preview link, history, theme"
                    icon={<MoreHorizontal className="size-5" />}
                    tooltip={false}
                    className="size-11"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                {COMMAND_MENU_READY && onFind ? (
                    <DropdownMenuItem onSelect={onFind}>
                        <Search aria-hidden />
                        Find
                        <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={onPageSettings}>
                    <Settings2 aria-hidden />
                    Page settings
                </DropdownMenuItem>

                {release || !readOnly ? <DropdownMenuSeparator /> : null}
                {release?.onMake && !readOnly ? (
                    <DropdownMenuItem onSelect={release.onMake}>
                        <Share2 aria-hidden />
                        Share a test link
                    </DropdownMenuItem>
                ) : null}
                {release ? (
                    <DropdownMenuItem onSelect={release.onOpenList}>
                        <FlaskConical aria-hidden />
                        Test links
                        {release.count > 0 ? (
                            <DropdownMenuShortcut>
                                {release.count}
                            </DropdownMenuShortcut>
                        ) : null}
                    </DropdownMenuItem>
                ) : null}
                {readOnly ? null : actions.inReview ? (
                    <DropdownMenuItem
                        disabled={actions.asking}
                        onSelect={actions.withdrawReview}
                    >
                        <Undo2 aria-hidden />
                        Withdraw the review request
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem
                        disabled={actions.asking}
                        onSelect={actions.askForReview}
                    >
                        <UserCheck aria-hidden />
                        Ask a teammate to review
                    </DropdownMenuItem>
                )}
                {readOnly ? null : (
                    <DropdownMenuItem onSelect={actions.onSharePreview}>
                        <Link2 aria-hidden />
                        Share a preview link
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                {readOnly ? null : (
                    <DropdownMenuItem
                        onSelect={() => model.openRail("history")}
                    >
                        <History aria-hidden />
                        History
                    </DropdownMenuItem>
                )}
                {/* The 1440 board's: wider, Feedback is the rail's too. */}
                <DropdownMenuItem
                    className="min-[1600px]:hidden"
                    onSelect={() => model.openRail("feedback")}
                >
                    <MessageSquare aria-hidden />
                    Feedback
                    {actions.openNotes > 0 ? (
                        <DropdownMenuShortcut>
                            {actions.openNotes}
                        </DropdownMenuShortcut>
                    ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => setTheme(dark ? "light" : "dark")}
                >
                    {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
                    {dark ? "Theme: switch to light" : "Theme: switch to dark"}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
