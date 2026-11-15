"use client";

import type { LookId } from "@saroh/block-contract";
import { templateRender } from "@saroh/site-blocks/showcase";
import { getTemplate } from "@saroh/templates";
import { Badge } from "@saroh/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { PartialRead } from "@saroh/ui/failed-read";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import type { ReactNode } from "react";
import { useState } from "react";

import { DeviceFrame } from "@/components/sites/canvas/device-frame";
import { DEVICE_WIDTH } from "@/components/sites/editor/editor-constants";
import type { Template } from "@/lib/sites/service";
import type { ModuleStates, TemplateGroup } from "@/lib/sites/template-picker";
import { offReason, usesLine } from "@/lib/sites/template-picker";
import { templateThumbnail } from "@/lib/sites/template-thumbnails";

import { DrawOrElse, TemplatePage } from "./template-page";
import { ColourwayChoice, TemplateThumbnail } from "./template-picker";
import type { DetailsRead } from "./use-preview-details";
import { WhatGoesInPanel } from "./what-goes-in";

type Device = "desktop" | "phone";
type Whose = "yours" | "sample";

/** After "Couldn't load your details." (board D7, in the house's words). */
export const detailsUnreadWords = (name: string) =>
    `This is ${name} with a sample business. Your site is still made with yours.`;

/** Said when the renderer can't draw the template (board D7). */
export const couldntDrawWords = (name: string) =>
    `This preview couldn't be drawn just now. Its picture is the real page, and you can still start from ${name}.`;

/**
 * A template before choosing it (DEC-216, board D4): its home page drawn
 * with the business's own name, services, place and staff where it has
 * them (the sample's where it doesn't), in a large dialog on a desk and a
 * full-height sheet on a phone. A desk and phone switch, its colourways,
 * every template in the list to move between, and "What goes in" beside
 * it. Choosing is the caller's `footer`, a separate press.
 *
 * The page is inert: a picture, not a visit. Escape, the backdrop and
 * Close close it, and the keyboard goes back to the press that opened it.
 */
