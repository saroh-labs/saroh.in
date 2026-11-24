"use client";

import { FormSheetBody } from "@saroh/ui/form-sheet";
import { IconButton } from "@saroh/ui/icon-button";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import {
    Brush,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Eye,
    Layers,
    Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { PagesPanel } from "@/components/sites/pages/pages-panel";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";

import type { EditorTopBarProps, useEditorBar } from "../editor-bar";
import { EditorSheet } from "../editor-sheet";
import { MoreSheet } from "../more-actions";
import type { EditorModel } from "../shell/editor-model";

/** The bar's 44px icon buttons, glyph at 20. */
const ICON = "size-11 rounded-[9px] text-muted-foreground [&_svg]:size-5";

const ICON_LINK =
    "grid size-11 shrink-0 place-items-center rounded-[9px] text-muted-foreground transition-colors duration-fast hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Bar = ReturnType<typeof useEditorBar>;

/**
 * The phone editor's top bar (U49, `fix/WXNHome`), 56 high: ← Website, the
 * page picker (the page over the site's name), Ask AI and Preview.
 * Everything else the old bar held is in the picker's sheet.
 */
export function PhonePageBar({
    model,
    bar,
    onPicker,
}: {
    model: EditorModel;
    bar: Bar;
    onPicker: () => void;
}) {
    const { actions, activePage } = bar;
    const title = activePage?.title ?? "Page";
    return (
        <header
            data-editor-bar=""
            className="relative z-10 flex h-14 shrink-0 items-center gap-0.5 border-b bg-background pl-0.5 pr-1.5"
        >
            <IntentLink
                href={`/sites/${model.siteId}/overview`}
                aria-label="Back to Website"
                className={ICON_LINK}
            >
                <ChevronLeft aria-hidden className="size-5" />
            </IntentLink>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Page: ${title}. Choose another page or change its settings`}
                onClick={onPicker}
                className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-[10px] px-1 text-left transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="grid min-w-0">
                    <b className="truncate text-sm font-semibold leading-tight">
                        {title}
                    </b>
                    <span className="truncate text-xs leading-snug text-muted-foreground">
                        {model.siteName}
                    </span>
                </span>
                <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
            </button>
            {model.askAi ? (
                <IconButton
                    label="Ask AI"
                    icon={<Sparkles />}
                    tooltip={false}
                    onClick={() => model.openAskAi("page")}
                    className={cn(
                        ICON,
                        "bg-info-subtle text-info-subtle-foreground hover:bg-info-subtle hover:text-info-subtle-foreground hover:brightness-95",
                    )}
                />
            ) : null}
            <IconButton
                label={actions.previewing ? "Back to editing" : "Preview"}
                icon={<Eye />}
                tooltip={false}
                aria-pressed={actions.previewing}
                onClick={() => actions.setPreviewing(!actions.previewing)}
                className={cn(
                    ICON,
                    actions.previewing &&
                        "bg-foreground text-background hover:bg-foreground hover:text-background",
                )}
            />
        </header>
    );
}

/**
 * The page picker's sheet (U49): the site's pages (switch, Add a page,
 * Page settings, unseen marks), then what the old phone bar's ⋯ More held:
 * the status, Preview, Feedback on this site, width and the theme, Ask a
 * teammate to review or Withdraw, Share a preview link, and test releases
 * (00-universal §15). A reader also finds the sections and Brand here, as
 * their bar holds the verdict.
 */
export function PageMenuSheet({
    open,
    onClose,
    container,
    props,
    bar,
    readerLinks,
    onFeedback,
}: {
    open: boolean;
    onClose: () => void;
    container: HTMLElement | null;
    /** The bar's props, as the old phone bar took them. */
    props: EditorTopBarProps;
    bar: Bar;
    /** A reader's way to the sections and Brand, when the bar has none. */
    readerLinks?: { onSections: () => void; onBrand: () => void };
    /** Feedback on this site: the whole site's notes. */
    onFeedback: () => void;
}) {
    const { siteId, pages, pageId } = props;
    return (
        <EditorSheet
            open={open}
            onClose={onClose}
            container={container}
            side="bottom"
            title="Pages"
            closeLabel="Close pages"
        >
            <FormSheetBody className="mx-0 block gap-0 p-0">
                <PagesPanel
                    siteId={siteId}
                    pages={pages}
                    activePageId={pageId}
                    dirty={props.dirty || props.saving || props.styleDirty}
                    unfinished={
                        props.onlyHeldBack
                            ? unfinishedPhrase(props.heldBack)
                            : undefined
                    }
                    canUpdate={props.canUpdateSite}
                    addableKinds={props.addablePageKinds}
                    flags={props.siteFlags.flags}
                    onClose={onClose}
                    phone
                    onPageSettings={bar.onPageSettings}
                />
                {readerLinks ? (
                    <ul className="mx-4 mb-4 divide-y rounded-lg border">
                        <ReaderRow
                            icon={<Layers />}
                            label="Sections on this page"
                            onClick={readerLinks.onSections}
                        />
                        <ReaderRow
                            icon={<Brush />}
                            label="Brand"
                            onClick={readerLinks.onBrand}
                        />
                    </ul>
                ) : null}
                <MoreSheet
                    {...bar.actions}
                    status={bar.readout}
                    done={onClose}
                    onFeedback={onFeedback}
                />
            </FormSheetBody>
        </EditorSheet>
    );
}

function ReaderRow({
    icon,
    label,
    onClick,
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-semibold transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
            >
                {icon}
                <span className="min-w-0 flex-1">{label}</span>
                <ChevronRight aria-hidden />
            </button>
        </li>
    );
}
