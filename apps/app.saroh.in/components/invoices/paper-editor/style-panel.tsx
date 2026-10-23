"use client";

import type { PaperStyle } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";

import type { PaperDefault } from "@/lib/invoices/paper-look";
import { lookWords } from "@/lib/invoices/paper-look";

import { PaperLookFields } from "./paper-look-fields";

/** The rail's closing words (INVNewEdit). */
export const STYLE_PANEL_NOTE =
    "Styles change colour, logo and layout. A tax invoice always keeps the fields GST requires (Rule 46).";

/**
 * The style rail (INVNewEdit, and INVNewEditPhone's Style sheet): Classic,
 * Band or Compact, "Your colour", and the logo with Change.
 *
 * What is chosen here is the draft's own look, saved with it as it is
 * chosen. Until it chooses, it follows the business's default, and says
 * so; "Use my default" goes back to following it. "Make this my default"
 * sets the business's (Owner and Admin, `org:update`), which every new
 * invoice then starts in.
 *
 * A colour is never refused for being pale or dark: the paper draws it
 * deeper where it has to, to read (`paperColours`), and the rail says so.
 */
export function StylePanel({
    look,
    own,
    fallback,
    onStyle,
    onColour,
    onUseDefault,
    canSetDefault,
    onMakeDefault,
    savingDefault,
    logo,
    onChangeLogo,
}: {
    /** What the paper is drawn in now. */
    look: PaperDefault;
    /** The draft chose a style or colour of its own. */
    own: boolean;
    /** The business's default. */
    fallback: PaperDefault;
    onStyle: (style: PaperStyle) => void;
    onColour: (hex: string) => void;
    onUseDefault: () => void;
    /** Owner or Admin: may set the business's default and its logo. */
    canSetDefault: boolean;
    onMakeDefault: () => void;
    savingDefault: boolean;
    logo: { url: string | null; initials: string };
    /** Opens the business logo's sheet, here; absent when this role can't. */
    onChangeLogo?: () => void;
}) {
    const isDefault =
        look.style === fallback.style &&
        (look.colour ?? null) === (fallback.colour ?? null);

    return (
        <div className="grid content-start gap-4">
            <PaperLookFields
                look={look}
                onStyle={onStyle}
                onColour={onColour}
            />

            <div className="grid gap-2">
                <span className="label">Logo</span>
                <div className="flex items-center gap-2.5">
                    {logo.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                        <img
                            src={logo.url}
                            alt="Your logo"
                            className="size-9 flex-none rounded-lg border border-border bg-white object-cover"
                        />
                    ) : (
                        <span
                            aria-hidden
                            className="grid size-9 flex-none place-items-center rounded-lg border border-border bg-muted text-[11px] font-semibold"
                        >
                            {logo.initials}
                        </span>
                    )}
                    {onChangeLogo ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            id="paper-change-logo"
                            onClick={onChangeLogo}
                        >
                            {logo.url ? "Change" : "Add logo"}
                        </Button>
                    ) : (
                        <span className="text-[12px] text-muted-foreground">
                            {logo.url
                                ? "Your business logo."
                                : "No logo yet. An owner or admin adds it."}
                        </span>
                    )}
                </div>
            </div>

            <div className="grid gap-2 border-t border-border pt-3">
                <p className="text-[12.5px]" aria-live="polite">
                    {own
                        ? "This invoice's own look."
                        : `Your default look: ${lookWords(fallback)}.`}
                </p>
                <div className="flex flex-wrap gap-2">
                    {own ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onUseDefault}
                        >
                            Use my default
                        </Button>
                    ) : null}
                    {canSetDefault && own && !isDefault ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            busy={savingDefault}
                            busyLabel="Saving…"
                            onClick={onMakeDefault}
                        >
                            Make this my default
                        </Button>
                    ) : null}
                </div>
                {!canSetDefault ? (
                    <p className="text-[12px] text-muted-foreground">
                        Only an owner or admin can change the default.
                    </p>
                ) : null}
            </div>

            <p className="text-[12px] leading-[1.5] text-muted-foreground">
                {STYLE_PANEL_NOTE}
            </p>
            <span className="w-fit rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                Custom styles: on the roadmap
            </span>
        </div>
    );
}
