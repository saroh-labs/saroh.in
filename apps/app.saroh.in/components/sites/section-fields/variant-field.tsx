"use client";

import {
    BLOCK_META,
    latestContractVersion,
    resolveVariant,
} from "@saroh/block-contract";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

import type { Section } from "@/lib/sites/service";

import { Field } from "./field";

/**
 * Which look this block wears (#254).
 *
 * Rendered by the dispatcher above every block's own fields, so a block author
 * adds a look by declaring it in `BLOCK_META` and never by editing an editor
 * component. It is the same list the catalog browses, which is the point — a
 * second list of looks is a second thing to disagree.
 *
 * RENDERS NOTHING FOR A BLOCK WITH ONE LOOK. Every block declares at least one
 * so the data stays uniform and "the first declared" always exists, but showing
 * a merchant a picker with a single option is asking a question with no answer.
 * Uniform data, adaptive UI.
 */
/**
 * The same section, wearing a different look.
 *
 * The cast is doing one job TypeScript cannot. `Section` is a union correlating
 * `type` with `content`, and spreading a value of that union widens `content`
 * to the union of ALL six content shapes — so the compiler can no longer see
 * that this is still a hero with hero content. Nothing about the value changes:
 * the `type` is untouched, and `variant` is declared on `SectionLayout`, which
 * every content type already intersects.
 *
 * Kept in one place so the cast is explained once rather than repeated wherever
 * a look is set.
 *
 * Touching a section also moves it to the newest contract, the way writing a
 * button lifts a hero to v2 (#207) — that is what turns a `gallery@1` carrying
 * `layout` into a `gallery@2` carrying `variant`.
 */
function withVariant(section: Section, id: string): Section {
    return {
        ...section,
        contractVersion: latestContractVersion(section.type),
        content: { ...section.content, variant: id },
    } as Section;
}

export function VariantField({
    section,
    onChange,
}: {
    section: Section;
    onChange: (next: Section) => void;
}) {
    const meta = BLOCK_META[section.type];
    if (meta.variants.length < 2) return null;

    /*
     * The CURRENT look, not the stored field. A section written before #254
     * stores nothing, and showing the picker empty would invite a merchant to
     * "fix" it — silently restyling a page that was already correct.
     */
    const current = resolveVariant(section.type, section.content);
    const chosen = meta.variants.find((v) => v.id === current);

    return (
        <Field label="Look">
            <Select
                value={current}
                onValueChange={(id) => onChange(withVariant(section, id))}
            >
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {meta.variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                            {v.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {chosen ? (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {chosen.description}
                </p>
            ) : null}
        </Field>
    );
}
