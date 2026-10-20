"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOKS, lookSuggestion } from "@saroh/block-contract";
import { fontPairStacks } from "@saroh/site-blocks";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Image from "next/image";
import type { KeyboardEvent } from "react";
import { useId, useRef, useState } from "react";

import { ChoiceGroup } from "@/components/shared/choice-group";
import type { LookPreviewSource } from "@/components/sites/look-preview";
import { LookPreview } from "@/components/sites/look-preview";
import { PaidRefusal } from "@/components/sites/paid-refusal";
import { useSiteFaces } from "@/components/sites/site-faces";
import type { LookThumbnailImage } from "@/lib/sites/look-thumbnails";
import { lookThumbnail } from "@/lib/sites/look-thumbnails";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { inLook, resolveStyleVariables } from "@/lib/sites/style";
import type { StyleChoiceRules } from "@/lib/sites/style-access";
import { ALL_FREE } from "@/lib/sites/style-access";

/** A choice in the Look row: one of the looks, or Classic. */
export type LookChoice = LookId | "classic";

/** The row's order (plan U16): today's look first, then the new three. */
const ORDER: readonly LookChoice[] = ["classic", "quiet", "folio", "live"];

const CLASSIC = {
    name: "Classic",
    suits: "The look Saroh sites have had so far, set by your choices below.",
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
     * What each look's Preview draws the home page from (DEC-177); absent
     * draws no Preview buttons.
     */
    preview?: LookPreviewSource;
}

/**
 * Website › Style's Look row (DEC-172, plan U16): Classic, Quiet, Folio
 * and Live, each with a phone picture and one line on what it suits, the
 * site's industry default marked "Suggested for …". Choosing one changes
 * the draft (the preview shows it at once, and the style autosave keeps
 * it); Publish makes it live. Classic is always one choice away.
 *
 * This row is the only place an existing site is offered a look: no card
 * in the workspace (R11). A failed save is said here, and the previous
 * look comes back (`useEditorStyle`).
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
    const [previewing, setPreviewing] = useState<LookChoice | null>(null);
    // The look whose dialog is drawn: kept as it closes, so it fades out
    // on its own content.
    const [shown, setShown] = useState<LookChoice>("classic");
    // Each opening mounts the dialog afresh (its device and its line).
    const [opened, setOpened] = useState(0);
    const previewButtons = useRef(new Map<LookChoice, HTMLButtonElement>());
    const draftLook = style.look ?? null;
    const choices = lookChoices({ available, draftLook, liveLook });
    if (choices.length === 0) return null;

    const suggestion = lookSuggestion(templateId);
    const status = refused
        ? null
        : lookStatus({ draftLook, liveLook, published, error });
    const paid = (look: LookId | null) =>
        look !== null && rules.isPaid("look", look);
    const shownLook = shown === "classic" ? null : shown;

    return (
        <section className="space-y-3" aria-labelledby={headingId}>
            <h3 id={headingId} className="label">
                Look
            </h3>
            <ChoiceGroup<LookChoice>
                labelledBy={headingId}
                describedBy={status || refused ? statusId : undefined}
                className="space-y-1.5"
                value={draftLook ?? "classic"}
                onChange={(choice) =>
                    onChoose(choice === "classic" ? null : choice)
                }
                // Each look with its Preview beside it (DEC-177): a button
                // of its own, never inside the radio.
                layout={
                    preview
                        ? (item) =>
                              choices.map((choice) => (
                                  <div
                                      key={choice}
                                      className="flex items-stretch gap-1.5"
                                  >
                                      <div className="min-w-0 flex-1">
                                          {item(choice)}
                                      </div>
                                      <Button
                                          ref={(el) => {
                                              if (el) {
                                                  previewButtons.current.set(
                                                      choice,
                                                      el,
                                                  );
                                              } else {
                                                  previewButtons.current.delete(
                                                      choice,
                                                  );
                                              }
                                          }}
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          data-look-preview-open={choice}
                                          aria-label={`Preview ${lookName(choice === "classic" ? null : choice)}`}
                                          className="h-auto min-h-9 shrink-0 self-center px-2.5 coarse:min-h-11"
                                          // The row's arrows move the look;
                                          // on this button they do nothing.
                                          onKeyDown={stopArrows}
                                          onClick={() => {
                                              setShown(choice);
                                              setOpened((n) => n + 1);
                                              setPreviewing(choice);
                                          }}
                                      >
                                          Preview
                                      </Button>
                                  </div>
                              ))
                        : undefined
                }
                choices={choices.map((choice) => {
                    const look = choice === "classic" ? null : choice;
                    const name = lookName(look);
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
                                />
                                <span className="min-w-0 flex-1 space-y-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-sm font-medium">
                                            {name}
                                        </span>
                                        {suggested ? (
                                            <Badge variant="tag" size="sm">
                                                {suggested}
                                            </Badge>
                                        ) : null}
                                        {paid(look) ? (
                                            <Badge variant="tag" size="sm">
                                                Paid plans
                                            </Badge>
                                        ) : null}
                                    </span>
                                    <span className="block text-xs leading-snug text-muted-foreground">
                                        {look
                                            ? LOOKS[look].suits
                                            : CLASSIC.suits}
                                    </span>
                                </span>
                            </>
                        ),
                    };
                })}
                itemClassName={(active) =>
                    cn(
                        "flex w-full items-start gap-3 rounded border p-2 text-left focus-visible:ring-offset-1",
                        active
                            ? "border-foreground ring-1 ring-foreground"
                            : "border-border hover:bg-muted",
                    )
                }
            />
            {refused ? (
                <div id={statusId}>
                    <PaidRefusal name={refused} />
                </div>
            ) : status ? (
                <p
                    id={statusId}
                    // A failed save is announced; the notes are read with
                    // the row they describe.
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
            {preview ? (
                <LookPreview
                    key={opened}
                    look={shownLook}
                    open={previewing !== null}
                    source={preview}
                    style={style}
                    options={options}
                    chosen={shownLook === draftLook}
                    paid={paid(shownLook)}
                    refused={
                        shownLook !== null && rules.refuses("look", shownLook)
                    }
                    onUse={() => onChoose(shownLook)}
                    onClose={() => setPreviewing(null)}
                    returnFocus={() =>
                        previewButtons.current.get(shown) ?? null
                    }
                />
            ) : null}
        </section>
    );
}

/** Arrow keys on a Preview button stay there, not the row's radios. */
function stopArrows(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key.startsWith("Arrow")) e.stopPropagation();
}

