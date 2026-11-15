"use client";

import type { LookId } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { PartialRead } from "@saroh/ui/failed-read";
import { Label } from "@saroh/ui/label";
import { Eye, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { lookName } from "@/components/sites/looks/look-picker";
import { PaidRefusal } from "@/components/sites/looks/paid-refusal";
import type { StarterContentActions } from "@/components/sites/looks/starter-content-actions";
import type { SitePage, Template } from "@/lib/sites/service";
import {
    STARTER_FILL_HINT,
    STARTER_FILL_LABEL,
    templateConfirmText,
    templatePlanFor,
} from "@/lib/sites/starter-content";
import type {
    SuggestionBasis,
    TemplateGroup,
} from "@/lib/sites/template-picker";
import { templateGroups } from "@/lib/sites/template-picker";
import { templateThumbnail } from "@/lib/sites/template-thumbnails";

import { TemplateThumbnail } from "./template-picker";
import { TemplatePreview } from "./template-preview";
import { usePreviewDetails } from "./use-preview-details";

/** What the editor's Template row reads (`app/(editor)/sites/[siteId]`). */
export interface TemplateRowSource {
    /** The catalogue; null when it couldn't be read. */
    templates: Template[] | null;
    /** The template the site was made from; null when not recorded. */
    current: string | null;
    basis: SuggestionBasis;
}

/** Said while the editor has changes not saved yet (board D7). */
export const waitsForSaveWords = (name: string) =>
    `Your last changes aren't saved yet. Once they are, you can use ${name}'s pages.`;

/**
 * The Brand tab's Template row (DEC-216, board D6): the template the site
 * started from, its Preview, and See templates, which opens the same
 * preview as Turn on Website with every template in its list. Choosing
 * another asks first, naming the pages it replaces, with "Fill in my
 * details" and its colours as choices, then copies its pages into the
 * draft (the starter content's write, DEC-182) with Undo and Previous
 * versions as the way back. Nothing goes live until Publish.
 *
 * Without `starter` (no `site:update`, or a Reviewer) it is a line to read.
 */
export function TemplateRow({
    source,
    pages,
    starter,
    look,
}: {
    source: TemplateRowSource;
    pages: SitePage[];
    /** The draft's actions; null reads only. */
    starter: StarterContentActions | null;
    /** The draft's look, kept by a template's pages. */
    look: LookId | null;
}) {
    const router = useRouter();
    const templates = source.templates ?? [];
    const current = templates.find((t) => t.id === source.current) ?? null;
    const others = templateGroups(
        templates.filter((t) => t.id !== current?.id),
        source.basis,
    );
    const groups: TemplateGroup<Template>[] = current
        ? [
              { key: "yours", title: "Your site", templates: [current] },
              ...others,
          ]
        : others;
    const suggested = others[0]?.key === "suggested" ? others[0] : null;
    const hint = suggested?.templates.find((t) => t.id !== current?.id);
    const details = usePreviewDetails(source.templates !== null);
    const [shown, setShown] = useState<string | null>(null);
    const [shownStyle, setShownStyle] = useState("");
    const [opened, setOpened] = useState(0);
    const opener = useRef<HTMLElement | null>(null);

    function open(id: string, from: HTMLElement) {
        opener.current = from;
        setShown(id);
        setShownStyle("");
        setOpened((n) => n + 1);
    }

    if (source.templates === null) {
        return (
            <section className="space-y-2" data-template-row="">
                <h3 className="label pb-1">Template</h3>
                <PartialRead
                    things="the templates"
                    so="Your site and its pages are as they were."
                    onRetry={() => router.refresh()}
                />
            </section>
        );
    }

    return (
        <section className="space-y-2" data-template-row="">
            <h3 className="label pb-1">Template</h3>
            <div className="flex min-w-0 items-center gap-3">
                {current ? (
                    <span className="w-16 shrink-0 overflow-hidden rounded-md border">
                        <TemplateThumbnail
                            name={current.name}
                            colourway={current.colourways?.[0]}
                            image={templateThumbnail(current.id)}
                        />
                    </span>
                ) : null}
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                        {current?.name ?? "Your own pages"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                        {current
                            ? "Your site started from it"
                            : "Not made from a template we can show"}
                    </span>
                </span>
            </div>
            <div className="flex flex-wrap gap-2">
                {current ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-template-row-preview=""
                        onClick={(e) => open(current.id, e.currentTarget)}
                    >
                        <Eye aria-hidden />
                        Preview
                    </Button>
                ) : null}
                {starter && templates.length > (current ? 1 : 0) ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-template-row-see=""
                        className="flex-1"
                        onClick={(e) =>
                            open(
                                hint?.id ?? groups[0].templates[0].id,
                                e.currentTarget,
                            )
                        }
                    >
                        See templates
                    </Button>
                ) : null}
            </div>
            {starter && hint ? (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {hint.name} is {suggested?.title.toLowerCase()}.
                </p>
            ) : null}
            {shown ? (
                <TemplatePreview
                    key={opened}
                    open
                    groups={starter ? groups : groups.slice(0, 1)}
                    templateId={shown}
                    onTemplate={setShown}
                    styleId={shownStyle}
                    onStyle={setShownStyle}
                    modules={source.basis.modules}
                    details={details}
                    look={look ?? undefined}
                    suggested={
                        suggested?.templates.some((t) => t.id === shown)
                            ? suggested.title
                            : null
                    }
                    onClose={() => setShown(null)}
                    returnFocus={() => opener.current}
                    footer={(template) =>
                        template.id === current?.id || !starter ? (
                            <div className="flex items-center justify-end gap-2">
                                <p className="mr-auto text-xs text-muted-foreground">
                                    {template.id === current?.id
                                        ? "Your site's template."
                                        : "Owners and admins change the template."}
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShown(null)}
                                >
                                    Close
                                </Button>
                            </div>
                        ) : (
                            <TemplateConfirm
                                key={`${template.id}:${shownStyle}`}
                                template={template}
                                styleId={shownStyle}
                                pages={pages}
                                starter={starter}
                                look={look}
                                onBack={() => setShown(null)}
                                onDone={() => setShown(null)}
                            />
                        )
                    }
                />
            ) : null}
        </section>
    );
}

