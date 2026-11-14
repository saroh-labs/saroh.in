import type { ReactNode } from "react";

import { cn } from "@saroh/ui/lib/utils";

/**
 * What Ask AI wrote, drawn safely (plan 2026-11-13-001 U10, Rendering):
 * plain text in paragraphs, with bullet or numbered lists and **bold**,
 * and nothing else. No images, no raw HTML, no links: an image or a link
 * the model writes, and any URL, stays as the inert text it is (React
 * escapes it), so an answer can never load or point anywhere. The only
 * links in the panel are app routes built from ids in typed card events.
 */

type Block =
    { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function blocksOf(text: string): Block[] {
    const blocks: Block[] = [];
    for (const raw of text.split("\n")) {
        const line = raw.trimEnd();
        const last = blocks.at(-1);
        if (!line.trim()) {
            blocks.push({ kind: "p", lines: [] });
            continue;
        }
        const bullet = BULLET.exec(line);
        const numbered = bullet ? null : NUMBERED.exec(line);
        const kind = bullet ? "ul" : numbered ? "ol" : "p";
        const content = (bullet ?? numbered)?.[1] ?? line;
        if (kind === "p") {
            if (last?.kind === "p") last.lines.push(content);
            else blocks.push({ kind: "p", lines: [content] });
        } else if (last?.kind === kind) {
            last.items.push(content);
        } else {
            blocks.push({ kind, items: [content] });
        }
    }
    return blocks.filter((b) => (b.kind === "p" ? b.lines.length : true));
}

/** `**bold**` only; every other mark is text. */
function inline(text: string): ReactNode[] {
    return text
        .split(/(\*\*[^*\n]+\*\*)/g)
        .filter(Boolean)
        .map((part, i) =>
            part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
                <strong key={i} className="font-semibold">
                    {part.slice(2, -2)}
                </strong>
            ) : (
                part
            ),
        );
}

export function SafeText({
    text,
    cursor = false,
}: {
    text: string;
    /** The block cursor at the end while the answer is still arriving. */
    cursor?: boolean;
}) {
    const blocks = blocksOf(text);
    // The answer leads with its figure (board 3): a short first line, followed
    // by more, is set as the lead. shortcut: a length guess, until the API
    // marks the lead itself.
    const lead =
        blocks.length > 1 &&
        blocks[0]?.kind === "p" &&
        blocks[0].lines.join(" ").length <= 90;
    const caret = cursor ? (
        <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-2 rounded-[1px] bg-foreground align-[-3px]"
        />
    ) : null;
    return (
        <>
            {blocks.map((block, i) => {
                const end = i === blocks.length - 1 ? caret : null;
                if (block.kind === "p") {
                    return (
                        <p
                            key={i}
                            className={cn(
                                "m-0",
                                i === 0 &&
                                    lead &&
                                    "text-[17px] font-semibold leading-[1.35] tracking-[-0.01em]",
                            )}
                        >
                            {block.lines.map((line, j) => (
                                <span key={j}>
                                    {j > 0 ? <br /> : null}
                                    {inline(line)}
                                </span>
                            ))}
                            {end}
                        </p>
                    );
                }
                const List = block.kind;
                return (
                    <List
                        key={i}
                        className={cn(
                            "m-0 flex flex-col gap-1 pl-5",
                            List === "ul" ? "list-disc" : "list-decimal",
                        )}
                    >
                        {block.items.map((item, j) => (
                            <li key={j}>
                                {inline(item)}
                                {j === block.items.length - 1 ? end : null}
                            </li>
                        ))}
                    </List>
                );
            })}
            {blocks.length === 0 ? caret : null}
        </>
    );
}
