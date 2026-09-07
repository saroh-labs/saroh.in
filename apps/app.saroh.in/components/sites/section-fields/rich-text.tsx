"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Textarea } from "@saroh/ui/textarea";
import dynamic from "next/dynamic";

/*
 * Loaded on demand. Tiptap is the largest dependency this app takes on, and
 * only the section editor needs it — the sites list and settings must not pay
 * for it. `ssr: false` because the editor exists only in the browser.
 *
 * The wrapper moved here with the fields it serves (#260). It has to move
 * rather than be imported: a plain `import { RichTextEditor }` in this file
 * would pull Tiptap back into the bundle and quietly undo the split, with
 * nothing failing to say so.
 */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-40 animate-pulse rounded-md border bg-muted" />
        ),
    },
);

import type { RichTextContent } from "@/lib/sites/service";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `richText` section's editor fields.
 *
 * Split out of `site-editor.tsx` (#260), which had grown to 2759 lines against
 * a repo standard of 400 — and which every new block type had to edit. Adding a
 * block is now adding a file.
 *
 * Moved verbatim: this is the same markup, in the same order, with the same
 * handlers. The refactor changes where the code lives and nothing about what it
 * does.
 */
export function RichTextFields({
    section,
    onChange,
}: SectionFieldsProps<"richText">) {
    const c = section.content;
    const patch = (next: Partial<RichTextContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    return (
        <div className="grid gap-3">
            <Field label="Format">
                <Select
                    value={c.format}
                    onValueChange={(v) =>
                        patch({
                            format: v as RichTextContent["format"],
                        })
                    }
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="markdown">Markdown</SelectItem>
                    </SelectContent>
                </Select>
            </Field>
            <Field label="Content">
                {c.format === "html" ? (
                    <RichTextEditor
                        value={c.value}
                        onChange={(value) => patch({ value })}
                        placeholder="Write about your business…"
                    />
                ) : (
                    <Textarea
                        value={c.value}
                        onChange={(e) => patch({ value: e.target.value })}
                        rows={6}
                        placeholder="# Hello world"
                    />
                )}
            </Field>
        </div>
    );
}