/**
 * Before another template's pages go in (board D6): which pages are
 * replaced and which stay, that Previous versions is the way back, "Fill
 * in my details" (on) and its colours (off). Waits while the editor has
 * unsaved changes; a refusal is said here and the preview stays.
 */
function TemplateConfirm({
    template,
    styleId,
    pages,
    starter,
    look,
    onBack,
    onDone,
}: {
    template: Template;
    styleId: string;
    pages: SitePage[];
    starter: StarterContentActions;
    look: LookId | null;
    onBack: () => void;
    onDone: () => void;
}) {
    const id = useId();
    const [busy, setBusy] = useState(false);
    const [fill, setFill] = useState(true);
    const [colours, setColours] = useState(false);
    const [failure, setFailure] = useState<
        { paid: true } | { paid: false; error: string } | null
    >(null);
    const plan = templatePlanFor(template.id, pages);
    const colourway =
        template.colourways?.find((c) => c.id === styleId) ??
        template.colourways?.[0];

    async function confirm() {
        setBusy(true);
        setFailure(null);
        let outcome: Awaited<ReturnType<typeof starter.copyTemplate>>;
        try {
            outcome = await starter.copyTemplate(
                template.id,
                colours ? (colourway?.id ?? null) : null,
                look,
                fill,
            );
        } finally {
            setBusy(false);
        }
        if (outcome.ok) {
            onDone();
            return;
        }
        setFailure(
            outcome.paid
                ? { paid: true }
                : { paid: false, error: outcome.error },
        );
    }

    return (
        <div className="space-y-2" data-template-confirm={template.id}>
            {plan ? (
                <p className="text-sm">{templateConfirmText(plan, pages)}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
                Your current pages stay in Previous versions, to go back to.
                Nothing goes live until you publish.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
                <Choice
                    id={`${id}-fill`}
                    checked={fill}
                    onChange={setFill}
                    disabled={busy}
                    label={STARTER_FILL_LABEL}
                    hint={STARTER_FILL_HINT}
                />
                {colourway ? (
                    <Choice
                        id={`${id}-colours`}
                        checked={colours}
                        onChange={setColours}
                        disabled={busy}
                        label={`Use ${template.name}'s colours too (${colourway.name})`}
                        hint="Off: your colours stay as they are."
                    />
                ) : null}
            </div>
            {failure?.paid ? (
                <PaidRefusal name={lookName(look)} />
            ) : failure ? (
                <p role="alert" className="text-xs text-destructive">
                    {failure.error}
                </p>
            ) : starter.blocked ? (
                <p role="status" className="text-xs text-muted-foreground">
                    {waitsForSaveWords(template.name)}
                </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={onBack}
                >
                    Back
                </Button>
                <Button
                    type="button"
                    onClick={() => void confirm()}
                    disabled={starter.blocked !== null}
                    data-ph-unmask=""
                    busy={busy}
                    busyLabel="Adding…"
                    data-template-use={template.id}
                >
                    Use {template.name} and its pages
                </Button>
            </div>
        </div>
    );
}

function Choice({
    id,
    checked,
    onChange,
    disabled,
    label,
    hint,
}: {
    id: string;
    checked: boolean;
    onChange: (on: boolean) => void;
    disabled: boolean;
    label: string;
    hint: string;
}) {
    return (
        <div className="flex items-start gap-2.5 coarse:min-h-11">
            <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(on) => onChange(on === true)}
                aria-describedby={`${id}-hint`}
                className="mt-0.5"
            />
            <div className="space-y-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                    {hint}
                </p>
            </div>
        </div>
    );
}
