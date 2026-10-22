"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOKS } from "@saroh/block-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { Segmented } from "@saroh/ui/segmented";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { DeviceFrame } from "@/components/sites/canvas/device-frame";
import { DEVICE_WIDTH } from "@/components/sites/editor/editor-constants";
import { useNarrow } from "@/lib/hooks/use-narrow";
import type { SitePage } from "@/lib/sites/service";
import {
    STARTER_FILL_HINT,
    STARTER_FILL_LABEL,
    STARTER_SAMPLE_NOTE,
    starterConfirmText,
    starterPlanFor,
} from "@/lib/sites/starter-content";
import { LookShowcase } from "./look-showcase";
import { PaidRefusal } from "./paid-refusal";
import type { StarterContentActions } from "./starter-content-actions";

/** What a look's Preview needs from the editor beside the look. */
export interface LookPreviewSource {
    /** The site's pages, for what the starter content would replace. */
    pages: SitePage[];
    /**
     * "Use this look with its starter content" (DEC-182); absent, only the
     * look is offered.
     */
    starter?: StarterContentActions;
}

type PreviewDevice = "desktop" | "phone";

const CLASSIC_SUITS =
    "The look Saroh sites have had so far, set by your choices below.";

/**
 * A look before choosing it (DEC-177, DEC-182): the look's showcase
 * template (`LookShowcase`: Quiet the Salon, Live the Gym, Folio the
 * Studio, Classic the Bakery) drawn with its sample words and pictures, in
 * a large dialog on a desk and a full-height sheet on a phone, with a desk
 * and phone switch, the look's name and what it suits.
 *
 * Two ways on. "Use this look" takes the look alone into the draft, as
 * choosing it in the row does. "Use this look with its starter content"
 * first says which pages it replaces and adds, and that the words are a
 * sample business's, then copies the template's pages into the draft and
 * sets the look (`starterContentActions`, with Undo).
 *
 * Both follow the free and paid rule as the row does: on a plan without
 * "Themes, fonts and templates" a paid look is refused here, in one line
 * with the way to plans, and the dialog stays open. Nothing goes live
 * until Publish. The page is inert: a picture, not a visit. Escape, the
 * backdrop and Close close it, and the keyboard goes back to the look's
 * Preview button.
 */
export function LookPreview({
    look,
    open,
    source,
    chosen,
    paid,
    refused,
    onUse,
    onClose,
    returnFocus,
}: {
    /** The look shown; null is Classic. */
    look: LookId | null;
    open: boolean;
    source: LookPreviewSource;
    /** It is the draft's look already. */
    chosen: boolean;
    /** Marked "Paid plans". */
    paid: boolean;
    /** Choosing it would be refused on this plan. */
    refused: boolean;
    /** Take it into the draft, as choosing it in the row does. */
    onUse: () => void;
    onClose: () => void;
    /** The Preview button that opened it. */
    returnFocus: () => HTMLElement | null;
}) {
    const narrow = useNarrow();
    // Each opening is a new mount (the row keys it), so it starts on the
    // screen's own size, on the look, with nothing said.
    const [device, setDevice] = useState<PreviewDevice>(() =>
        narrow ? "phone" : "desktop",
    );
    const [said, setSaid] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const name = look ? LOOKS[look].name : "Classic";
    const suits = look ? LOOKS[look].suits : CLASSIC_SUITS;
    const starter = source.starter;

    function use() {
        if (refused) {
            setSaid(true);
            return;
        }
        onUse();
        onClose();
    }

    function startStarter() {
        if (refused) {
            setSaid(true);
            return;
        }
        setConfirming(true);
    }

    const header = (title: ReactNode, description: ReactNode) => (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b px-4 py-3 pr-14">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    {title}
                    {paid ? (
                        <Badge variant="tag" size="sm">
                            Paid plans
                        </Badge>
                    ) : null}
                </div>
                {description}
            </div>
            <Segmented<PreviewDevice>
                label="Show it on"
                value={device}
                onValueChange={setDevice}
                options={[
                    { value: "desktop", label: "Desk" },
                    { value: "phone", label: "Phone" },
                ]}
            />
        </div>
    );

    const page = <LookShowcase look={look} />;
    const body = (
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted p-3 sm:p-4">
            <div
                // A picture of the page, not a visit: nothing in it can be
                // pressed, focused or sent.
                inert
                data-look-preview={look ?? "classic"}
                className="mx-auto overflow-hidden rounded-md border bg-background shadow-sm"
                style={{ maxWidth: DEVICE_WIDTH[device] }}
            >
                {device === "desktop" ? (
                    page
                ) : (
                    <DeviceFrame title={`${name} at phone width`}>
                        {page}
                    </DeviceFrame>
                )}
            </div>
        </div>
    );

    const footer =
        confirming && starter ? (
            <StarterConfirm
                look={look}
                name={name}
                pages={source.pages}
                starter={starter}
                onBack={() => setConfirming(false)}
                onDone={onClose}
            />
        ) : (
            <div className="space-y-2 border-t px-4 py-3">
                {said ? <PaidRefusal name={name} /> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                    {chosen ? (
                        <p className="text-xs text-muted-foreground sm:mr-auto">
                            Your draft is in {name}.
                        </p>
                    ) : null}
                    <Button type="button" variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    {starter ? (
                        <Button
                            type="button"
                            variant="outline"
                            data-look-starter-open=""
                            onClick={startStarter}
                        >
                            Use this look with its starter content
                        </Button>
                    ) : null}
                    {chosen ? null : (
                        <Button type="button" onClick={use}>
                            Use this look
                        </Button>
                    )}
                </div>
            </div>
        );

    const backToOpener = (e: Event) => {
        const back = returnFocus();
        if (back?.isConnected) {
            e.preventDefault();
            back.focus();
        }
    };
    const onOpenChange = (next: boolean) => {
        if (!next) onClose();
    };

    if (narrow) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    side="bottom"
                    className="flex h-dvh max-h-dvh w-full flex-col gap-0 p-0"
                    onCloseAutoFocus={backToOpener}
                >
                    {header(
                        <SheetTitle className="text-base">{name}</SheetTitle>,
                        <SheetDescription className="text-xs">
                            {suits}
                        </SheetDescription>,
                    )}
                    {body}
                    {footer}
                </SheetContent>
            </Sheet>
        );
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-[calc(100dvh-4rem)] max-w-[min(72rem,calc(100vw-2rem))] flex-col gap-0 p-0"
                onCloseAutoFocus={backToOpener}
            >
                {header(
                    <DialogTitle className="text-base">{name}</DialogTitle>,
                    <DialogDescription className="text-xs">
                        {suits}
                    </DialogDescription>,
                )}
                {body}
                {footer}
            </DialogContent>
        </Dialog>
    );
}

