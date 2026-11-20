"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOKS, lookSuggestion } from "@saroh/block-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { showSuccess } from "@saroh/ui/toast";
import { Eye } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useContext, useId, useRef, useState } from "react";

import { lookThumbnail } from "@/lib/sites/look-thumbnails";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { changedComponents } from "@/lib/sites/style";
import type { StyleChoiceRules } from "@/lib/sites/style-access";
import { ALL_FREE } from "@/lib/sites/style-access";
import { ChoiceGroup, RadioCards } from "@saroh/ui/choice-group";
import { BrandInline } from "./brand-picker";
import type { LookPreviewSource } from "./look-preview";
import { LookPreview, lookTakenWords } from "./look-preview";
import { LookThumbnail } from "./look-thumbnail";
import { PaidRefusal } from "./paid-refusal";

/** A choice in the Look row: one of the looks, or Classic. */
export type LookChoice = LookId | "classic";

/** The row's order (plan U16): today's look first, then the new three. */
const ORDER: readonly LookChoice[] = ["classic", "quiet", "folio", "live"];

const CLASSIC = {
    name: "Classic",
    suits: "The look Saroh sites have had so far, set by your choices below.",
    short: "Your own fonts and colours",
};

/** A look's name, Classic's for none. */
export function lookName(look: LookId | null | undefined): string {
    return look ? LOOKS[look].name : CLASSIC.name;
}

/**
 * The looks the row offers (DEC-172, KD12). While `SITE_LOOKS` is on for
 * the business, all four, for every site: the suggestion is the only
 * industry signal. Off, a Classic site is offered none (the row is not
 * drawn), and a site whose draft or live site has a look keeps only those
 * and Classic, so the owner can always go back, and back again.
 */
export function lookChoices({
    available,
    draftLook,
    liveLook,
}: {
    available: boolean;
    draftLook: LookId | null;
    liveLook: LookId | null;
}): LookChoice[] {
    if (available) return [...ORDER];
    if (!draftLook && !liveLook) return [];
    return ORDER.filter(
        (c) => c === "classic" || c === draftLook || c === liveLook,
    );
}

/**
 * The one line under the row: a failed save, else that the chosen look
 * isn't live yet, else what a look takes over from the controls below.
 * One message at a time, never a stack of notes.
 */
export function lookStatus({
    draftLook,
    liveLook,
    published,
    error,
}: {
    draftLook: LookId | null;
    liveLook: LookId | null;
    published: boolean;
    error: string | null;
}): { tone: "error" | "note"; text: string } | null {
    if (error) return { tone: "error", text: error };
    if (published && draftLook !== liveLook) {
        return {
            tone: "note",
            text: `Not published yet. Your site is ${lookName(liveLook)} until you publish.`,
        };
    }
    if (draftLook) {
        return {
            tone: "note",
            text: `${lookName(draftLook)} sets its own type, corners and spacing. Your colours stay yours.`,
        };
    }
    return null;
}

/** What the Look row needs beside the style: `StylePanel`'s `looks`. */
export interface LookChoices {
    /** `SITE_LOOKS` is on for the business. */
    available: boolean;
    /** The live site's look; null for Classic or never published. */
    liveLook: LookId | null;
    /** Something is live, so a change waits for Publish. */
    published: boolean;
    /** The template the site was made from, for the suggestion. */
    templateId: string | null;
    /** Why the last choice didn't save; the previous look is back. */
    error: string | null;
    /**
     * `keepComponents` false: the new look's own component styles, the
     * owner's choices dropped ("Use <look>'s styles", DEC-227). Absent or
     * true keeps them.
     */
    onChoose: (look: LookId | null, keepComponents?: boolean) => void;
    /**
     * Each look's Preview (DEC-177): its showcase template, and its starter
     * content when offered (DEC-182). Absent draws no Preview buttons.
     */
    preview?: LookPreviewSource;
}

/**
 * The Brand tab's Look (DEC-172, plan U16; redesigned 22 Oct 2026): the
 * look in force as a card, with a picture of the page in it, Preview and
 * Change. Change opens the four looks as a gallery (a popover on a desk,
 * the sheet itself on a phone), each with its picture, one line on what
 * it suits and its own Preview, the site's industry default marked
 * "Suggested for …", the one in force "Now". Choosing one changes the
 * draft (the preview shows it at once, and the style autosave keeps it);
 * Publish makes it live. Classic is always one choice away.
 *
 * A paid look refused on this plan keeps the gallery open with the one
 * line in its foot; closed, the line sits under the card.
 *
 * This is the only place an existing site is offered a look: no card in
 * the workspace (R11). A failed save is said here, and the previous look
 * comes back (`useEditorStyle`).
 */
