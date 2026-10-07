"use client";

import {
    anchorFromLabel,
    anchorProblem,
    NAV_LABEL_MAX,
} from "@saroh/block-contract";
import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

import type { Section } from "@/lib/sites/service";

import { Field } from "./field";

/** The bands a block can sit on, in the words the inspector uses. */
const BANDS = [
    { id: "none", label: "Page", note: "The page's own colour." },
    {
        id: "surface",
        label: "Card colour",
        note: "The colour your cards sit on, behind the whole block.",
    },
    {
        id: "inverse",
        label: "Reversed",
        note: "Text and background swapped, for a block that should stand apart.",
    },
    {
        id: "accent",
        label: "Accent",
        note: "Your accent colour, with its own text colour.",
    },
] as const;

/**
 * Where a block sits on its page, beside what it says (industry templates,
 * polish pass): a menu label that lists it in the site's header, the link
 * name a menu entry or a button jumps to, and the band behind it. Every
 * block has these (`section-frame.ts` in the contract), so they sit under
 * each block's own fields, above its padding.
 *
 * Typing a menu label first suggests a link name from it; the link name is
 * the merchant's to change. The contract says what is wrong with one as
 * they type; the API refuses a page that uses one twice.
 */
export function SectionFrameFields({
    section,
    onChange,
}: {
    section: Section;
    onChange: (next: Section) => void;
}) {
    const content = section.content as Record<string, unknown>;
    const anchor = section.content.anchor ?? "";
    const navLabel = section.content.navLabel ?? "";
    const band = BANDS.find((b) => b.id === section.content.band)?.id ?? "none";

    function set(patch: Record<string, string | undefined>) {
        // Absent, never empty or "none": the contract reads absent as the
        // page as it was, and stores it that way.
        const next = { ...content };
        for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === "" || value === "none") {
                delete next[key];
            } else {
                next[key] = value;
            }
        }
        onChange({ ...section, content: next } as Section);
    }

    const problem = anchor ? anchorProblem(anchor) : null;
    const chosen = BANDS.find((b) => b.id === band);

    return (
        <div className="grid gap-3 border-t pt-4">
            <Field label="Menu label">
                <Input
                    value={navLabel}
                    maxLength={NAV_LABEL_MAX}
                    placeholder="Not in the menu"
                    onChange={(e) => {
                        const label = e.target.value;
                        // Suggest a link name while there is none.
                        set(
                            anchor === "" && label.trim() !== ""
                                ? {
                                      navLabel: label,
                                      anchor: anchorFromLabel(label),
                                  }
                                : { navLabel: label },
                        );
                    }}
                />
            </Field>
            <p className="-mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                On the home page, a block with a menu label is listed in your
                site's menu, and the entry jumps to it.
            </p>
            <Field label="Link name">
                <Input
                    value={anchor}
                    placeholder="visit-us"
                    aria-invalid={problem !== null}
                    onChange={(e) =>
                        set({ anchor: e.target.value.toLowerCase() })
                    }
                />
            </Field>
            <p
                className={`-mt-1.5 text-[12px] leading-relaxed ${problem ? "text-destructive" : "text-muted-foreground"}`}
            >
                {problem ??
                    (anchor
                        ? `A button can link here with #${anchor}.`
                        : "Give the block a link name to jump to it from a button or the menu.")}
            </p>
            <Field label="Background">
                <Select value={band} onValueChange={(id) => set({ band: id })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {BANDS.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                                {b.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {chosen ? (
                <p className="-mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    {chosen.note}
                </p>
            ) : null}
        </div>
    );
}
