"use client";

import type { KeyboardEvent, ReactNode } from "react";
import {
    createContext,
    useContext,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

/**
 * Typing on the page in the editor (U47d, `fix/WXKText`): what the editor
 * hands the section it lets the owner type into. `onText` writes the
 * words to the same draft field the inspector's input writes to.
 */
export interface EditableTextHost {
    onText: (field: string, text: string) => void;
    /**
     * The editor's floating bar over the words being typed in
     * (`fix/WXKText`: "Paragraph · Done", the length). Drawn only while
     * the words have the caret; `done` ends the typing.
     */
    bar?: (state: {
        field: string;
        text: string;
        done: () => void;
    }) => ReactNode;
}

/**
 * Only the editor's canvas provides it, around the one selected section.
 * The live site never does, so a marker there draws its words and nothing
 * else: the published HTML is what it was before the markers.
 */
export const EditableTextContext = createContext<EditableTextHost | null>(null);

/**
 * A block's own words, marked with the contract field they come from
 * ("heading", "intro"). Used only where the words drawn ARE the field, as
 * written, so what is typed maps back without guessing.
 */
export function EditableText({
    field,
    children,
}: {
    field: string;
    children: string;
}) {
    const host = useContext(EditableTextContext);
    if (!host) return children;
    return <EditableSpan field={field} text={children} host={host} />;
}

function EditableSpan({
    field,
    text,
    host,
}: {
    field: string;
    text: string;
    host: EditableTextHost;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    // The words as they were when typing started, for Esc.
    const before = useRef<string | null>(null);
    // The words while they have the caret, for the editor's bar; else null.
    const [typing, setTyping] = useState<string | null>(null);
    /*
     * The words are set by hand, never as React children: React rewriting
     * a text node the owner is typing in would move the caret. Only while
     * it is not being typed in, so the inspector's input shows here too.
     */
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || el.ownerDocument.activeElement === el) return;
        if (el.textContent !== text) el.textContent = text;
    }, [text]);

    const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
        const el = e.currentTarget;
        if (e.key === "Enter") {
            e.preventDefault();
            el.blur();
        } else if (e.key === "Escape") {
            // Esc puts the words back, and is the field's, not the editor's.
            e.preventDefault();
            e.stopPropagation();
            if (before.current !== null) {
                el.textContent = before.current;
                host.onText(field, before.current);
            }
            el.blur();
        }
    };

    const span = (
        <span
            ref={ref}
            data-edit-field={field}
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            role="textbox"
            aria-label={`${FIELD_NAMES[field] ?? "Heading"}, type to change it`}
            spellCheck
            onFocus={(e) => {
                before.current = e.currentTarget.textContent;
                setTyping(e.currentTarget.textContent);
            }}
            onBlur={(e) => {
                // Emptied here, the words come back: a block draws no
                // empty heading, so there would be nothing left to type in.
                // Clearing a field is the inspector's.
                const el = e.currentTarget;
                if (!el.textContent.trim() && before.current !== null) {
                    el.textContent = before.current;
                    host.onText(field, before.current);
                }
                before.current = null;
                setTyping(null);
            }}
            onInput={(e) => {
                const words = e.currentTarget.textContent;
                setTyping(words);
                if (words.trim()) host.onText(field, words);
            }}
            onKeyDown={onKeyDown}
            // Pasted words arrive as words: no markup reaches the field.
            onPaste={(e) => {
                e.preventDefault();
                const words = e.clipboardData.getData("text/plain");
                const doc = e.currentTarget.ownerDocument;
                const range = doc.getSelection()?.getRangeAt(0);
                if (!range) return;
                range.deleteContents();
                range.insertNode(doc.createTextNode(words));
                range.collapse(false);
                const now = e.currentTarget.textContent;
                setTyping(now);
                if (now.trim()) host.onText(field, now);
            }}
            // With the editor's bar the wrapper draws the outline below.
            className={
                host.bar
                    ? "cursor-text outline-none"
                    : "cursor-text rounded-[2px] outline-none focus:bg-[hsl(var(--site-fg)/0.06)] focus:shadow-[0_0_0_2px_hsl(var(--site-fg)/0.35)]"
            }
        />
    );
    if (!host.bar) return span;
    // Done in the editor's bar: the typing ends as Enter ends it.
    function finish() {
        ref.current?.blur();
    }
    return (
        <span
            // While typing, one 1.5px outline round the whole field, not a
            // box per line (D1, `fix/WXKText`).
            className={
                typing !== null
                    ? "relative inline-block rounded-[6px] outline outline-[1.5px] outline-offset-4 outline-[hsl(var(--site-fg))]"
                    : "relative"
            }
        >
            {span}
            {typing !== null ? (
                <span
                    contentEditable={false}
                    // A press on the bar keeps the caret in the words.
                    onMouseDown={(e) => e.preventDefault()}
                    // Under the words' last line, never over the heading
                    // above them (D1, `fix/WXKText`).
                    className="absolute left-0 top-full z-30 mt-2 block whitespace-nowrap text-left"
                >
                    <BarSlot
                        bar={host.bar}
                        field={field}
                        text={typing}
                        done={finish}
                    />
                </span>
            ) : null}
        </span>
    );
}

/** The editor's bar, drawn as a component so `done` is a handler. */
function BarSlot({
    bar,
    ...state
}: {
    bar: NonNullable<EditableTextHost["bar"]>;
    field: string;
    text: string;
    done: () => void;
}) {
    return bar(state);
}

/** What each marked field is called, for its typing box's name. */
const FIELD_NAMES: Record<string, string> = {
    heading: "Heading",
    intro: "Intro",
    subheading: "Line under the heading",
};
