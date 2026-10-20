"use client";

import type { Catalog, FreeStyleKind } from "@saroh/pricing-catalog";
import { freeStylesOf } from "@saroh/pricing-catalog";
import { Checkbox } from "@saroh/ui/checkbox";
import { useId } from "react";

import type { FreeStyleChoices } from "@/lib/pricing-types";

import { useDraft } from "../draft-store";
import { CHECKBOX_SAFFRON, ChangedDot } from "../offers/parts";
import { usePlans } from "../plans-context";

/**
 * Which looks, typefaces and colourways every business may choose
 * (DEC-177): a tick each, in the shared draft (`freeStyles`), so it goes
 * live with the next published version like any other change. The rest
 * need "Themes, fonts and templates" on the business's plan. What can be
 * ticked is the API's (`GET /admin/pricing` → `styles`); an id the draft
 * names that Saroh no longer has is listed so it can be unticked.
 *
 * Always free, whatever is ticked, and drawn ticked and fixed: Classic,
 * the visitor's system font, and each site's own template typefaces and
 * the colourway it was made in.
 */

interface Option {
    id: string;
    name: string;
    fixed?: boolean;
    gone?: boolean;
}

/** One kind's options, with what the draft names but Saroh doesn't have. */
function optionsOf(
    known: { id: string; name: string }[],
    named: string[],
): Option[] {
    const ids = new Set(known.map((o) => o.id));
    return [
        ...known,
        ...named
            .filter((id) => !ids.has(id))
            .map((id) => ({ id, name: id, gone: true })),
    ];
}

/** Ticked or not, keeping the order Saroh lists them in. */
export function toggleFree(
    catalog: Catalog,
    kind: FreeStyleKind,
    id: string,
    on: boolean,
    order: string[],
): void {
    const free = freeStylesOf(catalog);
    const now = new Set(free[kind]);
    if (on) now.add(id);
    else now.delete(id);
    const rank = (x: string) => {
        const i = order.indexOf(x);
        return i < 0 ? order.length : i;
    };
    free[kind] = [...now].sort((a, b) => rank(a) - rank(b));
    catalog.freeStyles = free;
}

export function FreeStyles() {
    const { catalog, live, edit, canEdit } = useDraft();
    const { pricing } = usePlans();
    const choices: FreeStyleChoices | undefined = pricing.styles;
    if (!catalog) return null;
    const free = freeStylesOf(catalog);
    const was = freeStylesOf(live?.catalog);
    const changed = (kind: FreeStyleKind) =>
        live !== null &&
        [...free[kind]].sort().join() !== [...was[kind]].sort().join();

    if (!choices) {
        return (
            <section
                aria-label="Free looks, typefaces and colourways"
                className="rounded-[12px] border border-border bg-card p-4 text-[12.5px] text-muted-foreground"
            >
                This API doesn&apos;t list its looks yet, so which are free
                can&apos;t be changed here.
            </section>
        );
    }

    const templateOf = new Map(
        choices.colourways.map((c) => [c.id, c.template]),
    );
    const byTemplate = new Map<string, Option[]>();
    for (const c of optionsOf(choices.colourways, free.colourways)) {
        const template = templateOf.get(c.id) ?? "No longer offered";
        byTemplate.set(template, [...(byTemplate.get(template) ?? []), c]);
    }
    const order = (kind: FreeStyleKind) =>
        (kind === "looks"
            ? choices.looks
            : kind === "fontPairs"
              ? choices.fontPairs
              : choices.colourways
        ).map((o) => o.id);

    const group = (kind: FreeStyleKind, label: string, rows: Option[]) => (
        <StyleGroup
            key={kind}
            label={label}
            changed={changed(kind)}
            rows={rows}
            isOn={(id) => free[kind].includes(id)}
            disabled={!canEdit}
            onToggle={(id, on) =>
                edit((c) => toggleFree(c, kind, id, on, order(kind)))
            }
        />
    );

    return (
        <section
            aria-label="Free looks, typefaces and colourways"
            className="grid gap-3 rounded-[12px] border border-border bg-card p-4"
        >
            <div className="grid gap-1">
                <h2 className="font-display text-[16px] font-semibold">
                    Free looks, typefaces and colourways
                </h2>
                <p className="text-[12.5px] text-muted-foreground">
                    Ticked ones work on every plan. The rest need Themes, fonts
                    and templates on the business&apos;s plan, and show
                    &ldquo;Paid plans&rdquo; in Website › Style. A change goes
                    live with the next published version.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group("looks", "Looks", [
                    { id: "classic", name: "Classic", fixed: true },
                    ...optionsOf(choices.looks, free.looks),
                ])}
                {group("fontPairs", "Typefaces", [
                    {
                        id: "system",
                        name: "Your visitor's system font",
                        fixed: true,
                    },
                    ...optionsOf(choices.fontPairs, free.fontPairs),
                ])}
                <div className="grid content-start gap-3">
                    {[...byTemplate.entries()].map(([template, rows], i) => (
                        <StyleGroup
                            key={template}
                            label={
                                i === 0 ? `Colourways · ${template}` : template
                            }
                            changed={i === 0 && changed("colourways")}
                            rows={rows}
                            isOn={(id) => free.colourways.includes(id)}
                            disabled={!canEdit}
                            onToggle={(id, on) =>
                                edit((c) =>
                                    toggleFree(
                                        c,
                                        "colourways",
                                        id,
                                        on,
                                        order("colourways"),
                                    ),
                                )
                            }
                        />
                    ))}
                </div>
            </div>
            <p className="text-[12px] text-muted-foreground">
                Always free, whatever is ticked: Classic, the visitor&apos;s
                system font, and each site&apos;s own template typefaces and the
                colourway it was made in.
            </p>
        </section>
    );
}

function StyleGroup({
    label,
    changed,
    rows,
    isOn,
    disabled,
    onToggle,
}: {
    label: string;
    changed: boolean;
    rows: Option[];
    isOn: (id: string) => boolean;
    disabled: boolean;
    onToggle: (id: string, on: boolean) => void;
}) {
    const base = useId();
    return (
        <fieldset className="grid content-start gap-1.5 text-[13.5px]">
            <legend className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
                {label}
                <ChangedDot on={changed} />
            </legend>
            {rows.map((row, i) => {
                const box = `${base}-${i}`;
                return (
                    <div key={row.id} className="flex items-center gap-[9px]">
                        <Checkbox
                            id={box}
                            checked={row.fixed ? true : isOn(row.id)}
                            disabled={disabled || row.fixed}
                            className={CHECKBOX_SAFFRON}
                            onCheckedChange={(v) =>
                                onToggle(row.id, v === true)
                            }
                        />
                        <label
                            htmlFor={box}
                            className={row.fixed ? undefined : "cursor-pointer"}
                        >
                            {row.name}
                            {row.fixed ? (
                                <span className="text-muted-foreground">
                                    {" "}
                                    · always free
                                </span>
                            ) : null}
                            {row.gone ? (
                                <span className="text-muted-foreground">
                                    {" "}
                                    · no longer in Saroh, untick it to publish
                                </span>
                            ) : null}
                        </label>
                    </div>
                );
            })}
        </fieldset>
    );
}
