"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
    Bold,
    ChevronRight,
    Italic,
    Keyboard,
    Link2,
    List,
    Plus,
    Quote,
    Redo2,
    Sparkles,
    Type,
    Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useCanUndo } from "../editor/use-can-undo";

/** What sits under the writing: the keyboard, or the format panel. */
export type ToolPanel = "format" | null;

const TOOL =
    "grid size-11 shrink-0 place-items-center rounded-[10px] text-foreground transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-disabled-foreground aria-pressed:bg-foreground aria-pressed:text-background";

/**
 * The bar above the keyboard (`blogphone/WXYWrite`): Format, Add, Ask AI |
 * Undo, Redo, and Hide keyboard. Format swaps the keyboard for the format
 * panel (`WXYFormat`); Add opens the Add sheet (`WXYAdd`).
 */
export function WritingToolbar({
    editor,
    panel,
    onPanel,
    onAdd,
    askAi,
    keyboardUp,
}: {
    editor: Editor | null;
    panel: ToolPanel;
    onPanel: (panel: ToolPanel) => void;
    onAdd: () => void;
    askAi: (() => void) | null;
    keyboardUp: boolean;
}) {
    // Undo and Redo follow the editor's history as it changes.
    const can = useCanUndo(editor);
    return (
        <div
            role="toolbar"
            aria-label="Writing tools"
            data-writing-tools=""
            className="flex h-[52px] shrink-0 items-center gap-0.5 border-t bg-background px-1.5"
        >
            <button
                type="button"
                aria-label="Format"
                aria-pressed={panel === "format"}
                disabled={!editor}
                onClick={() => {
                    if (panel === "format") {
                        onPanel(null);
                        editor?.chain().focus().run();
                        return;
                    }
                    // The keys go down; the panel takes their place.
                    editor?.chain().blur().run();
                    onPanel("format");
                }}
                className={TOOL}
            >
                <Type aria-hidden className="size-5" />
            </button>
            <button
                type="button"
                aria-label="Add"
                aria-haspopup="dialog"
                disabled={!editor}
                onClick={onAdd}
                className={TOOL}
            >
                <Plus aria-hidden className="size-5" />
            </button>
            {askAi ? (
                <button
                    type="button"
                    onClick={askAi}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-info-subtle px-3 text-sm font-semibold text-info-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[359px]:w-11 max-[359px]:px-0"
                >
                    <Sparkles aria-hidden className="size-[18px]" />
                    {/* Under 360 the words go and the mark stays, so the
                        bar fits a 320 phone with every tool. */}
                    <span className="max-[359px]:sr-only">Ask AI</span>
                </button>
            ) : null}
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
            <button
                type="button"
                aria-label="Undo"
                disabled={!can.undo}
                onClick={() => editor?.chain().undo().run()}
                className={TOOL}
            >
                <Undo2 aria-hidden className="size-5" />
            </button>
            <button
                type="button"
                aria-label="Redo"
                disabled={!can.redo}
                onClick={() => editor?.chain().redo().run()}
                className={TOOL}
            >
                <Redo2 aria-hidden className="size-5" />
            </button>
            <span className="min-w-0 flex-1" />
            <button
                type="button"
                aria-label="Hide keyboard"
                disabled={!keyboardUp && panel === null}
                onClick={() => {
                    editor?.chain().blur().run();
                    (document.activeElement as HTMLElement | null)?.blur();
                    onPanel(null);
                }}
                className={TOOL}
            >
                <Keyboard aria-hidden className="size-5" />
            </button>
        </div>
    );
}

function Pressable({
    label,
    pressed,
    onClick,
    className,
    children,
}: {
    label?: string;
    pressed: boolean;
    onClick: () => void;
    className?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            // The keyboard stays down: the selection is kept without focus.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={cn(
                "flex h-11 flex-1 items-center justify-center bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-foreground aria-pressed:text-background",
                className,
            )}
        >
            {children}
        </button>
    );
}

const GROUP =
    "flex flex-1 divide-x overflow-hidden rounded-[10px] border bg-card";

