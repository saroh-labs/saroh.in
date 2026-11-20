"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
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
    Redo2,
    Search,
    Settings2,
    Share2,
    Sun,
    Undo2,
    UserCheck,
} from "lucide-react";
import { useTheme } from "next-themes";

import type { Device, Zoom } from "../editor-constants";
import { DEVICES, ZOOMS } from "../editor-constants";
import { COMMAND_MENU_READY } from "../panels/command-menu";
import type { TopBarActionProps } from "../top-bar-actions";
import type { EditorModel } from "./editor-model";

/** The desk's words for the three widths (RULES §1). */
const WIDTH_WORD: Record<Device, string> = {
    desktop: "Desk",
    tablet: "Tablet",
    phone: "Phone",
};

/**
 * ⋯ More on the desk bar (`fix/WXKRest`, RULES §3): everything the old bar
 * carried that is not the page, the status, Preview or Publish. Width,
 * zoom, Redo, Find, Page settings, test links, review and preview link,
 * History, Feedback (the 1440 board's; the rail has it wider), and Theme.
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
    const { readOnly, edits } = model;
    const release = actions.testRelease;
    const { resolvedTheme, setTheme } = useTheme();
    const dark = resolvedTheme === "dark";
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label="More: desk, tablet or phone width, zoom, redo, find (Command K), page settings, share a test link, history, theme"
                    icon={<MoreHorizontal className="size-5" />}
                    tooltip={false}
                    className="size-11"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Width</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={actions.device}
                    onValueChange={(v) => actions.setDevice(v as Device)}
                >
                    {DEVICES.map((d) => (
                        <DropdownMenuRadioItem key={d.key} value={d.key}>
                            {WIDTH_WORD[d.key]}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuLabel>Zoom</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={String(actions.zoom)}
                    onValueChange={(v) =>
                        actions.setZoom(
                            v === "fit" ? "fit" : (Number(v) as Zoom),
                        )
                    }
                >
                    {ZOOMS.map((z) => (
                        <DropdownMenuRadioItem key={z} value={String(z)}>
                            {z === "fit" ? "Fit" : `${z}%`}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />

                {readOnly ? null : (
                    <DropdownMenuItem
                        disabled={!edits.canRedo}
                        onSelect={() => edits.redo()}
                    >
                        <Redo2 aria-hidden />
                        Redo
                    </DropdownMenuItem>
                )}
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