/**
 * The starter content's confirm, in place of the Preview's footer (DEC-182):
 * which pages are replaced and added, that the words are a sample
 * business's, then the copy. "Fill in my details", on by default, puts the
 * business's own in place of the samples as it copies (amended 22 Oct
 * 2026); off, the samples stay for "Bring in my details" later. A refusal
 * is said here and the dialog stays.
 */
function StarterConfirm({
    look,
    name,
    pages,
    starter,
    onBack,
    onDone,
}: {
    look: LookId | null;
    name: string;
    pages: SitePage[];
    starter: StarterContentActions;
    onBack: () => void;
    onDone: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [fill, setFill] = useState(true);
    const fillId = useId();
    const [failure, setFailure] = useState<
        { paid: true } | { paid: false; error: string } | null
    >(null);
    const plan = starterPlanFor(look, pages);

    async function confirm() {
        setBusy(true);
        setFailure(null);
        let outcome: Awaited<ReturnType<typeof starter.copy>>;
        try {
            outcome = await starter.copy(look, fill);
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
        <div
            className="space-y-2 border-t px-4 py-3"
            data-look-starter-confirm=""
        >
            <p className="text-sm">{starterConfirmText(plan)}</p>
            <p className="text-xs text-muted-foreground">
                {STARTER_SAMPLE_NOTE}
            </p>
            <div className="flex items-start gap-2.5 coarse:min-h-11">
                <Checkbox
                    id={fillId}
                    checked={fill}
                    disabled={busy}
                    onCheckedChange={(on) => setFill(on === true)}
                    aria-describedby={`${fillId}-hint`}
                    data-look-starter-fill=""
                    className="mt-0.5"
                />
                <div className="space-y-0.5">
                    <Label htmlFor={fillId}>{STARTER_FILL_LABEL}</Label>
                    <p
                        id={`${fillId}-hint`}
                        className="text-xs text-muted-foreground"
                    >
                        {STARTER_FILL_HINT}
                    </p>
                </div>
            </div>
            {failure?.paid ? (
                <PaidRefusal name={name} />
            ) : failure ? (
                <p role="alert" className="text-xs text-destructive">
                    {failure.error}
                </p>
            ) : starter.blocked ? (
                <p role="status" className="text-xs text-muted-foreground">
                    {starter.blocked}
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
                    busy={busy}
                    busyLabel="Adding…"
                    data-ph-unmask=""
                >
                    Use {name} and its starter content
                </Button>
            </div>
        </div>
    );
}