/**
 * The format panel in place of the keyboard (`blogphone/WXYFormat`): Text,
 * Heading, Subheading; Bold, Italic, Link; List, Quote; and More
 * formatting, which shows the whole toolbar over the text with every
 * control the editor has: colour, highlight, alignment, table, sub and
 * superscript, HTML (C10). Nothing the editor could do is dropped.
 */
export function FormatPanel({
    editor,
    onMoreFormatting,
}: {
    editor: Editor;
    onMoreFormatting: () => void;
}) {
    const [linking, setLinking] = useState<string | null>(null);
    const is = useEditorState({
        editor,
        selector: ({ editor: e }) => ({
            text: e.isActive("paragraph"),
            heading: e.isActive("heading", { level: 2 }),
            subheading: e.isActive("heading", { level: 3 }),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            link: e.isActive("link"),
            list: e.isActive("bulletList"),
            quote: e.isActive("blockquote"),
        }),
    });
    const chain = () => editor.chain();
    return (
        <div
            role="group"
            aria-label="Format"
            data-format-panel=""
            className="grid shrink-0 gap-2 border-t bg-background px-3 pb-3 pt-2.5"
        >
            <div role="group" aria-label="Text style" className="flex gap-1.5">
                {(
                    [
                        ["text", "Text", "text-[0.9375rem]"],
                        ["heading", "Heading", "text-lg"],
                        ["subheading", "Subheading", "text-base"],
                    ] as const
                ).map(([key, label, size]) => (
                    <Pressable
                        key={key}
                        pressed={is[key]}
                        onClick={() => {
                            if (key === "text") chain().setParagraph().run();
                            else
                                chain()
                                    .setHeading({
                                        level: key === "heading" ? 2 : 3,
                                    })
                                    .run();
                        }}
                        className={cn("rounded-[10px] border", size)}
                    >
                        {label}
                    </Pressable>
                ))}
            </div>
            {linking !== null ? (
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const href = linking.trim();
                        if (href)
                            chain()
                                .extendMarkRange("link")
                                .setLink({ href })
                                .run();
                        else chain().extendMarkRange("link").unsetLink().run();
                        setLinking(null);
                    }}
                >
                    <Input
                        autoFocus
                        value={linking}
                        onChange={(e) => setLinking(e.target.value)}
                        placeholder="https://… or /about"
                        aria-label="Link address"
                        inputMode="url"
                        autoCapitalize="none"
                        className="h-11 min-w-0 flex-1"
                    />
                    <Button type="submit" className="h-11">
                        Apply
                    </Button>
                </form>
            ) : (
                <div className={GROUP}>
                    <Pressable
                        label="Bold"
                        pressed={is.bold}
                        onClick={() => chain().toggleBold().run()}
                    >
                        <Bold aria-hidden className="size-[18px]" />
                    </Pressable>
                    <Pressable
                        label="Italic"
                        pressed={is.italic}
                        onClick={() => chain().toggleItalic().run()}
                    >
                        <Italic aria-hidden className="size-[18px]" />
                    </Pressable>
                    <Pressable
                        label="Link"
                        pressed={is.link}
                        onClick={() =>
                            setLinking(
                                (editor.getAttributes("link").href as
                                    string | undefined) ?? "",
                            )
                        }
                    >
                        <Link2 aria-hidden className="size-[18px]" />
                    </Pressable>
                </div>
            )}
            <div className={GROUP}>
                <Pressable
                    label="List"
                    pressed={is.list}
                    onClick={() => chain().toggleBulletList().run()}
                >
                    <List aria-hidden className="size-[18px]" />
                </Pressable>
                <Pressable
                    label="Quote"
                    pressed={is.quote}
                    onClick={() => chain().toggleBlockquote().run()}
                >
                    <Quote aria-hidden className="size-[18px]" />
                </Pressable>
            </div>
            <button
                type="button"
                onClick={onMoreFormatting}
                className="flex h-11 w-full items-center gap-2 rounded-[10px] border bg-card px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="min-w-0 flex-1 truncate">More formatting</span>
                <em className="min-w-0 truncate text-[0.8125rem] not-italic text-muted-foreground">
                    Colour, alignment, table…
                </em>
                <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
            </button>
        </div>
    );
}
