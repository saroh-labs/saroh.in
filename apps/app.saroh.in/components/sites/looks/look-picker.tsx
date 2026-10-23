"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOKS, lookSuggestion } from "@saroh/block-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showSuccess } from "@saroh/ui/toast";
import { ChevronDown, Eye } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useContext, useId, useRef, useState } from "react";

import { ChoiceGroup } from "@/components/shared/fields/choice-group";
import { lookThumbnail } from "@/lib/sites/look-thumbnails";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import type { StyleChoiceRules } from "@/lib/sites/style-access";
import { ALL_FREE } from "@/lib/sites/style-access";
import {
    BrandPicker,
    PickerFoot,
    PickerHeader,
    PickerHost,
} from "./brand-picker";
import { DraftTools } from "./draft-tools";
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
    onChoose: (look: LookId | null) => void;
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
    const galleryId = useId();
    const statusId = useId();
    const inSheet = useContext(PickerHost) !== null;
    const [picking, setPicking] = useState(false);
    const [previewing, setPreviewing] = useState<LookChoice | null>(null);
    // The look whose dialog is drawn: kept as it closes, so it fades out
    // on its own content.
    const [shown, setShown] = useState<LookChoice>("classic");
    // Each opening mounts the dialog afresh (its device and its line).
    const [opened, setOpened] = useState(0);
    // The Preview button that opened it, for the keyboard on the way back.
    const opener = useRef<HTMLElement | null>(null);
    const changeRef = useRef<HTMLButtonElement | null>(null);
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
    const paidNames = choices
        .filter((c) => c !== "classic" && paid(c))
        .map((c) => lookName(c as LookId));
    const shownLook = shown === "classic" ? null : shown;
    const lineUnderCard = refused !== null && !picking;

    function openPreview(choice: LookChoice, from: HTMLElement) {
        opener.current = from;
        setShown(choice);
        setOpened((n) => n + 1);
        setPreviewing(choice);
        // On a desk the dialog takes the gallery's place; in the sheet the
        // gallery is still there when the dialog closes.
        if (!inSheet) setPicking(false);
    }

    function pick(choice: LookChoice) {
        const look = choice === "classic" ? null : choice;
        onChoose(look);
        // Refused: the gallery stays open, its foot saying why.
        if (look !== null && rules.refuses("look", look)) return;
        setPicking(false);
        if (look !== draftLook) showSuccess(lookTakenWords(lookName(look)));
    }

    const previewButton = (
        choice: LookChoice,
        className: string,
        iconOnly = false,
    ) =>
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
                {iconOnly ? null : "Preview"}
            </Button>
        ) : null;

    return (
        <section className="space-y-2" aria-labelledby={headingId}>
            <h3 id={headingId} className="label">
                Look
            </h3>
            <div
                data-look-current={current}
                className={cn(
                    "rounded-[10px] border bg-card p-2",
                    inSheet
                        ? "flex items-center gap-2.5"
                        : "flex flex-col gap-2",
                )}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <LookThumbnail
                        look={draftLook}
                        style={style}
                        options={options}
                        image={lookThumbnail(templateId, current)}
                        className="h-[54px] w-[72px]"
                    />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                            {lookName(draftLook)}
                        </p>
                        <p className="text-xs leading-snug text-muted-foreground">
                            {draftLook ? LOOKS[draftLook].short : CLASSIC.short}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                    {/* The sheet has room for the eye alone (Brand tab, phone). */}
                    {previewButton(
                        current,
                        inSheet ? "w-11 px-0" : "flex-1",
                        inSheet,
                    )}
                    <BrandPicker
                        open={picking}
                        onOpenChange={setPicking}
                        title="Change look"
                        className="w-[480px] max-w-[calc(100vw-24px)]"
                        header={
                            <PickerHeader
                                title="Change look"
                                note={`${choices.length} looks · the page changes when you choose`}
                                onClose={() => setPicking(false)}
                            />
                        }
                        trigger={
                            <Button
                                ref={changeRef}
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-haspopup="dialog"
                                aria-expanded={picking}
                                data-look-change=""
                                className={inSheet ? undefined : "flex-1"}
                            >
                                Change
                                <ChevronDown aria-hidden />
                            </Button>
                        }
                    >
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            <ChoiceGroup<LookChoice>
                                label="Looks"
                                describedBy={refused ? galleryId : undefined}
                                className="grid grid-cols-2 gap-2.5"
                                value={current}
                                onChange={pick}
                                // Each look with its Preview (DEC-177): a
                                // button of its own, never inside the radio.
                                layout={(item) =>
                                    choices.map((choice) => (
                                        <div
                                            key={choice}
                                            className="relative flex flex-col gap-1.5"
                                        >
                                            {item(choice)}
                                            {/* Under the card on a phone,
                                                where it is a thumb's width. */}
                                            {previewButton(
                                                choice,
                                                inSheet
                                                    ? "w-full"
                                                    : "absolute bottom-2 right-2 h-[30px] gap-1 px-2.5 text-xs",
                                            )}
                                        </div>
                                    ))
                                }
                                choices={choices.map((choice) => {
                                    const look =
                                        choice === "classic" ? null : choice;
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
                                                    image={lookThumbnail(
                                                        templateId,
                                                        choice,
                                                    )}
                                                    className={
                                                        inSheet
                                                            ? "h-[88px] w-full"
                                                            : "h-[104px] w-full"
                                                    }
                                                />
                                                <span
                                                    className={cn(
                                                        "block min-w-0 px-1 pb-0.5",
                                                        preview &&
                                                            !inSheet &&
                                                            "pr-24",
                                                    )}
                                                >
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
                        {paidNames.length > 0 || refused ? (
                            <PickerFoot>
                                {paidNames.length > 0 ? (
                                    <p>
                                        <Badge variant="tag" size="sm">
                                            Paid plans
                                        </Badge>{" "}
                                        {andList(paidNames)}
                                    </p>
                                ) : null}
                                {refused ? (
                                    <div id={galleryId}>
                                        <PaidRefusal name={refused} />
                                    </div>
                                ) : null}
                            </PickerFoot>
                        ) : null}
                    </BrandPicker>
                </div>
            </div>
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
            {preview?.starter ? (
                <DraftTools starter={preview.starter} lookName={lookName} />
            ) : null}
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

/** "Quiet, Folio and Live". */
function andList(names: string[]): string {
    return names.length < 2
        ? (names[0] ?? "")
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Arrow keys on a Preview button stay there, not the gallery's radios. */
function stopArrows(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key.startsWith("Arrow")) e.stopPropagation();
}