export function TemplatePreview({
    open,
    groups,
    templateId,
    onTemplate,
    styleId,
    onStyle,
    modules,
    details,
    look,
    suggested,
    footer,
    onClose,
    returnFocus,
}: {
    open: boolean;
    /** The list beside the page, as the picker groups it. */
    groups: readonly TemplateGroup<Template>[];
    /** The template shown. */
    templateId: string;
    onTemplate: (id: string) => void;
    /** Its colourway; empty for its first. */
    styleId: string;
    onStyle: (id: string) => void;
    modules: ModuleStates | null;
    details: DetailsRead;
    /** The site's look, in the editor; absent draws Classic. */
    look?: LookId;
    /** "Suggested for salons", when the one shown is suggested. */
    suggested: string | null;
    /** Choose it, or the editor's confirm: a separate press (board D5). */
    footer: (template: Template) => ReactNode;
    onClose: () => void;
    returnFocus: () => HTMLElement | null;
}) {
    const narrow = useNarrow();
    const [device, setDevice] = useState<Device>(() =>
        narrow ? "phone" : "desktop",
    );
    const [whose, setWhose] = useState<Whose>("yours");
    const all = groups.flatMap((g) => g.templates);
    const template = all.find((t) => t.id === templateId) ?? all.at(0);
    if (!template) return null;

    const own = details.status === "ready" ? details.details : null;
    const drawn = whose === "yours" ? own : null;
    const sampleName = getTemplate(template.id)?.sample?.name ?? template.name;
    const render =
        templateRender(
            template.id,
            styleId || undefined,
            "/",
            look,
            drawn ?? undefined,
        ) ??
        (drawn
            ? templateRender(template.id, styleId || undefined, "/", look)
            : null);
    const title = `Your site in ${template.name}`;
    const line = [template.description, usesLine(template)]
        .filter(Boolean)
        .join(" ");

    const picture = (
        <div className="grid gap-3 p-4">
            <TemplateThumbnail
                name={template.name}
                colourway={template.colourways?.[0]}
                image={templateThumbnail(template.id)}
            />
            <p role="status" className="text-xs text-muted-foreground">
                {couldntDrawWords(template.name)}
            </p>
        </div>
    );

    const page = render ? (
        <DrawOrElse
            key={`${template.id}:${styleId}:${whose}`}
            fallback={picture}
        >
            <TemplatePage
                render={render}
                scope="template-preview"
                look={look}
                marker={{ "data-template-preview": template.id }}
            />
        </DrawOrElse>
    ) : (
        picture
    );

    const header = (heading: ReactNode, description: ReactNode) => (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b px-4 py-3 pr-14">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    {heading}
                    {suggested ? (
                        <Badge variant="tag" size="sm">
                            {suggested}
                        </Badge>
                    ) : null}
                </div>
                {description}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {own ? (
                    <Segmented<Whose>
                        label="Drawn with"
                        value={whose}
                        onValueChange={setWhose}
                        options={[
                            { value: "yours", label: "Your details" },
                            { value: "sample", label: "The sample" },
                        ]}
                    />
                ) : null}
                <Segmented<Device>
                    label="Show it on"
                    value={device}
                    onValueChange={setDevice}
                    options={[
                        { value: "desktop", label: "Desk" },
                        { value: "phone", label: "Phone" },
                    ]}
                />
            </div>
        </div>
    );

    const list = (
        <nav
            aria-label="Templates"
            className={cn(
                "min-w-0",
                narrow
                    ? "flex gap-2 overflow-x-auto px-4 pb-3"
                    : "grid content-start gap-3 overflow-y-auto border-r p-3",
            )}
        >
            {groups.map((g) => (
                <div
                    key={g.key}
                    className={cn(
                        "min-w-0",
                        narrow ? "contents" : "grid gap-1",
                    )}
                >
                    {narrow ? null : (
                        <span className="px-2 text-xs font-medium text-muted-foreground">
                            {g.title}
                        </span>
                    )}
                    {g.templates.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            aria-pressed={t.id === template.id}
                            data-template-preview-pick={t.id}
                            onClick={() => {
                                onTemplate(t.id);
                                // Each template starts in its first colourway.
                                onStyle("");
                            }}
                            className={cn(
                                "flex min-h-11 min-w-0 shrink-0 flex-col items-start rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring",
                                t.id === template.id
                                    ? "bg-muted font-medium"
                                    : "hover:bg-muted/60 active:bg-accent-active",
                                narrow && "border",
                            )}
                        >
                            {t.name}
                            {narrow ? null : (
                                <span className="text-xs font-normal text-muted-foreground">
                                    {offReason(t, modules) ??
                                        usesLine(t) ??
                                        "For any business"}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            ))}
        </nav>
    );

    const side = (
        <div className="grid content-start gap-4 p-4">
            <ColourwayChoice
                template={template}
                value={styleId}
                onChange={onStyle}
            />
            {details.status === "failed" ? (
                <PartialRead
                    things="your details"
                    so={detailsUnreadWords(template.name)}
                    onRetry={details.retry}
                />
            ) : null}
            <WhatGoesInPanel
                template={template}
                details={own}
                modules={modules}
                businessName={own?.context.organizationName ?? null}
                sampleName={sampleName}
                loading={details.status === "loading"}
            />
        </div>
    );

    const body = (
        <div
            className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                narrow ? "" : "grid grid-cols-[13rem_minmax(0,1fr)_18rem]",
            )}
        >
            {narrow ? null : list}
            <div className="min-w-0 bg-muted p-3 sm:p-4">
                <div
                    // A picture of the page, not a visit.
                    inert
                    className="mx-auto overflow-hidden rounded-md border bg-background shadow-sm"
                    style={{ maxWidth: DEVICE_WIDTH[device] }}
                >
                    {device === "desktop" ? (
                        page
                    ) : (
                        <DeviceFrame title={`${title} at phone width`}>
                            {page}
                        </DeviceFrame>
                    )}
                </div>
            </div>
            {side}
            {narrow ? list : null}
        </div>
    );

    const foot = (
        <div className="space-y-2 border-t px-4 py-3">{footer(template)}</div>
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
                        <SheetTitle className="text-base">{title}</SheetTitle>,
                        <SheetDescription className="text-xs">
                            {line}
                        </SheetDescription>,
                    )}
                    {body}
                    {foot}
                </SheetContent>
            </Sheet>
        );
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-[calc(100dvh-4rem)] max-w-[min(80rem,calc(100vw-2rem))] flex-col gap-0 p-0"
                onCloseAutoFocus={backToOpener}
            >
                {header(
                    <DialogTitle className="text-base">{title}</DialogTitle>,
                    <DialogDescription className="text-xs">
                        {line}
                    </DialogDescription>,
                )}
                {body}
                {foot}
            </DialogContent>
        </Dialog>
    );
}
