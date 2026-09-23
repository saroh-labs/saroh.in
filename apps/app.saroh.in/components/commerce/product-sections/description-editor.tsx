"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Switch } from "@saroh/ui/switch";
import { Textarea } from "@saroh/ui/textarea";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    Bold,
    Eraser,
    Italic,
    Link2,
    List,
    ListOrdered,
    Minus,
    Quote,
    Redo2,
    Strikethrough,
    Underline,
    Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { LIMITS, stripHtml } from "@/lib/products/editor-sections";

/**
 * A product's description (editor v2, "Description"). Six tools up front —
 * bold, italic, underline, two lists, a link — and a Text / H2 / H3 style;
 * the rest under More. Everything it can make survives the API's sanitiser,
 * so nothing a merchant formats is silently lost on save. An HTML switch
 * edits the markup itself.
 *
 * Load through `next/dynamic` with `ssr: false`, as the site editor's is.
 */
export function DescriptionEditor({
    value,
    onChange,
    disabled = false,
    id,
    invalid = false,
}: {
    value: string;
    onChange: (html: string) => void;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
}) {
    const [source, setSource] = useState(false);
    const [more, setMore] = useState(false);
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
                code: false,
                codeBlock: false,
                link: {
                    openOnClick: false,
                    autolink: true,
                    HTMLAttributes: {
                        rel: "noopener noreferrer",
                        target: "_blank",
                    },
                },
            }),
            Placeholder.configure({
                placeholder: "What it is, who it's for, what makes it good.",
            }),
        ],
        content: value,
        editable: !disabled,
        editorProps: {
            attributes: {
                class: "prose prose-sm min-h-40 max-w-none px-3 py-2 focus:outline-none dark:prose-invert",
                ...(id ? { id } : {}),
                "aria-label": "Description",
                "aria-multiline": "true",
                role: "textbox",
            },
        },
        onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    });

    // A Discard or a new baseline changes `value` under a mounted editor.
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- null before Tiptap mounts under next/dynamic
        if (!editor || source) return;
        if (editor.getHTML() !== value) {
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [editor, value, source]);

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
        editor?.setEditable(!disabled);
    }, [editor, disabled]);

    /* eslint-disable @typescript-eslint/no-unnecessary-condition --
       the editor is null on the first render behind next/dynamic. */
    const state = useEditorState({
        editor,
        selector: ({ editor: e }) =>
            e
                ? {
                      bold: e.isActive("bold"),
                      italic: e.isActive("italic"),
                      underline: e.isActive("underline"),
                      strike: e.isActive("strike"),
                      bullet: e.isActive("bulletList"),
                      ordered: e.isActive("orderedList"),
                      quote: e.isActive("blockquote"),
                      link: e.isActive("link"),
                      href:
                          (e.getAttributes("link").href as
                              string | undefined) ?? "",
                      style: e.isActive("heading", { level: 2 })
                          ? "h2"
                          : e.isActive("heading", { level: 3 })
                            ? "h3"
                            : "text",
                      canUndo: e.can().undo(),
                      canRedo: e.can().redo(),
                  }
                : null,
    });
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */

    const plain = stripHtml(value).length;
    const over = value.length > LIMITS.description;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
    if (!editor || !state) {
        return (
            <div className="min-h-48 rounded-md border border-input bg-field" />
        );
    }
    const chain = () => editor.chain().focus();
    const off = disabled || source;

    return (
        <div
            className={cn(
                "rounded-md border bg-field",
                invalid || over ? "border-destructive" : "border-input",
            )}
        >
            <div
                role="toolbar"
                aria-label="Formatting"
                className="flex flex-wrap items-center gap-0.5 border-b p-1"
            >
                <Tool
                    label="Bold"
                    pressed={state.bold}
                    disabled={off}
                    onClick={() => chain().toggleBold().run()}
                >
                    <Bold />
                </Tool>
                <Tool
                    label="Italic"
                    pressed={state.italic}
                    disabled={off}
                    onClick={() => chain().toggleItalic().run()}
                >
                    <Italic />
                </Tool>
                <Tool
                    label="Underline"
                    pressed={state.underline}
                    disabled={off}
                    onClick={() => chain().toggleUnderline().run()}
                >
                    <Underline />
                </Tool>
                <Gap />
                <Tool
                    label="Bulleted list"
                    pressed={state.bullet}
                    disabled={off}
                    onClick={() => chain().toggleBulletList().run()}
                >
                    <List />
                </Tool>
                <Tool
                    label="Numbered list"
                    pressed={state.ordered}
                    disabled={off}
                    onClick={() => chain().toggleOrderedList().run()}
                >
                    <ListOrdered />
                </Tool>
                <Gap />
                <LinkTool
                    active={state.link}
                    current={state.href}
                    disabled={off}
                    onSet={(href) =>
                        href
                            ? chain()
                                  .extendMarkRange("link")
                                  .setLink({ href })
                                  .run()
                            : chain().extendMarkRange("link").unsetLink().run()
                    }
                />
                <Gap />
                <div
                    role="radiogroup"
                    aria-label="Text style"
                    className="flex gap-0.5"
                >
                    {(["text", "h2", "h3"] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={state.style === s}
                            disabled={off}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                                s === "text"
                                    ? chain().setParagraph().run()
                                    : chain()
                                          .toggleHeading({
                                              level: s === "h2" ? 2 : 3,
                                          })
                                          .run()
                            }
                            className={cn(
                                "h-7 rounded px-2 text-xs font-medium disabled:opacity-60 coarse:h-11",
                                state.style === s
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:bg-muted",
                            )}
                        >
                            {s === "text" ? "Text" : s.toUpperCase()}
                        </button>
                    ))}
                </div>
                <Gap />
                <button
                    type="button"
                    aria-expanded={more}
                    onClick={() => setMore((m) => !m)}
                    className="h-7 rounded px-2 text-xs font-medium text-muted-foreground hover:bg-muted coarse:h-11"
                >
                    {more ? "Fewer" : "More"}
                </button>
                {more ? (
                    <>
                        <Gap />
                        <Tool
                            label="Strikethrough"
                            pressed={state.strike}
                            disabled={off}
                            onClick={() => chain().toggleStrike().run()}
                        >
                            <Strikethrough />
                        </Tool>
                        <Tool
                            label="Quote"
                            pressed={state.quote}
                            disabled={off}
                            onClick={() => chain().toggleBlockquote().run()}
                        >
                            <Quote />
                        </Tool>
                        <Tool
                            label="Horizontal rule"
                            disabled={off}
                            onClick={() => chain().setHorizontalRule().run()}
                        >
                            <Minus />
                        </Tool>
                        <Tool
                            label="Undo"
                            disabled={off || !state.canUndo}
                            onClick={() => chain().undo().run()}
                        >
                            <Undo2 />
                        </Tool>
                        <Tool
                            label="Redo"
                            disabled={off || !state.canRedo}
                            onClick={() => chain().redo().run()}
                        >
                            <Redo2 />
                        </Tool>
                        <Tool
                            label="Clear formatting"
                            disabled={off}
                            onClick={() =>
                                chain().unsetAllMarks().clearNodes().run()
                            }
                        >
                            <Eraser />
                        </Tool>
                    </>
                ) : null}
                <label className="ml-auto flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <Switch
                        checked={source}
                        onCheckedChange={setSource}
                        disabled={disabled}
                        aria-label="Edit as HTML"
                    />
                    HTML
                </label>
            </div>
            {source ? (
                <Textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    rows={8}
                    aria-label="Description as HTML"
                    className="rounded-none border-0 font-mono text-[12px] focus-visible:ring-0"
                />
            ) : (
                <EditorContent editor={editor} />
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[11.5px] text-muted-foreground">
                <span
                    className={cn("min-w-0 flex-1", over && "text-destructive")}
                >
                    {over
                        ? "Over the limit. The count that matters is the markup, not the words."
                        : "Formatting the shop can't show is dropped on save, so the toolbar only offers what survives."}
                </span>
                <span className="tabular-nums">{plain} characters</span>
                <span
                    className={cn(
                        "tabular-nums",
                        over && "font-semibold text-destructive",
                    )}
                >
                    {value.length.toLocaleString("en-IN")} / 5,000 markup
                </span>
            </div>
        </div>
    );
}

