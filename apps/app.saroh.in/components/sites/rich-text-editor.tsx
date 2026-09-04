"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Separator } from "@saroh/ui/separator";
import { Textarea } from "@saroh/ui/textarea";
import { Toggle } from "@saroh/ui/toggle";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Baseline,
    Bold,
    Code2,
    Eraser,
    Highlighter,
    ImagePlus,
    Italic,
    Link2,
    List,
    ListOrdered,
    Minus,
    Quote,
    Redo2,
    Strikethrough,
    Subscript as SubscriptIcon,
    Superscript as SuperscriptIcon,
    Table2,
    Underline as UnderlineIcon,
    Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { MediaPicker } from "@/components/sites/media-picker";

/**
 * Write copy without typing markup (#208).
 *
 * A richText section and the site footer were edited in a raw textarea: to
 * make a word bold on their own website, a merchant typed <strong>. This is
 * the editor that replaces that — Tiptap underneath, the workspace's own
 * shadcn primitives on top, modelled on Echo Editor's toolbar.
 *
 * THE ALLOWLIST IS THE SPEC. Publish runs `richText.value` and the footer
 * through `sanitize.ts`, an allowlist applied before the immutable snapshot is
 * written. Anything this editor can produce that the allowlist strips is
 * formatting the merchant applies, sees, and then loses at publish — the worst
 * failure, because it is silent and only visible on the live site. So every
 * extension loaded here maps onto something the allowlist keeps, and the ones
 * that do not — task lists render an <input>, embeds an <iframe> — are not
 * loaded, however good they look in the reference.
 *
 * Colour, highlight, font family and size are included on a product call.
 * They survive publish (the sanitizer keeps `style` on every tag), and they
 * are the one place a merchant can step outside the site's curated palette.
 *
 * PASTE IS WHERE THIS EARNS ITS KEEP. ProseMirror parses pasted Word,
 * Google-Docs and web HTML INTO the schema, so whatever is not one of these
 * extensions is dropped on the way in. What the merchant sees after a paste
 * is already what they will get.
 */

const FONTS: { label: string; value: string | null }[] = [
    { label: "Site font", value: null },
    { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
    { label: "Sans", value: "system-ui, sans-serif" },
    { label: "Mono", value: "ui-monospace, Menlo, monospace" },
];

const SIZES: { label: string; value: string | null }[] = [
    { label: "Normal", value: null },
    { label: "Small", value: "0.875rem" },
    { label: "Large", value: "1.25rem" },
    { label: "Larger", value: "1.5rem" },
    { label: "Display", value: "2rem" },
];

/** A small grid, not a wheel: enough to emphasise, not enough to redesign. */
const COLOURS = [
    "#111111",
    "#6b7280",
    "#b91c1c",
    "#c2410c",
    "#a16207",
    "#15803d",
    "#0f766e",
    "#1d4ed8",
    "#6d28d9",
    "#be185d",
];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff"];

/**
 * Image with the attributes the sanitizer keeps. The stock extension carries
 * src, alt and title; width and height are what stop the live page reflowing
 * when the picture arrives, and the MediaPicker already knows them.
 */
const SizedImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: { default: null },
            height: { default: null },
        };
    },
});

export function RichTextEditor({
    value,
    onChange,
    placeholder = "Start writing…",
    className,
}: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
}) {
    const editor = useEditor({
        // No SSR guard here on purpose. This component is only ever reached
        // through `next/dynamic` with `ssr: false`, so there is no server pass
        // to mismatch against — and `immediatelyRender: false` moves editor
        // creation into an effect that, under React 19 in development, left
        // the hook returning null and the field an empty box.
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3, 4] },
                link: {
                    openOnClick: false,
                    autolink: true,
                    // The sanitizer sets rel/target itself; the editor
                    // stating them keeps the two in agreement.
                    HTMLAttributes: {
                        rel: "noopener noreferrer",
                        target: "_blank",
                    },
                },
            }),
            TextStyleKit,
            Highlight.configure({ multicolor: true }),
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            Subscript,
            Superscript,
            SizedImage,
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
            Placeholder.configure({ placeholder }),
            CharacterCount,
        ],
        content: value,
        editorProps: {
            attributes: {
                // The merchant's own prose styles, so what they write here
                // reads like it will on the page.
                class: "prose prose-sm max-w-none min-h-40 px-3 py-2 focus:outline-none dark:prose-invert",
            },
        },
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });

    /*
     * Two components on purpose. `useEditorState` builds its state manager
     * around the editor it is FIRST given, so it belongs where the editor is
     * guaranteed to exist rather than beside the hook that creates it — a
     * toolbar that read state next to `useEditor` waited on a null it never
     * got, and the field was an empty box. Tiptap 3 creates the editor
     * synchronously here (no SSR pass, see above), so there is no null to guard
     * against; the split is the documented shape and the cheaper one to reason
     * about.
     */
    /* eslint-disable @typescript-eslint/no-unnecessary-condition --
       Tiptap 3 types `useEditor()` as never null unless `immediatelyRender` is
       false. Under React 19 behind next/dynamic it IS null on the first
       render, and every reader downstream crashed on it — `isActive` in the
       toolbar, `getHTML` in the sync effect — into the route's error
       boundary. The guard is load-bearing whatever the types say. */
    if (!editor) {
        return (
            <div
                className={cn(
                    "min-h-40 rounded-md border bg-background",
                    className,
                )}
            />
        );
    }
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    return (
        <EditorSurface
            editor={editor}
            value={value}
            onChange={onChange}
            className={className}
        />
    );
}

