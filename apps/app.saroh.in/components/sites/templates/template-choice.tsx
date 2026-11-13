"use client";

import { Button } from "@saroh/ui/button";
import { Info } from "lucide-react";
import { useRef, useState } from "react";

import type { Template } from "@/lib/sites/service";
import type { SuggestionBasis } from "@/lib/sites/template-picker";
import { SET_TRADE_HREF, templateGroups } from "@/lib/sites/template-picker";
import { chosenLine } from "@/lib/sites/template-preview";
import { templateThumbnail } from "@/lib/sites/template-thumbnails";

import { TemplatePicker, TemplateThumbnail } from "./template-picker";
import { TemplatePreview } from "./template-preview";
import { usePreviewDetails } from "./use-preview-details";

/** Under the chosen template (board D5). */
export const CHOSEN_NOTE =
    "You can change every page later. Words and photos marked Sample are a made-up business's until you replace them. Before you publish, we list any still on your pages.";

/**
 * Choosing the template a new site starts from (DEC-216), in Turn on
 * Website and New site: the picker (board D3), each card's preview drawn
 * with the business's own details (D4), and once one is chosen from its
 * preview, the choice as one line with its picture, Preview again and
 * Change (D5). Choosing in the preview is its own press; the radio on a
 * card chooses without it.
 */
export function TemplateChoice({
    templates,
    basis,
    value,
    onChange,
    styleId,
    onStyleChange,
    canSetTrade = false,
    disabled = false,
}: {
    /** `org:update`: with no trade, the Suggested heading offers to set it. */
    canSetTrade?: boolean;
    /** Every template, in the catalogue's order. */
    templates: readonly Template[];
    /** What the suggestions are worked out from. */
    basis: SuggestionBasis;
    value: string;
    /** A template chosen, in its colourway (empty: its first). */
    onChange: (id: string, styleId: string) => void;
    /** The chosen colourway; empty for the template's first. */
    styleId: string;
    onStyleChange: (id: string) => void;
    disabled?: boolean;
}) {
    const groups = templateGroups(templates, basis);
    const details = usePreviewDetails();
    const [shown, setShown] = useState<string | null>(null);
    const [shownStyle, setShownStyle] = useState("");
    // Each opening mounts the preview afresh (its device and its draw).
    const [opened, setOpened] = useState(0);
    const [collapsed, setCollapsed] = useState(false);
    const opener = useRef<HTMLElement | null>(null);
    const chosen = templates.find((t) => t.id === value);

    function preview(id: string, from: HTMLElement) {
        opener.current = from;
        setShown(id);
        setShownStyle(id === value ? styleId : "");
        setOpened((n) => n + 1);
    }

    function choose(template: Template) {
        onChange(template.id, shownStyle);
        setShown(null);
        setCollapsed(true);
    }

    const suggestedGroup = groups[0]?.key === "suggested" ? groups[0] : null;
    const suggestedFor = (id: string) =>
        suggestedGroup?.templates.some((t) => t.id === id)
            ? suggestedGroup.title
            : null;

    const colourway =
        chosen?.colourways?.find((c) => c.id === styleId) ??
        chosen?.colourways?.[0];

    return (
        <>
            {collapsed && chosen ? (
                <div
                    className="grid min-w-0 gap-2"
                    data-template-chosen={chosen.id}
                >
                    <span className="text-sm font-medium">Template</span>
                    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border p-2">
                        <span className="w-24 shrink-0 overflow-hidden rounded-md border">
                            <TemplateThumbnail
                                name={chosen.name}
                                colourway={colourway}
                                image={templateThumbnail(chosen.id)}
                            />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                                {chosen.name}
                            </span>
                            <span
                                data-ph-mask=""
                                className="block text-xs text-muted-foreground"
                            >
                                {chosenLine(
                                    chosen,
                                    (chosen.colourways?.length ?? 0) > 1
                                        ? (colourway?.name ?? null)
                                        : null,
                                    details.status === "ready"
                                        ? details.details
                                        : null,
                                )}
                            </span>
                        </span>
                        <span className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={disabled}
                                onClick={(e) =>
                                    preview(chosen.id, e.currentTarget)
                                }
                            >
                                Preview again
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={disabled}
                                onClick={() => setCollapsed(false)}
                            >
                                Change
                            </Button>
                        </span>
                    </div>
                    <p className="flex items-start gap-1.5 text-xs leading-normal text-muted-foreground">
                        <Info
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0"
                        />
                        {CHOSEN_NOTE}
                    </p>
                </div>
            ) : (
                <TemplatePicker
                    groups={groups}
                    value={value}
                    onChange={onChange}
                    styleId={styleId}
                    onStyleChange={onStyleChange}
                    modules={basis.modules}
                    onPreview={preview}
                    setTradeHref={
                        canSetTrade && !basis.trade ? SET_TRADE_HREF : null
                    }
                    disabled={disabled}
                />
            )}
            {shown ? (
                <TemplatePreview
                    key={opened}
                    open
                    groups={groups}
                    templateId={shown}
                    onTemplate={setShown}
                    styleId={shownStyle}
                    onStyle={setShownStyle}
                    modules={basis.modules}
                    details={details}
                    suggested={suggestedFor(shown)}
                    onClose={() => setShown(null)}
                    returnFocus={() => opener.current}
                    footer={(template) => (
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                            <p className="text-xs text-muted-foreground sm:mr-auto">
                                It is made with your details already in. Nothing
                                goes live until you publish.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShown(null)}
                            >
                                Back
                            </Button>
                            <Button
                                type="button"
                                data-ph-unmask=""
                                data-template-choose={template.id}
                                onClick={() => choose(template)}
                            >
                                Choose {template.name}
                            </Button>
                        </div>
                    )}
                />
            ) : null}
        </>
    );
}