export function LookPicker({
    style,
    options,
    available,
    liveLook,
    published,
    templateId,
    error,
    onChoose,
    preview,
    rules = ALL_FREE,
    refused = null,
}: LookChoices & {
    style: SiteStyle;
    options: SiteStyleOptions;
    /** Which looks are paid and refused on this plan (DEC-177). */
    rules?: StyleChoiceRules;
    /** The paid look just refused, by name: said in the row's one line. */
    refused?: string | null;
}) {
    const headingId = useId();
    const statusId = useId();
    // A phone's Brand sheet (DEC-185): the looks themselves, to swipe.
    const inSheet = useContext(BrandInline);
    const [previewing, setPreviewing] = useState<LookChoice | null>(null);
    // The look whose dialog is drawn: kept as it closes, so it fades out
    // on its own content.
    const [shown, setShown] = useState<LookChoice>("classic");
    // Each opening mounts the dialog afresh (its device and its line).
    const [opened, setOpened] = useState(0);
    // The Preview button that opened it, for the keyboard on the way back.
    const opener = useRef<HTMLElement | null>(null);
    const changeRef = useRef<HTMLDivElement | null>(null);
    // A look asked about first: the owner changed components (DEC-227).
    const [switching, setSwitching] = useState<LookChoice | null>(null);
    const [keep, setKeep] = useState<"keep" | "use">("keep");
    const draftLook = style.look ?? null;
    const choices = lookChoices({ available, draftLook, liveLook });
    if (choices.length === 0) return null;

    const current: LookChoice = draftLook ?? "classic";
    const suggestion = lookSuggestion(templateId);
    const status = refused
        ? null
        : lookStatus({ draftLook, liveLook, published, error });
    const paid = (look: LookId | null) =>
        look !== null && rules.isPaid("look", look);
    const shownLook = shown === "classic" ? null : shown;
    const lineUnderCard = refused !== null;

    function openPreview(choice: LookChoice, from: HTMLElement) {
        opener.current = from;
        setShown(choice);
        setOpened((n) => n + 1);
        setPreviewing(choice);
    }

    const changed = changedComponents(style).length;

    function pick(choice: LookChoice) {
        const look = choice === "classic" ? null : choice;
        const refusedHere = look !== null && rules.refuses("look", look);
        // Components the owner changed: keep them or take the new look's
        // (SBSwitchLook). A refused look is refused as before.
        if (changed > 0 && look !== draftLook && !refusedHere) {
            setKeep("keep");
            setSwitching(choice);
            return;
        }
        take(look, true);
    }

    function take(look: LookId | null, keepComponents: boolean) {
        if (keepComponents) onChoose(look);
        else onChoose(look, false);
        // Refused: the line under the cards says why.
        if (look !== null && rules.refuses("look", look)) return;
        if (look !== draftLook) showSuccess(lookTakenWords(lookName(look)));
    }

    const switchName = lookName(
        switching === null || switching === "classic" ? null : switching,
    );
    const changes = `${changed} ${changed === 1 ? "change" : "changes"}`;

    const previewButton = (choice: LookChoice, className: string) =>
        preview ? (
            <Button
                type="button"
                variant="outline"
                size="sm"
                data-look-preview-open={choice}
                aria-label={`Preview ${lookName(choice === "classic" ? null : choice)}`}
                className={className}
                // The gallery's arrows move the look; on this button they
                // do nothing.
                onKeyDown={stopArrows}
                onClick={(e) => openPreview(choice, e.currentTarget)}
            >
                <Eye aria-hidden />
                Preview
            </Button>
        ) : null;

    // The four looks as cards, in the panel itself (U24b, `WXBBrand`): on
    // a desk two by two, in a phone's sheet a row to swipe (DEC-185).
    const gallery = (
        <div ref={changeRef} tabIndex={-1} className="outline-none">
            <ChoiceGroup<LookChoice>
                label="Look"
                describedBy={refused ? statusId : undefined}
                className={
                    inSheet
                        ? "flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1"
                        : "grid grid-cols-2 gap-2"
                }
                value={current}
                onChange={pick}
                // Each look with its Preview (DEC-177): a button of its
                // own, never inside the radio.
                layout={(item) =>
                    choices.map((choice) => (
                        <div
                            key={choice}
                            className={cn(
                                "flex min-w-0 flex-col gap-1",
                                inSheet && "w-[44%] shrink-0 snap-start",
                            )}
                        >
                            {item(choice)}
                            {previewButton(
                                choice,
                                inSheet ? "w-full" : "h-8 w-full text-xs",
                            )}
                        </div>
                    ))
                }
                choices={choices.map((choice) => {
                    const look = choice === "classic" ? null : choice;
                    const suggested =
                        available && look === suggestion.look
                            ? suggestion.industry
                                ? `Suggested for ${suggestion.industry}`
                                : "Suggested"
                            : null;
                    return {
                        value: choice,
                        data: { "data-look-choice": choice },
                        label: (
                            <>
                                <LookThumbnail
                                    look={look}
                                    style={style}
                                    options={options}
                                    image={lookThumbnail(templateId, choice)}
                                    className={
                                        inSheet
                                            ? "h-[88px] w-full"
                                            : "h-[64px] w-full"
                                    }
                                />
                                <span className="block min-w-0 px-1 pb-0.5">
                                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                                        {lookName(look)}
                                        {choice === current ? (
                                            <span className="rounded-[5px] bg-foreground px-1.5 py-px text-[0.65625rem] font-semibold text-background">
                                                Now
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="block text-xs leading-snug text-muted-foreground">
                                        {look
                                            ? LOOKS[look].short
                                            : CLASSIC.short}
                                        {paid(look) ? " · paid plans" : ""}
                                    </span>
                                    {suggested ? (
                                        <Badge
                                            variant="tag"
                                            size="sm"
                                            className="mt-1"
                                        >
                                            {suggested}
                                        </Badge>
                                    ) : null}
                                </span>
                            </>
                        ),
                    };
                })}
                itemClassName={(active) =>
                    cn(
                        "flex w-full flex-col gap-1.5 rounded-[10px] border bg-card p-1.5 text-left focus-visible:ring-offset-1",
                        active
                            ? "border-foreground ring-1 ring-foreground"
                            : "border-border hover:bg-muted",
                    )
                }
            />
        </div>
    );

    return (
        <section className="space-y-2" aria-labelledby={headingId}>
            <div
                className={cn(
                    "flex items-baseline gap-2",
                    inSheet && "sr-only",
                )}
            >
                <h3 id={headingId} className="text-sm font-semibold">
                    Look
                </h3>
                <span className="text-xs text-muted-foreground">
                    Sets type, shape and spacing
                </span>
            </div>
            <div data-look-current={current}>{gallery}</div>
            {lineUnderCard ? (
                <div id={statusId}>
                    <PaidRefusal name={refused} />
                </div>
            ) : status ? (
                <p
                    id={statusId}
                    // A failed save is announced; the notes are read with
                    // the card they describe.
                    role={status.tone === "error" ? "alert" : undefined}
                    data-look-status={status.tone}
                    className={cn(
                        "text-xs",
                        status.tone === "error"
                            ? "text-destructive"
                            : "text-muted-foreground",
                    )}
                >
                    {status.text}
                </p>
            ) : null}
            <ConfirmDialog
                open={switching !== null}
                onOpenChange={(open) => {
                    if (!open) setSwitching(null);
                }}
                tone="neutral"
                title={`Switch to ${switchName}?`}
                description={`You changed ${changed} ${changed === 1 ? "component" : "components"} from ${lookName(draftLook)}. ${switchName} brings its own fonts, spacing and shapes. Your colours, logo, pages and words stay yours either way.`}
                confirmLabel={`Switch to ${switchName}`}
                keepLabel="Cancel"
                returnFocusTo={changeRef}
                onConfirm={() => {
                    if (switching === null) return;
                    take(
                        switching === "classic" ? null : switching,
                        keep === "keep",
                    );
                }}
            >
                <RadioCards
                    label="Component styles"
                    value={keep}
                    onChange={setKeep}
                    options={[
                        {
                            value: "keep",
                            label: `Keep my ${changes}`,
                            note: `Everything else follows ${switchName}.`,
                        },
                        {
                            value: "use",
                            label: `Use ${switchName}’s styles`,
                            note: `${switchName}’s own buttons, cards, headings and spacing.`,
                        },
                    ]}
                />
            </ConfirmDialog>
            {preview ? (
                <LookPreview
                    key={opened}
                    look={shownLook}
                    open={previewing !== null}
                    source={preview}
                    chosen={shownLook === draftLook}
                    paid={paid(shownLook)}
                    refused={
                        shownLook !== null && rules.refuses("look", shownLook)
                    }
                    onUse={() => onChoose(shownLook)}
                    onClose={() => setPreviewing(null)}
                    returnFocus={() =>
                        opener.current?.isConnected
                            ? opener.current
                            : changeRef.current
                    }
                />
            ) : null}
        </section>
    );
}

/** Arrow keys on a Preview button stay there, not the gallery's radios. */
function stopArrows(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key.startsWith("Arrow")) e.stopPropagation();
}