function Gap() {
    return <span aria-hidden className="mx-0.5 h-[18px] w-px bg-border" />;
}

function Tool({
    label,
    pressed,
    disabled,
    onClick,
    children,
}: {
    label: string;
    pressed?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            // Keep the selection where it is while the button takes the click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={cn(
                "grid size-7 place-items-center rounded disabled:opacity-60 coarse:size-11 [&_svg]:size-4",
                pressed
                    ? "bg-muted text-foreground ring-1 ring-foreground"
                    : "text-muted-foreground hover:bg-muted",
            )}
        >
            {children}
        </button>
    );
}

function LinkTool({
    active,
    current,
    disabled,
    onSet,
}: {
    active: boolean;
    current: string;
    disabled: boolean;
    onSet: (href: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [href, setHref] = useState(current);
    return (
        <Popover
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (o) setHref(current);
            }}
        >
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Link"
                    aria-pressed={active}
                    disabled={disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                        "grid size-7 place-items-center rounded disabled:opacity-60 coarse:size-11 [&_svg]:size-4",
                        active
                            ? "bg-muted text-foreground ring-1 ring-foreground"
                            : "text-muted-foreground hover:bg-muted",
                    )}
                >
                    <Link2 />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
                <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSet(href.trim());
                        setOpen(false);
                    }}
                >
                    <label htmlFor="desc-link" className="text-xs font-medium">
                        Link to
                    </label>
                    <Input
                        id="desc-link"
                        value={href}
                        onChange={(e) => setHref(e.target.value)}
                        placeholder="https://… or /about"
                        className="font-mono text-[12px]"
                    />
                    <div className="flex gap-2">
                        <Button type="submit" size="sm">
                            Apply
                        </Button>
                        {active ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    onSet("");
                                    setOpen(false);
                                }}
                            >
                                Remove
                            </Button>
                        ) : null}
                    </div>
                </form>
            </PopoverContent>
        </Popover>
    );
}