function EditorSurface({
    editor,
    value,
    onChange,
    className,
}: {
    editor: NonNullable<ReturnType<typeof useEditor>>;
    value: string;
    onChange: (html: string) => void;
    className?: string;
}) {
    const [source, setSource] = useState(false);

    /*
     * Keep the editor in step with the field it edits. Switching sections
     * changes `value` under a mounted editor; without this the merchant would
     * see the previous section's copy. Guarded against echoing our own update
     * back, which would reset the cursor on every keystroke.
     */
    useEffect(() => {
        if (source) return;
        if (editor.getHTML() !== value) {
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [editor, value, source]);

    // Active states read through a selector, so the toolbar re-renders on the
    // marks it shows and not on every transaction.
    /* eslint-disable @typescript-eslint/no-unnecessary-condition --
       the types say `e` is never null; the runtime says otherwise. */
    const state = useEditorState({
        editor,
        // The types say `e` is never null; the runtime says otherwise —
        // `useEditorState` runs the selector once against a null editor
        // before the real one arrives, and reading `isActive` off null
        // crashed the whole editor into the route's error boundary. The
        // lint rule that flagged this guard as unnecessary was wrong here.
        selector: ({ editor: e }) =>
            e
                ? {
                      bold: e.isActive("bold"),
                      italic: e.isActive("italic"),
                      underline: e.isActive("underline"),
                      strike: e.isActive("strike"),
                      sub: e.isActive("subscript"),
                      sup: e.isActive("superscript"),
                      bullet: e.isActive("bulletList"),
                      ordered: e.isActive("orderedList"),
                      quote: e.isActive("blockquote"),
                      code: e.isActive("codeBlock"),
                      link: e.isActive("link"),
                      heading:
                          [1, 2, 3, 4].find((l) =>
                              e.isActive("heading", { level: l }),
                          ) ?? 0,
                      align:
                          ["left", "center", "right"].find((a) =>
                              e.isActive({ textAlign: a }),
                          ) ?? "left",
                      font:
                          (e.getAttributes("textStyle").fontFamily as
                              string | undefined) ?? null,
                      size:
                          (e.getAttributes("textStyle").fontSize as
                              string | undefined) ?? null,
                      colour:
                          (e.getAttributes("textStyle").color as
                              string | undefined) ?? null,
                      canUndo: e.can().undo(),
                      canRedo: e.can().redo(),
                      chars:
                          (
                              e.storage as {
                                  characterCount?: { characters: () => number };
                              }
                          ).characterCount?.characters() ?? 0,
                  }
                : null,
    });
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */

    if (!state) return null;

    const chain = () => editor.chain().focus();

    return (
        <div className={cn("rounded-md border bg-background", className)}>
            <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
                <Tool
                    label="Undo"
                    onClick={() => chain().undo().run()}
                    disabled={!state.canUndo}
                >
                    <Undo2 />
                </Tool>
                <Tool
                    label="Redo"
                    onClick={() => chain().redo().run()}
                    disabled={!state.canRedo}
                >
                    <Redo2 />
                </Tool>
                <Tool
                    label="Clear formatting"
                    onClick={() => chain().unsetAllMarks().clearNodes().run()}
                >
                    <Eraser />
                </Tool>
                <Gap />

                <Select
                    value={String(state.heading)}
                    onValueChange={(v) => {
                        const level = Number(v);
                        if (level === 0) chain().setParagraph().run();
                        else
                            chain()
                                .toggleHeading({
                                    level: level as 1 | 2 | 3 | 4,
                                })
                                .run();
                    }}
                >
                    <SelectTrigger
                        className="h-7 w-[7.5rem] text-xs"
                        aria-label="Text style"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="0">Paragraph</SelectItem>
                        <SelectItem value="1">Heading 1</SelectItem>
                        <SelectItem value="2">Heading 2</SelectItem>
                        <SelectItem value="3">Heading 3</SelectItem>
                        <SelectItem value="4">Heading 4</SelectItem>
                    </SelectContent>
                </Select>
                <Select
                    value={state.font ?? "__site"}
                    onValueChange={(v) =>
                        v === "__site"
                            ? chain().unsetFontFamily().run()
                            : chain().setFontFamily(v).run()
                    }
                >
                    <SelectTrigger
                        className="h-7 w-24 text-xs"
                        aria-label="Font"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {FONTS.map((f) => (
                            <SelectItem
                                key={f.label}
                                value={f.value ?? "__site"}
                            >
                                {f.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={state.size ?? "__normal"}
                    onValueChange={(v) =>
                        v === "__normal"
                            ? chain().unsetFontSize().run()
                            : chain().setFontSize(v).run()
                    }
                >
                    <SelectTrigger
                        className="h-7 w-24 text-xs"
                        aria-label="Size"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SIZES.map((s) => (
                            <SelectItem
                                key={s.label}
                                value={s.value ?? "__normal"}
                            >
                                {s.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Gap />

                <Mark
                    label="Bold"
                    pressed={state.bold}
                    onPressedChange={() => chain().toggleBold().run()}
                >
                    <Bold />
                </Mark>
                <Mark
                    label="Italic"
                    pressed={state.italic}
                    onPressedChange={() => chain().toggleItalic().run()}
                >
                    <Italic />
                </Mark>
                <Mark
                    label="Underline"
                    pressed={state.underline}
                    onPressedChange={() => chain().toggleUnderline().run()}
                >
                    <UnderlineIcon />
                </Mark>
                <Mark
                    label="Strikethrough"
                    pressed={state.strike}
                    onPressedChange={() => chain().toggleStrike().run()}
                >
                    <Strikethrough />
                </Mark>
                <Mark
                    label="Subscript"
                    pressed={state.sub}
                    onPressedChange={() => chain().toggleSubscript().run()}
                >
                    <SubscriptIcon />
                </Mark>
                <Mark
                    label="Superscript"
                    pressed={state.sup}
                    onPressedChange={() => chain().toggleSuperscript().run()}
                >
                    <SuperscriptIcon />
                </Mark>
                <Gap />

                <Swatches
                    label="Text colour"
                    icon={<Baseline />}
                    colours={COLOURS}
                    current={state.colour}
                    onPick={(c) =>
                        c
                            ? chain().setColor(c).run()
                            : chain().unsetColor().run()
                    }
                />
                <Swatches
                    label="Highlight"
                    icon={<Highlighter />}
                    colours={HIGHLIGHTS}
                    current={null}
                    onPick={(c) =>
                        c
                            ? chain().setHighlight({ color: c }).run()
                            : chain().unsetHighlight().run()
                    }
                />
                <Gap />

                <Mark
                    label="Align left"
                    pressed={state.align === "left"}
                    onPressedChange={() => chain().setTextAlign("left").run()}
                >
                    <AlignLeft />
                </Mark>
                <Mark
                    label="Align centre"
                    pressed={state.align === "center"}
                    onPressedChange={() => chain().setTextAlign("center").run()}
                >
                    <AlignCenter />
                </Mark>
                <Mark
                    label="Align right"
                    pressed={state.align === "right"}
                    onPressedChange={() => chain().setTextAlign("right").run()}
                >
                    <AlignRight />
                </Mark>
                <Gap />

                <Mark
                    label="Bulleted list"
                    pressed={state.bullet}
                    onPressedChange={() => chain().toggleBulletList().run()}
                >
                    <List />
                </Mark>
                <Mark
                    label="Numbered list"
                    pressed={state.ordered}
                    onPressedChange={() => chain().toggleOrderedList().run()}
                >
                    <ListOrdered />
                </Mark>
                <Mark
                    label="Quote"
                    pressed={state.quote}
                    onPressedChange={() => chain().toggleBlockquote().run()}
                >
                    <Quote />
                </Mark>
                <Mark
                    label="Code block"
                    pressed={state.code}
                    onPressedChange={() => chain().toggleCodeBlock().run()}
                >
                    <Code2 />
                </Mark>
                <Tool
                    label="Horizontal rule"
                    onClick={() => chain().setHorizontalRule().run()}
                >
                    <Minus />
                </Tool>
                <Gap />

                <LinkTool
                    active={state.link}
                    current={
                        (editor.getAttributes("link").href as
                            string | undefined) ?? ""
                    }
                    onSet={(href) =>
                        href
                            ? chain()
                                  .extendMarkRange("link")
                                  .setLink({ href })
                                  .run()
                            : chain().extendMarkRange("link").unsetLink().run()
                    }
                />
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label="Insert image"
                        >
                            <ImagePlus className="size-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80">
                        <MediaPicker
                            label="Choose a photo"
                            onPick={(img) =>
                                chain()
                                    .setImage({
                                        src: img.src,
                                        alt: "",
                                        ...(img.width && img.height
                                            ? {
                                                  width: img.width,
                                                  height: img.height,
                                              }
                                            : {}),
                                    })
                                    .run()
                            }
                        />
                    </PopoverContent>
                </Popover>
                <Tool
                    label="Insert table"
                    onClick={() =>
                        chain()
                            .insertTable({
                                rows: 3,
                                cols: 3,
                                withHeaderRow: true,
                            })
                            .run()
                    }
                >
                    <Table2 />
                </Tool>
                <Gap />

                <Toggle
                    size="sm"
                    className="h-7 px-2 text-xs"
                    pressed={source}
                    onPressedChange={(on) => {
                        // Leaving source view pushes whatever was typed back
                        // through the schema, so a stray tag is normalised the
                        // way a paste would be.
                        if (!on)
                            editor.commands.setContent(value, {
                                emitUpdate: false,
                            });
                        setSource(on);
                    }}
                    aria-label="Edit as HTML"
                >
                    HTML
                </Toggle>
            </div>

            {source ? (
                <Textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={10}
                    className="rounded-none border-0 font-mono text-xs focus-visible:ring-0"
                    aria-label="HTML source"
                />
            ) : (
                <EditorContent editor={editor} />
            )}

            <div className="flex justify-end border-t px-3 py-1 text-[0.6875rem] tabular-nums text-muted-foreground">
                {state.chars} characters
            </div>
        </div>
    );
}

function Gap() {
    return <Separator orientation="vertical" className="mx-1 h-5" />;
}

function Tool({
    label,
    onClick,
    disabled,
    children,
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 [&>svg]:size-4"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

function Mark({
    label,
    pressed,
    onPressedChange,
    children,
}: {
    label: string;
    pressed: boolean;
    onPressedChange: () => void;
    children: React.ReactNode;
}) {
    return (
        <Toggle
            size="sm"
            className="h-7 w-7 p-0 [&>svg]:size-4"
            pressed={pressed}
            onPressedChange={onPressedChange}
            aria-label={label}
            title={label}
        >
            {children}
        </Toggle>
    );
}

function Swatches({
    label,
    icon,
    colours,
    current,
    onPick,
}: {
    label: string;
    icon: React.ReactNode;
    colours: string[];
    current: string | null;
    onPick: (colour: string | null) => void;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 [&>svg]:size-4"
                    aria-label={label}
                    title={label}
                >
                    {icon}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
                <div className="grid grid-cols-5 gap-1">
                    {colours.map((c) => (
                        <button
                            key={c}
                            type="button"
                            aria-label={c}
                            aria-pressed={current === c}
                            onClick={() => onPick(c)}
                            className={cn(
                                "size-6 rounded border transition-transform active:scale-95",
                                current === c &&
                                    "ring-2 ring-ring ring-offset-1",
                            )}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 w-full text-xs"
                    onClick={() => onPick(null)}
                >
                    None
                </Button>
            </PopoverContent>
        </Popover>
    );
}

function LinkTool({
    active,
    current,
    onSet,
}: {
    active: boolean;
    current: string;
    onSet: (href: string) => void;
}) {
    const [href, setHref] = useState(current);
    return (
        <Popover onOpenChange={(open) => open && setHref(current)}>
            <PopoverTrigger asChild>
                <Toggle
                    size="sm"
                    className="h-7 w-7 p-0 [&>svg]:size-4"
                    pressed={active}
                    aria-label="Link"
                    title="Link"
                >
                    <Link2 />
                </Toggle>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
                <form
                    className="grid gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSet(href.trim());
                    }}
                >
                    <input
                        value={href}
                        onChange={(e) => setHref(e.target.value)}
                        placeholder="https://… or /about"
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        aria-label="Link address"
                    />
                    <div className="flex gap-2">
                        <Button type="submit" size="sm" className="h-7 text-xs">
                            Apply
                        </Button>
                        {active ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => onSet("")}
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
