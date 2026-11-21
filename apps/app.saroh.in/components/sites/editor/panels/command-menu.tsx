"use client";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { noMatchLine } from "@saroh/ui/lib/state-copy";
import { showError } from "@saroh/ui/toast";
import type { LucideIcon } from "lucide-react";
import {
    FileText,
    Globe,
    Link2,
    MapPin,
    PanelBottom,
    PanelTop,
    Settings2,
    Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

import { SECTION_ICONS } from "@/components/sites/blocks/block-icons";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";

import {
    SECTION_HINTS,
    SECTION_LABELS,
    sectionTitle,
} from "../editor-constants";
import type { EditorModel } from "../shell/editor-model";
import { leavePageMessage } from "../use-editor-selection";
import type { FindSettings } from "./find-settings-sheet";
import { FindSettingsSheet } from "./find-settings-sheet";

/**
 * Whether Find (⌘K) is built. The shell's More shows "Find" only when true,
 * so the stub never offers a menu item that does nothing; U46c sets it.
 */
export const COMMAND_MENU_READY = true as boolean;

export interface CommandMenuProps {
    model: EditorModel;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** One row of Find: what it says, where it opens, what else finds it. */
export interface FindRow {
    key: string;
    group: "here" | "site";
    icon: LucideIcon;
    label: string;
    detail: string;
    /** Where it opens, on the right ("Page settings", "Section"). */
    where: string;
    /** More words that find it. */
    words?: string;
    run: () => void;
}

/** Every word typed is in the row's words, in any order. */
export function findMatches(row: FindRow, query: string): boolean {
    const hay =
        `${row.label} ${row.detail} ${row.where} ${row.words ?? ""}`.toLowerCase();
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => hay.includes(word));
}

/**
 * Find (⌘K) in the editor (U46c, `fix/WXECommand`): one search for doing
 * things without leaving the editor. Do it here opens this page's settings
 * and link, Contact and social, and the web address, each in a sheet; On
 * this site selects a section on this page, the header or footer, or opens
 * another page in the editor; Ask AI takes the words (Tab). A reader only
 * finds On this site. The short link row waits (C5).
 */
export function CommandMenu({ model, open, onOpenChange }: CommandMenuProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [settings, setSettings] = useState<FindSettings | null>(null);
    const [asked, setAsked] = useState(false);
    const openSettings = (which: FindSettings) => {
        setAsked(true);
        setSettings(which);
    };
    const { page, pages, pageId, siteId, readOnly, selection, draft } = model;
    const writes = !readOnly && model.canUpdateSite;
    const askAi = model.askAi && !readOnly;

    const close = () => {
        onOpenChange(false);
        setQuery("");
    };

    // What had the keyboard (More, or wherever ⌘K was pressed): the dialog
    // has no trigger of its own to hand it back to. Read before its own
    // focus moves in.
    const back = useRef<HTMLElement | null>(null);
    useLayoutEffect(() => {
        if (open) back.current = document.activeElement as HTMLElement | null;
    }, [open]);
    const dismiss = () => {
        close();
        setTimeout(() => back.current?.focus(), 0);
    };

    function openPage(id: string) {
        const blocked = leavePageMessage(
            model.unsaved,
            draft.onlyHeldBack ? unfinishedPhrase(draft.heldBack) : undefined,
        );
        if (blocked !== null) return showError(blocked);
        router.push(`/sites/${siteId}?page=${id}`);
    }

    function ask() {
        close();
        model.openAskAi("page");
    }

    const here: FindRow[] =
        writes && page
            ? [
                  {
                      key: "page-settings",
                      group: "here",
                      icon: Settings2,
                      label: "Page settings",
                      detail: `${page.title} · its name, link, Google and sharing`,
                      where: "Page settings",
                      words: "title search seo share",
                      run: () => model.openPageSettings(page.id),
                  },
                  {
                      key: "page-link",
                      group: "here",
                      icon: Link2,
                      label: "Change this page’s link",
                      detail: `${page.path} · the old link forwards here`,
                      where: "Page settings",
                      words: "address url path slug",
                      run: () => model.openPageSettings(page.id),
                  },
                  {
                      key: "contact",
                      group: "here",
                      icon: MapPin,
                      label: "Change the address, phone or social links",
                      detail: "Shown in Visit us and the footer on every page",
                      where: "Settings › Contact and social",
                      words: "contact email whatsapp instagram facebook location",
                      run: () => openSettings("contact"),
                  },
                  {
                      key: "web-address",
                      group: "here",
                      icon: Globe,
                      label: "Change your web address",
                      detail: `${model.address ?? "Your Saroh address"}, or your own web address`,
                      where: "Links",
                      words: "domain url",
                      run: () => openSettings("address"),
                  },
              ]
            : [];

    const site: FindRow[] = [
        ...draft.sections.map((section, index) => ({
            key: `section-${section.key ?? index}`,
            group: "site" as const,
            icon: SECTION_ICONS[section.type],
            label: `${sectionTitle(section)} section`,
            detail: `On ${page?.title ?? "this page"} · ${SECTION_LABELS[section.type]}`,
            where: "Section",
            words: SECTION_HINTS[section.type],
            run: () => {
                selection.setSelectedIndex(index);
                model.scrollToSection(index);
            },
        })),
        ...(["header", "footer"] as const).map((part) => ({
            key: part,
            group: "site" as const,
            icon: part === "header" ? PanelTop : PanelBottom,
            label: part === "header" ? "Header" : "Footer",
            detail:
                part === "header"
                    ? "On every page · menu and buttons"
                    : "On every page · hours, links and contact",
            where: "On every page",
            words: part === "header" ? "menu navigation" : undefined,
            run: () => selection.selectChrome(part),
        })),
        ...pages
            .filter((p) => p.id !== pageId)
            .map((p) => ({
                key: `page-${p.id}`,
                group: "site" as const,
                icon: FileText,
                label: p.title,
                detail: p.path,
                where: "Page",
                run: () => openPage(p.id),
            })),
    ];

    const q = query.trim();
    const shown = [...here, ...site].filter((row) => findMatches(row, q));
    const groups = [
        {
            heading: "Do it here",
            rows: shown.filter((r) => r.group === "here"),
        },
        {
            heading: "On this site",
            rows: shown.filter((r) => r.group === "site"),
        },
    ].filter((g) => g.rows.length > 0);

    return (
        <>
            <CommandDialog
                open={open}
                onOpenChange={(next) => (next ? onOpenChange(true) : dismiss())}
                shouldFilter={false}
                label="Find or do anything"
                description="Find a section or a page, or change a setting, without leaving the editor."
            >
                <CommandInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Find or do anything"
                    onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey && askAi && q) {
                            e.preventDefault();
                            ask();
                        }
                    }}
                />
                <CommandList data-editor-find="">
                    <CommandEmpty>
                        {noMatchLine("sections, pages or settings", q)}
                    </CommandEmpty>
                    {groups.map((g) => (
                        <CommandGroup key={g.heading} heading={g.heading}>
                            {g.rows.map((row) => (
                                <CommandItem
                                    key={row.key}
                                    value={row.key}
                                    onSelect={() => {
                                        close();
                                        row.run();
                                    }}
                                    className="gap-3"
                                >
                                    <row.icon
                                        aria-hidden
                                        className="shrink-0"
                                    />
                                    <span className="grid min-w-0 flex-1">
                                        <span
                                            data-ph-mask=""
                                            className="truncate font-medium"
                                        >
                                            {row.label}
                                        </span>
                                        <span
                                            data-ph-mask=""
                                            className="truncate text-xs text-muted-foreground"
                                        >
                                            {row.detail}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">
                                        {row.where}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                    {askAi && q ? (
                        <CommandGroup heading="Ask AI">
                            <CommandItem
                                value="ask-ai"
                                onSelect={ask}
                                className="gap-3"
                            >
                                <Sparkles aria-hidden className="shrink-0" />
                                <span className="grid min-w-0 flex-1">
                                    <span
                                        data-ph-mask=""
                                        className="truncate font-medium"
                                    >
                                        Ask AI: “{q}”
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        For example: add our address and a map
                                        to this page
                                    </span>
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">
                                    Tab
                                </span>
                            </CommandItem>
                        </CommandGroup>
                    ) : null}
                </CommandList>
                <div
                    aria-hidden="true"
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground max-sm:hidden"
                >
                    <span>↑ ↓ move</span>
                    <span>↵ open here, in a sheet</span>
                    {askAi ? <span>Tab ask AI</span> : null}
                    <span className="flex-1" />
                    <span>Nothing here takes you out of the editor</span>
                </div>
            </CommandDialog>
            {/* Mounted once asked for: its rows read the settings' query. */}
            {asked ? (
                <FindSettingsSheet
                    siteId={siteId}
                    which={settings}
                    canEdit={writes}
                    onClose={() => setSettings(null)}
                />
            ) : null}
        </>
    );
}