/**
 * A look on a phone, small. The renderer's own picture of the site's
 * template in that look when one was captured
 * (`lib/sites/look-thumbnails.ts`); otherwise drawn here in the business's
 * own colours, as the look makes them safe, with the look's corners and
 * heading face, so the four read apart at a glance.
 */
export function LookThumbnail({
    look,
    style,
    options,
    image,
}: {
    look: LookId | null;
    style: SiteStyle;
    options: SiteStyleOptions;
    image?: LookThumbnailImage;
}) {
    const faces = useSiteFaces();
    const frame =
        "relative h-[88px] w-[50px] shrink-0 overflow-hidden rounded-md border border-border-strong";
    if (image) {
        return (
            // Decorative: the choice's name and line say what it is.
            <Image
                src={image.src}
                alt=""
                aria-hidden
                width={image.width}
                height={image.height}
                sizes="50px"
                className={cn(frame, "object-cover object-top")}
            />
        );
    }

    const vars = resolveStyleVariables(inLook(style, look), options);
    const hsl = (name: string, fallback: string) =>
        `hsl(${vars[name] ?? fallback})`;
    const tokens = look ? LOOKS[look].tokens : null;
    // The site's corners at the picture's scale: a pill stays a pill, a
    // square corner square.
    const small = (px: number) => (px >= 999 ? 999 : Math.round(px / 6));
    // An older style may not carry the slider at all.
    const own = style.scalars.cornerRadius;
    const corner = Number.isFinite(own) ? own : 2;
    const radius = small(tokens ? tokens.radius : corner);
    const photoRadius = small(tokens ? tokens.radiusPhoto : corner);
    const heading = fontPairStacks(
        look ? LOOKS[look].fontPair : style.fontPair,
        faces,
    )?.heading;

    return (
        <span
            aria-hidden
            data-look-thumbnail={look ?? "classic"}
            className={cn(frame, "flex flex-col gap-1 p-1.5")}
            style={{ background: hsl("--site-bg", "0 0% 100%") }}
        >
            <span
                className="text-[13px] leading-none"
                style={{
                    color: hsl("--site-fg", "24 10% 10%"),
                    fontFamily: heading,
                }}
            >
                Aa
            </span>
            <span
                className="block h-[30px] w-full"
                style={{
                    background: hsl("--site-accent-soft", "24 6% 90%"),
                    borderRadius: photoRadius,
                }}
            />
            <span
                className="block h-0.5 w-4/5 rounded-full opacity-50"
                style={{ background: hsl("--site-body", "24 6% 34%") }}
            />
            <span
                className="block h-0.5 w-3/5 rounded-full opacity-50"
                style={{ background: hsl("--site-body", "24 6% 34%") }}
            />
            <span
                className="mt-auto block h-2 w-full"
                style={{
                    background: hsl("--site-accent", "24 10% 10%"),
                    borderRadius: radius,
                }}
            />
        </span>
    );
}
