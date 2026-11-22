"use client";

import { EmptyState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@saroh/ui/popover";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { LucideIcon } from "lucide-react";
import {
    Bold,
    CalendarCheck,
    Heading,
    Heading2,
    ImageIcon,
    Italic,
    LayoutGrid,
    Link2,
    List,
    ListOrdered,
    ListTree,
    Minus,
    Quote,
    RectangleHorizontal,
    ShoppingBag,
    SlidersHorizontal,
    SquareStack,
    Tag,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { MediaPicker } from "@/components/shared/fields/media-picker";

import type { EmbedKind } from "./embeds/insert-embed";
import { insertEmbed } from "./embeds/insert-embed";

/* On demand: the picker reads Services and Products when it opens. */
const EmbedPicker = dynamic(
    () => import("./embeds/embed-picker").then((m) => m.EmbedPicker),
    { ssr: false },
);

/**
 * The writing surface's two menus (U15, `blogdesk/WXWInsert`): the format
 * bar over a selection, and the add menu that "/" opens on an empty line.
 * Both run the editor's existing nodes; every rarer control stays in the
 * full toolbar, which More formatting shows (C10). From your business
 * (U15b): a service card and a product, which store only which one;
 * an Offer and a Book now button the same way (W2). A highlight box,
 * contents, a gallery and a button are the post's own blocks
 * (`embeds/post-blocks.ts`). Video and Instagram posts are left out
 * (owner, 22 Nov).
 */

/** One thing the add menu puts in the post. */
export interface AddItem {
    key: string;
    label: string;
    group: "From your business" | "Write" | "Media";
    icon: LucideIcon;
    /** What typing it as markdown does, shown beside it. */
    keys?: string;
    /** Runs it at the cursor; absent for one that asks which first. */
    run?: (editor: Editor) => void;
}

/** What an item without `run` asks for before it adds. */
type Picking = "image" | "gallery" | EmbedKind;

export const ADD_ITEMS: AddItem[] = [
    {
        key: "service",
        label: "Service card",
        group: "From your business",
        icon: Tag,
    },
    {
        key: "product",
        label: "Product",
        group: "From your business",
        icon: ShoppingBag,
    },
    {
        key: "offer",
        label: "Offer",
        group: "From your business",
        icon: Tag,
    },
    {
        key: "book",
        label: "Book now button",
        group: "From your business",
        icon: CalendarCheck,
    },
    {
        key: "heading",
        label: "Heading",
        group: "Write",
        icon: Heading,
        keys: "##",
        run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
        key: "list",
        label: "List",
        group: "Write",
        icon: List,
        keys: "-",
        run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
        key: "numbered",
        label: "Numbered list",
        group: "Write",
        icon: ListOrdered,
        keys: "1.",
        run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
        key: "quote",
        label: "Quote",
        group: "Write",
        icon: Quote,
        keys: ">",
        run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
        key: "highlight",
        label: "Highlight box",
        group: "Write",
        icon: SquareStack,
        run: (e) => e.chain().focus().wrapIn("highlightBox").run(),
    },
    {
        key: "contents",
        label: "Contents",
        group: "Write",
        icon: ListTree,
        run: (e) => e.chain().focus().insertContent({ type: "contents" }).run(),
    },
    {
        key: "divider",
        label: "Divider",
        group: "Write",
        icon: Minus,
        keys: "---",
        run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
    { key: "image", label: "Image", group: "Media", icon: ImageIcon },
    { key: "gallery", label: "Gallery", group: "Media", icon: LayoutGrid },
    {
        key: "button",
        label: "Button",
        group: "Media",
        icon: RectangleHorizontal,
        // Asks its words and link in place (`PostButtonView`).
        run: (e) =>
            e
                .chain()
                .focus()
                .insertContent({
                    type: "postButton",
                    attrs: { href: "", label: "" },
                })
                .run(),
    },
];

/** Put a gallery at the cursor, starting with one photo (W2). */
export function insertGallery(
    editor: Editor,
    img: { src: string; width?: number | null; height?: number | null },
) {
    editor
        .chain()
        .focus()
        .insertContent({
            type: "gallery",
            content: [
                {
                    type: "image",
                    attrs: {
                        src: img.src,
                        alt: "",
                        ...(img.width && img.height
                            ? { width: img.width, height: img.height }
                            : {}),
                    },
                },
            ],
        })
        .run();
}

/** Put a picked photo at the cursor, with the size the page needs. */
export function insertImage(
    editor: Editor,
    img: { src: string; width?: number | null; height?: number | null },
) {
    editor
        .chain()
        .focus()
        .setImage({
            src: img.src,
            alt: "",
            ...(img.width && img.height
                ? { width: img.width, height: img.height }
                : {}),
        })
        .run();
}

/** The items whose words start with, or contain, what was typed. */
export function filterAddItems(query: string): AddItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return ADD_ITEMS;
    const hits = ADD_ITEMS.filter((i) => i.label.toLowerCase().includes(q));
    // "button" is Button before Book now button: a name that starts with it.
    const starts = (i: AddItem) => i.label.toLowerCase().startsWith(q);
    return [...hits.filter(starts), ...hits.filter((i) => !starts(i))];
}

/**
 * The add list: Write and Media, each item one row. Shared by the "/" menu
 * and the post editor's rail › Add, so both add the same things.
 */
export function AddList({
    editor,
    items = ADD_ITEMS,
    active,
    startPicking = null,
    onDone,
}: {
    editor: Editor | null;
    items?: AddItem[];
    /** The row the keyboard is on, by key. */
    active?: string;
    /** Open on what an item asks for (Enter on it in the "/" menu). */
    startPicking?: Picking | null;
    onDone?: () => void;
}) {
    const [picking, setPicking] = useState<Picking | null>(startPicking);
    if (picking && picking !== "image" && picking !== "gallery" && editor) {
        return (
            <EmbedPicker
                kind={picking}
                onBack={() => setPicking(null)}
                onPick={(id) => {
                    insertEmbed(editor, picking, id);
                    setPicking(null);
                    onDone?.();
                }}
            />
        );
    }
    if (picking && editor) {
        return (
            <div className="grid gap-2 p-2">
                <MediaPicker
                    label={
                        picking === "gallery"
                            ? "Choose the gallery's first photo"
                            : "Choose a photo"
                    }
                    onPick={(img) => {
                        if (picking === "gallery") insertGallery(editor, img);
                        else insertImage(editor, img);
                        setPicking(null);
                        onDone?.();
                    }}
                />
            </div>
        );
    }
    const groups = ["From your business", "Write", "Media"] as const;
    return (
        <div role="listbox" aria-label="Add to the post" className="grid p-1.5">
            {items.length === 0 ? (
                <EmptyState size="inline" title="Nothing matches that" />
            ) : null}
            {groups.map((g) => {
                const rows = items.filter((i) => i.group === g);
                if (rows.length === 0) return null;
                return (
                    <div key={g} className="grid">
                        <p className="px-2.5 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                            {g}
                        </p>
                        {rows.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                role="option"
                                aria-selected={active === item.key}
                                disabled={!editor}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    if (!editor) return;
                                    if (!item.run) {
                                        setPicking(item.key as Picking);
                                        return;
                                    }
                                    item.run(editor);
                                    onDone?.();
                                }}
                                className={cn(
                                    // 43px rows at 15px (W1.2); h-11 is the nearest.
                                    "flex h-11 items-center gap-3 rounded-[7px] px-2.5 text-left text-[0.9375rem] hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    active === item.key &&
                                        "bg-secondary font-semibold",
                                )}
                            >
                                <item.icon
                                    aria-hidden
                                    className="size-4 shrink-0"
                                />
                                {item.label}
                                {item.keys ? (
                                    <kbd className="ml-auto font-mono text-xs font-normal text-muted-foreground">
                                        {item.keys}
                                    </kbd>
                                ) : null}
                            </button>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

/** Whether the cursor sits on an empty paragraph: where "/" adds. */
function onEmptyLine(editor: Editor): boolean {
    const { $from, empty } = editor.state.selection;
    return (
        empty &&
        $from.parent.type.name === "paragraph" &&
        $from.parent.content.size === 0
    );
}

/**
 * "/" on an empty line opens the add menu at the cursor, "Type to filter":
 * ↑ ↓ choose, Enter adds, Esc closes and puts the cursor back.
 */
export function SlashMenu({ editor }: { editor: Editor }) {
    const [at, setAt] = useState<{ top: number; left: number } | null>(null);
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const [picking, setPicking] = useState<Picking | null>(null);
    const box = useRef<HTMLInputElement>(null);
    const open = useRef(false);
    useEffect(() => {
        open.current = at !== null;
    }, [at]);

    useEffect(() => {
        // The view mounts after the first render (immediatelyRender off), and
        // reading editor.view before then throws: listen once it exists.
        let dom: HTMLElement | null = null;
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            /*
             * Typed straight after "/", before the filter has focus: the
             * letters went into the post and the filter read "ervice", so
             * the list showed nothing (bug, 22 Nov). They are the filter's.
             */
            if (open.current) {
                if (e.key.length !== 1 && e.key !== "Backspace") return;
                e.preventDefault();
                setQuery((q) =>
                    e.key === "Backspace" ? q.slice(0, -1) : q + e.key,
                );
                setIndex(0);
                box.current?.focus();
                return;
            }
            if (e.key !== "/" || !onEmptyLine(editor)) return;
            e.preventDefault();
            const c = editor.view.coordsAtPos(editor.state.selection.from);
            open.current = true;
            setQuery("");
            setIndex(0);
            setPicking(null);
            setAt({ top: c.bottom, left: c.left });
        };
        const attach = () => {
            if (dom || editor.isDestroyed) return;
            dom = editor.view.dom;
            dom.addEventListener("keydown", onKey);
        };
        // Tiptap emits "create" a tick after mount and only then sets
        // isInitialized, so the create handler must not wait on that flag.
        if (editor.isInitialized) attach();
        else editor.on("create", attach);
        return () => {
            editor.off("create", attach);
            dom?.removeEventListener("keydown", onKey);
        };
    }, [editor]);

    const items = filterAddItems(query);
    const close = () => {
        setAt(null);
        // Not editor.commands: the compiler reads that getter during render to
        // cache this, and it throws until the editor has mounted.
        editor.chain().focus().run();
    };
    const choose = (item: AddItem | undefined) => {
        if (!item) return;
        if (item.run) {
            item.run(editor);
            setAt(null);
        } else setPicking(item.key as Picking);
    };
    return (
        <Popover
            open={at !== null}
            onOpenChange={(open) => {
                if (!open) close();
            }}
        >
            {/* The cursor is the anchor: a point where "/" was typed. */}
            <PopoverAnchor
                style={{ top: at?.top ?? 0, left: at?.left ?? 0 }}
                className="pointer-events-none fixed size-0"
            />
            <PopoverContent
                align="start"
                sideOffset={6}
                aria-label="Add to the post"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    box.current?.focus();
                }}
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="w-80 overflow-hidden rounded-xl p-0"
            >
                {/* A plain "/" and the words to its right (W1.3): no box. */}
                <div className="flex h-12 items-center gap-2 border-b px-4 text-[0.9375rem]">
                    <b className="font-mono font-semibold">/</b>
                    <Input
                        ref={box}
                        dense
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIndex(0);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setIndex((i) =>
                                    Math.min(i + 1, items.length - 1),
                                );
                            } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setIndex((i) => Math.max(i - 1, 0));
                            } else if (e.key === "Enter") {
                                e.preventDefault();
                                choose(items[index]);
                            }
                        }}
                        placeholder="Type to filter"
                        aria-label="Type to filter"
                        className="h-8 border-0 bg-transparent px-0 text-[0.9375rem] shadow-none placeholder:text-right focus-visible:border-0 focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                </div>
                {/* The whole list shows (W1.1); only a short window scrolls it. */}
                <div className="max-h-[min(calc(var(--radix-popover-content-available-height,80vh)-5.5rem),44rem)] overflow-y-auto">
                    <AddList
                        key={picking ?? "list"}
                        editor={editor}
                        startPicking={picking}
                        items={items}
                        active={items[index]?.key}
                        onDone={() => setAt(null)}
                    />
                </div>
                {/* A picker says it itself, under its preview (W3). */}
                {picking ? null : (
                    <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                        Enter to add · Esc to close
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}

/** One quiet button on the format bar. */
function FormatButton({
    label,
    pressed,
    onClick,
    children,
}: {
    label: string;
    pressed?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(
                "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[7px] px-2 text-[0.8125rem] font-semibold transition-colors duration-fast hover:bg-background/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4",
                pressed && "bg-background/20",
            )}
        >
            {children}
        </button>
    );
}

/**
 * The format bar over a selection (`WXWInsert`): Bold, Italic, Link |
 * Heading, Quote, List | More formatting, which shows the full toolbar
 * with every control the editor has (colour, highlight, alignment, table,
 * sub and superscript, HTML).
 */
export function FormatBar({
    editor,
    onMoreFormatting,
}: {
    editor: Editor;
    onMoreFormatting: () => void;
}) {
    const [linking, setLinking] = useState<string | null>(null);
    const chain = () => editor.chain().focus();
    const is = (name: string, attrs?: Record<string, unknown>) =>
        editor.isActive(name, attrs);
    return (
        <BubbleMenu
            editor={editor}
            role="toolbar"
            aria-label="Format the selected text"
            className="flex items-center gap-0.5 rounded-[10px] bg-foreground p-1 text-background shadow-lg"
        >
            {linking !== null ? (
                <form
                    className="flex items-center gap-1"
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
                    <input
                        autoFocus
                        value={linking}
                        onChange={(e) => setLinking(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") setLinking(null);
                        }}
                        placeholder="https://… or /about"
                        aria-label="Link address"
                        className="h-9 w-56 rounded-[7px] bg-background/10 px-2 text-[0.8125rem] text-background outline-none placeholder:text-background/60"
                    />
                    <button
                        type="submit"
                        className="h-9 rounded-[7px] px-2 text-[0.8125rem] font-semibold hover:bg-background/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Apply
                    </button>
                </form>
            ) : (
                <>
                    <FormatButton
                        label="Bold"
                        pressed={is("bold")}
                        onClick={() => chain().toggleBold().run()}
                    >
                        <Bold />
                    </FormatButton>
                    <FormatButton
                        label="Italic"
                        pressed={is("italic")}
                        onClick={() => chain().toggleItalic().run()}
                    >
                        <Italic />
                    </FormatButton>
                    <FormatButton
                        label="Link"
                        pressed={is("link")}
                        onClick={() =>
                            setLinking(
                                (editor.getAttributes("link").href as
                                    string | undefined) ?? "",
                            )
                        }
                    >
                        <Link2 />
                    </FormatButton>
                    <span
                        aria-hidden
                        className="mx-1 h-5 w-px bg-background/25"
                    />
                    <FormatButton
                        label="Heading"
                        pressed={is("heading", { level: 2 })}
                        onClick={() =>
                            chain().toggleHeading({ level: 2 }).run()
                        }
                    >
                        <Heading2 />
                    </FormatButton>
                    <FormatButton
                        label="Quote"
                        pressed={is("blockquote")}
                        onClick={() => chain().toggleBlockquote().run()}
                    >
                        <Quote />
                    </FormatButton>
                    <FormatButton
                        label="List"
                        pressed={is("bulletList")}
                        onClick={() => chain().toggleBulletList().run()}
                    >
                        <List />
                    </FormatButton>
                    <span
                        aria-hidden
                        className="mx-1 h-5 w-px bg-background/25"
                    />
                    <FormatButton
                        label="More formatting"
                        onClick={onMoreFormatting}
                    >
                        <SlidersHorizontal />
                    </FormatButton>
                </>
            )}
        </BubbleMenu>
    );
}
