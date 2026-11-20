"use client";

import { Button } from "@saroh/ui/button";
import { FormSheetBody } from "@saroh/ui/form-sheet";
import { IconButton } from "@saroh/ui/icon-button";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { Bold, Link2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import type { ServiceOption } from "@/components/sites/section-fields";
import { count } from "@/lib/format/plural";
import { EditorSheet } from "../editor-sheet";
import type { LinkChoice, LinkPlace } from "../link-picker";
import { LinkPicker } from "../link-picker";

/**
 * A field the text sheet is changing: the form's own textarea, or a rich
 * text editor's page (Tiptap's, which carries its `editor`).
 */
export interface TextField {
    el: HTMLTextAreaElement | HTMLElement;
    /** "Intro", from the field's label. */
    label: string;
    /** "Bridal packages", the section it is in. */
    section: string;
}

/** Where a link may go, for the link picker on rich text. */
export interface TextLinks {
    places: readonly LinkPlace[];
    services?: readonly ServiceOption[];
    businessPhone?: string | null;
}

/** The part of a Tiptap editor the sheet uses: its HTML, in and out. */
interface RichEditor {
    getHTML: () => string;
    commands: {
        setContent: (
            html: string,
            options?: { emitUpdate?: boolean },
        ) => boolean;
    };
}

/** The rich text editor behind a page Tiptap draws, if it is one. */
export function richEditorOf(el: Element | null): RichEditor | null {
    const page = el?.closest<HTMLElement & { editor?: RichEditor }>(
        ".ProseMirror",
    );
    return page?.isContentEditable && page.editor ? page.editor : null;
}

/** Words in a piece of text, for the count under it. */
export function wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Put text into a form's own field as if typed, so the form's change
 * handler (React's, which listens for `input`) sees it.
 */
export function typeInto(el: HTMLTextAreaElement, value: string) {
    // The prototype's setter: React tracks the element's own one.
    Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * A section's longer text on a phone, full screen (U49, `fix/WXNText`):
 * Cancel · the field · Save over a big box with its word count. Save puts
 * the words into the section's own field, which saves as typing there
 * would; Cancel leaves the field as it was. Rich text has Bold and Link
 * (U47d), the link through the link picker; plain text has neither, as
 * the field cannot hold them.
 */
export function TextSheet({
    field,
    container,
    links,
    onClose,
}: {
    field: TextField | null;
    /** The whole phone editor, so the sheet covers both bars. */
    container: HTMLElement | null;
    /** Where a link may go (U47d); rich text only. */
    links?: TextLinks;
    onClose: () => void;
}) {
    return (
        <EditorSheet
            open={field !== null}
            onClose={onClose}
            container={container}
            side="bottom"
            title={field?.label ?? "Text"}
            closeLabel="Cancel"
            full
            head={null}
        >
            {field ? (
                // Keyed on the field: each opening starts from its words.
                field.el instanceof HTMLTextAreaElement ? (
                    <TextBody
                        key={field.el.id || field.label}
                        field={{ ...field, el: field.el }}
                        onClose={onClose}
                    />
                ) : (
                    <RichBody
                        key={field.el.id || field.label}
                        field={field}
                        links={links}
                        onClose={onClose}
                    />
                )
            ) : null}
        </EditorSheet>
    );
}

function TextBody({
    field,
    onClose,
}: {
    field: TextField & { el: HTMLTextAreaElement };
    onClose: () => void;
}) {
    const [value, setValue] = useState(field.el.value);
    const max = field.el.maxLength > 0 ? field.el.maxLength : undefined;
    const words = wordCount(value);
    return (
        <>
            <div className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2">
                <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <h2 className="min-w-0 flex-1 truncate text-center text-base font-semibold">
                    {field.label}
                </h2>
                <Button
                    type="button"
                    className="h-11"
                    onClick={() => {
                        typeInto(field.el, value);
                        onClose();
                    }}
                >
                    Save
                </Button>
            </div>
            <FormSheetBody className="mx-0 block gap-0 px-4 pb-0 pt-4">
                <Label
                    htmlFor="phone-text-sheet"
                    className="mb-2 block text-[0.8125rem] font-medium text-muted-foreground"
                >
                    {`${field.section} · ${field.label}`}
                </Label>
                <Textarea
                    id="phone-text-sheet"
                    // The keyboard comes up on the words, not on Cancel.
                    autoFocus
                    value={value}
                    maxLength={max}
                    onChange={(e) => setValue(e.target.value)}
                    className="block min-h-44 w-full resize-none rounded-[10px] border border-foreground bg-card p-3.5 text-[1.0625rem] leading-relaxed text-foreground shadow-[0_0_0_3px_hsl(var(--info-subtle))] focus-visible:outline-none"
                    rows={7}
                />
                <p
                    aria-live="polite"
                    className="flex justify-end px-1 py-2 text-[0.8125rem] text-muted-foreground"
                >
                    {count(words, "word")}
                </p>
            </FormSheetBody>
        </>
    );
}

/** The closest element inside `root` matching `selector`, from a node. */
function closestIn(
    node: Node | null,
    selector: string,
    root: HTMLElement,
): HTMLElement | null {
    const el = node instanceof Element ? node : (node?.parentElement ?? null);
    const found = el?.closest<HTMLElement>(selector) ?? null;
    return found && root.contains(found) && found !== root ? found : null;
}

/** Take an element away and keep what was in it. */
function unwrap(el: HTMLElement) {
    el.replaceWith(...Array.from(el.childNodes));
}

/**
 * Wrap a range's words in a new element. Only inside one paragraph:
 * shortcut: a range across paragraphs is left alone, as wrapping it would
 * nest paragraphs; select within one.
 */
function wrapRange(range: Range, root: HTMLElement, el: HTMLElement): boolean {
    if (range.collapsed || range.commonAncestorContainer === root) return false;
    el.appendChild(range.extractContents());
    range.insertNode(el);
    return true;
}

/**
 * Rich text on a phone, full screen (U47d, `fix/WXNText`): the same big
 * box and word count, with Bold and Link over it. Link opens the link
 * picker for the chosen words. Save gives the HTML back to the field's
 * own editor, which reads it through its schema and saves it as typing
 * there would; the API sanitizes it again before it is stored.
 */
function RichBody({
    field,
    links,
    onClose,
}: {
    field: TextField;
    links?: TextLinks;
    onClose: () => void;
}) {
    const editor = richEditorOf(field.el);
    const box = useRef<HTMLDivElement>(null);
    const [words, setWords] = useState(0);
    // The words a link is being made for, kept while the picker has focus.
    const [linking, setLinking] = useState<{
        range: Range;
        words: string;
        current: LinkChoice | null;
    } | null>(null);

    // Seeded once, by hand: React never rewrites what is being typed in.
    useLayoutEffect(() => {
        const el = box.current;
        if (!el || !editor) return;
        el.innerHTML = editor.getHTML();
        setWords(wordCount(el.textContent));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
    }, []);

    const selection = (): Range | null => {
        const el = box.current;
        const sel = el?.ownerDocument.getSelection();
        if (!el || !sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        return el.contains(range.commonAncestorContainer) ? range : null;
    };
    const changed = () => setWords(wordCount(box.current?.textContent ?? ""));

    const bold = () => {
        const el = box.current;
        const range = selection();
        if (!el || !range) return;
        const strong = closestIn(range.commonAncestorContainer, "strong,b", el);
        if (strong) unwrap(strong);
        else wrapRange(range, el, el.ownerDocument.createElement("strong"));
        changed();
    };

    const link = () => {
        const el = box.current;
        const range = selection();
        if (!el || !range) return;
        const a = closestIn(range.commonAncestorContainer, "a", el);
        const href = a?.getAttribute("href");
        setLinking({
            range: range.cloneRange(),
            words: (a?.textContent ?? range.toString()).trim() || "these words",
            current: href
                ? { href, newTab: a?.getAttribute("target") === "_blank" }
                : null,
        });
    };

    const applyLink = (choice: LinkChoice | null) => {
        const el = box.current;
        if (!el || !linking) return;
        const { range } = linking;
        let a = closestIn(range.commonAncestorContainer, "a", el);
        if (choice === null) {
            if (a) unwrap(a);
        } else {
            if (!a) {
                a = el.ownerDocument.createElement("a");
                if (!wrapRange(range, el, a)) a = null;
            }
            if (a) {
                a.setAttribute("href", choice.href);
                if (choice.newTab) {
                    a.setAttribute("target", "_blank");
                    a.setAttribute("rel", "noopener noreferrer");
                } else {
                    a.removeAttribute("target");
                    a.removeAttribute("rel");
                }
            }
        }
        setLinking(null);
        changed();
    };

    return (
        <>
            <div className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2">
                <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <h2 className="min-w-0 flex-1 truncate text-center text-base font-semibold">
                    {field.label}
                </h2>
                <Button
                    type="button"
                    className="h-11"
                    disabled={!editor}
                    onClick={() => {
                        if (editor && box.current) {
                            editor.commands.setContent(box.current.innerHTML, {
                                emitUpdate: true,
                            });
                        }
                        onClose();
                    }}
                >
                    Save
                </Button>
            </div>
            <FormSheetBody className="mx-0 block gap-0 px-4 pb-0 pt-4">
                <p
                    id="phone-text-sheet-label"
                    className="mb-2 block text-[0.8125rem] font-medium text-muted-foreground"
                >
                    {`${field.section} · ${field.label}`}
                </p>
                <div
                    role="toolbar"
                    aria-label="Formatting"
                    className="mb-2 flex gap-1"
                    // Pressing a tool keeps the words chosen.
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <IconButton
                        label="Bold"
                        icon={<Bold className="size-4" />}
                        onClick={bold}
                    />
                    <IconButton
                        label="Link"
                        icon={<Link2 className="size-4" />}
                        onClick={link}
                    />
                </div>
                <div
                    ref={box}
                    id="phone-text-sheet"
                    role="textbox"
                    aria-multiline
                    aria-labelledby="phone-text-sheet-label"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={changed}
                    // Pasted words arrive as words: no one else's markup.
                    onPaste={(e) => {
                        e.preventDefault();
                        const range = selection();
                        if (!range) return;
                        range.deleteContents();
                        range.insertNode(
                            document.createTextNode(
                                e.clipboardData.getData("text/plain"),
                            ),
                        );
                        range.collapse(false);
                        changed();
                    }}
                    className="block min-h-44 w-full overflow-y-auto rounded-[10px] border border-foreground bg-card p-3.5 text-[1.0625rem] leading-relaxed text-foreground shadow-[0_0_0_3px_hsl(var(--info-subtle))] focus-visible:outline-none [&_a]:underline [&_p+p]:mt-3"
                />
                <p
                    aria-live="polite"
                    className="flex justify-end px-1 py-2 text-[0.8125rem] text-muted-foreground"
                >
                    {count(words, "word")}
                </p>
                {linking ? (
                    <div className="border-t pb-4 pt-3">
                        <LinkPicker
                            words={linking.words}
                            places={links?.places ?? []}
                            services={links?.services}
                            businessPhone={links?.businessPhone}
                            current={linking.current}
                            onApply={applyLink}
                            onRemove={() => applyLink(null)}
                        />
                    </div>
                ) : null}
            </FormSheetBody>
        </>
    );
}
