"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOKS } from "@saroh/block-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Segmented } from "@saroh/ui/segmented";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { DEVICE_WIDTH } from "@/components/sites/editor-constants";
import { DeviceFrame } from "@/components/sites/editor/device-frame";
import type { CanvasChrome } from "@/components/sites/editor/editor-canvas";
import { PaidRefusal } from "@/components/sites/paid-refusal";
import { DraftPreview } from "@/components/sites/section-preview";
import { useNarrow } from "@/lib/hooks/use-narrow";
import type { Section, SitePage } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { inLook } from "@/lib/sites/style";

/** What a look's preview draws the business's home page from. */
export interface LookPreviewSource {
    siteId: string;
    address: string | null;
    pages: SitePage[];
    chrome: CanvasChrome;
    /**
     * The home page's sections as the editor holds them, when the home page
     * is the one open (unsaved work included); null to read its draft.
     */
    homeSections: Section[] | null;
    /** Read a page's draft sections (`getPageSections`); null on a failure. */
    readPage: (pageId: string) => Promise<Section[] | null>;
}

type PreviewDevice = "desktop" | "phone";

const CLASSIC_SUITS =
    "The look Saroh sites have had so far, set by your choices below.";

/**
 * A look before choosing it (DEC-177): the business's own home page drawn
 * in that look, in a large dialog on a desk and a full-height sheet on a
 * phone, with a desk and phone switch, the look's name and what it suits,
 * and "Use this look" and Close.
 *
 * Nothing saves and the draft doesn't change until "Use this look", which
 * follows the free and paid rule as the row does: on a plan without
 * "Themes, fonts and templates" a paid look is refused here, in one line
 * with the way to plans, and the dialog stays open. The editor's canvas
 * behind it is untouched. The page is inert: a preview, not a visit, so no
 * link opens and no form sends. Escape, the backdrop and Close close it,
 * and the keyboard goes back to the look's Preview button.
 */
export function LookPreview({
    look,
    open,
    source,
    style,
    options,
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
    /** The draft's style; the look is drawn over it, never written to it. */
    style: SiteStyle;
    options: SiteStyleOptions;
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
    // screen's own size with nothing said.
    const [device, setDevice] = useState<PreviewDevice>(() =>
        narrow ? "phone" : "desktop",
    );
    const [said, setSaid] = useState(false);
    const name = look ? LOOKS[look].name : "Classic";
    const suits = look ? LOOKS[look].suits : CLASSIC_SUITS;

    const home = useHomeSections(open, source);

    function use() {
        if (refused) {
            setSaid(true);
            return;
        }
        onUse();
        onClose();
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

    const page =
        home.state === "ready" ? (
            <DraftPreview
                siteId={source.siteId}
                siteAddress={source.address}
                sections={home.sections}
                pages={source.pages}
                page={source.pages.find((p) => p.isHome) ?? null}
                style={inLook(style, look)}
                styleOptions={options}
                chrome={source.chrome}
            />
        ) : null;

    const body = (
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted p-3 sm:p-4">
            {home.state === "loading" ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    Drawing your home page…
                </p>
            ) : home.state === "failed" ? (
                <div className="space-y-3 py-16 text-center text-sm">
                    <p>Couldn&rsquo;t draw your home page.</p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={home.retry}
                    >
                        Try again
                    </Button>
                </div>
            ) : (
                <div
                    // A picture of the page, not a visit: nothing in it
                    // can be pressed, focused or sent.
                    inert
                    data-look-preview={look ?? "classic"}
                    className="mx-auto overflow-hidden rounded-md border bg-background shadow-sm"
                    style={{ maxWidth: DEVICE_WIDTH[device] }}
                >
                    {device === "desktop" ? (
                        page
                    ) : (
                        <DeviceFrame
                            title={`Your home page in ${name}, at phone width`}
                        >
                            {page}
                        </DeviceFrame>
                    )}
                </div>
            )}
        </div>
    );

    const footer = (
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

type HomeRead =
    | { state: "loading"; retry: () => void }
    | { state: "failed"; retry: () => void }
    | { state: "ready"; sections: Section[]; retry: () => void };

/**
 * The home page's sections: the editor's own when it is the open page,
 * else its draft, read when the preview opens (and again on Try again).
 */
function useHomeSections(open: boolean, source: LookPreviewSource): HomeRead {
    const home = source.pages.find((p) => p.isHome) ?? source.pages.at(0);
    const [read, setRead] = useState<Section[] | "loading" | "failed">(
        "loading",
    );
    const [attempt, setAttempt] = useState(0);
    const given = source.homeSections;

    // The editor hands a new reader each render; the latest is used, and
    // only opening, the page or Try again reads again.
    const reader = useRef(source.readPage);
    useLayoutEffect(() => {
        reader.current = source.readPage;
    });
    const homeId = home?.id;

    useEffect(() => {
        if (!open || given || !homeId) return;
        let live = true;
        void reader.current(homeId).then(
            (sections) => {
                if (live) setRead(sections ?? "failed");
            },
            () => {
                if (live) setRead("failed");
            },
        );
        return () => {
            live = false;
        };
    }, [open, given, homeId, attempt]);

    const retry = () => {
        setRead("loading");
        setAttempt((n) => n + 1);
    };
    if (given) return { state: "ready", sections: given, retry };
    if (!home) return { state: "failed", retry };
    if (read === "loading" || read === "failed") return { state: read, retry };
    return { state: "ready", sections: read, retry };
}
