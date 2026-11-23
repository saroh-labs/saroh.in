"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { IconButton } from "@saroh/ui/icon-button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import type { NodeViewProps } from "@tiptap/react";
import {
    NodeViewContent,
    NodeViewWrapper,
    useEditorState,
} from "@tiptap/react";
import { ImagePlus, X } from "lucide-react";
import { useState } from "react";

import { MediaPicker } from "@/components/shared/fields/media-picker";

/** The headings the contents block lists: each `##` heading's words. */
export function headingsOf(doc: NodeViewProps["editor"]["state"]["doc"]) {
    const out: string[] = [];
    doc.descendants((node) => {
        if (node.type.name === "heading" && node.attrs.level === 2) {
            const text = node.textContent.trim();
            if (text) out.push(text);
        }
        return node.isBlock;
    });
    return out;
}

/** The contents block as the writer sees it: today's headings, in order. */
export function ContentsView({ editor, selected, deleteNode }: NodeViewProps) {
    const headings = useEditorState({
        editor,
        selector: ({ editor: e }) => headingsOf(e.state.doc).join("\n"),
    })
        .split("\n")
        .filter(Boolean);
    return (
        <NodeViewWrapper
            data-post-block="contents"
            className={cn(
                "not-prose my-6 flex items-start gap-3 rounded-[calc(var(--site-radius)*1.4)] border border-site-border p-4 font-site-body text-site-fg",
                selected && "ring-2 ring-ring ring-offset-2",
            )}
        >
            <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold">In this post</p>
                {headings.length > 0 ? (
                    <ol className="m-0 mt-2 grid list-decimal gap-1 pl-5 text-sm">
                        {headings.map((h, i) => (
                            <li key={i}>{h}</li>
                        ))}
                    </ol>
                ) : (
                    <p className="m-0 mt-1 text-sm text-site-muted">
                        Add a heading and it is listed here.
                    </p>
                )}
            </div>
            {editor.isEditable ? (
                <IconButton
                    label="Take the contents out"
                    icon={<X />}
                    onClick={deleteNode}
                    className="shrink-0 font-sans"
                />
            ) : null}
        </NodeViewWrapper>
    );
}

/** The button as it shows on the page, and its words and link to change. */
export function PostButtonView({
    node,
    editor,
    selected,
    updateAttributes,
    deleteNode,
}: NodeViewProps) {
    const href = node.attrs.href as string;
    const label = node.attrs.label as string;
    const [editing, setEditing] = useState(!href);
    const [words, setWords] = useState(label);
    const [link, setLink] = useState(href);
    const writes = editor.isEditable;
    return (
        <NodeViewWrapper
            data-post-block="button"
            className={cn(
                "not-prose my-6 grid gap-2 font-sans",
                selected && "rounded-md ring-2 ring-ring ring-offset-2",
            )}
        >
            <div className="flex items-center gap-2">
                <span className="inline-flex min-h-11 items-center rounded-[var(--site-radius)] bg-site-accent px-5 font-site-body font-bold text-site-accent-fg">
                    {label || "Find out more"}
                </span>
                {writes && !editing ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(true)}
                    >
                        Change
                    </Button>
                ) : null}
                {writes ? (
                    <IconButton
                        label="Take this button out"
                        icon={<X />}
                        onClick={deleteNode}
                        className="ml-auto shrink-0"
                    />
                ) : null}
            </div>
            {writes && editing ? (
                <form
                    className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!link.trim()) return;
                        updateAttributes({
                            href: link.trim(),
                            label: words.trim(),
                        });
                        setEditing(false);
                    }}
                >
                    <Field label="Button words" holdsData={false}>
                        <Input
                            dense
                            value={words}
                            maxLength={60}
                            placeholder="Find out more"
                            onChange={(e) => setWords(e.target.value)}
                            className="w-44"
                        />
                    </Field>
                    <Field label="Opens" holdsData={false}>
                        <Input
                            dense
                            value={link}
                            placeholder="https://… or /about"
                            onChange={(e) => setLink(e.target.value)}
                            className="w-56"
                        />
                    </Field>
                    <Button type="submit" size="sm" disabled={!link.trim()}>
                        Apply
                    </Button>
                </form>
            ) : null}
        </NodeViewWrapper>
    );
}

/** The gallery: its photos, and one more from Photos and files. */
export function GalleryView({ node, editor, getPos, selected }: NodeViewProps) {
    const [adding, setAdding] = useState(false);
    return (
        <NodeViewWrapper
            data-post-block="gallery"
            className={cn(selected && "rounded-md ring-2 ring-ring")}
        >
            <NodeViewContent data-gallery="photos" />
            {editor.isEditable ? (
                <div contentEditable={false} className="grid gap-2 font-sans">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        onClick={() => setAdding((v) => !v)}
                    >
                        <ImagePlus aria-hidden className="size-4" />
                        {adding ? "Close" : "Add a photo to the gallery"}
                    </Button>
                    {adding ? (
                        <MediaPicker
                            label="Choose a photo"
                            onPick={(img) => {
                                const at = getPos();
                                if (typeof at !== "number") return;
                                editor
                                    .chain()
                                    .insertContentAt(at + node.nodeSize - 1, {
                                        type: "image",
                                        attrs: {
                                            src: img.src,
                                            alt: "",
                                            ...(img.width && img.height
                                                ? {
                                                      width: img.width,
                                                      height: img.height,
                                                  }
                                                : {}),
                                        },
                                    })
                                    .run();
                                setAdding(false);
                            }}
                        />
                    ) : null}
                </div>
            ) : null}
        </NodeViewWrapper>
    );
}
