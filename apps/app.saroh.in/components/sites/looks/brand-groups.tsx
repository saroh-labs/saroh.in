"use client";

import { Button } from "@saroh/ui/button";
import { ChoiceGroup } from "@saroh/ui/choice-group";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Droplet } from "lucide-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useId, useState, useTransition } from "react";

import { SiteIconImage } from "@/components/sites/site-icon/site-icon-summary";
import { runAction } from "@/lib/api/run-action";
import { colourName } from "@/lib/share-item/share";
import type { SiteIconSaved } from "@/lib/sites/service";
import { shownSiteIcon, SITE_ICON_LINE } from "@/lib/sites/site-icon";
import type {
    SiteStyle,
    SiteStyleOptions,
    StyleColourway,
} from "@/lib/sites/style";
import { BrandColourSheet } from "./brand-colour-sheet";

// Loaded when Change is first pressed: the sheet brings the media library.
const SiteIconSheet = dynamic(() =>
    import("@/components/sites/site-icon/site-icon-sheet").then(
        (m) => m.SiteIconSheet,
    ),
);

/** One of Brand's groups: a heading, an optional quiet line, an action. */
export function BrandGroup({
    title,
    note,
    action,
    children,
    hideTitle = false,
}: {
    title: string;
    note?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    /** On a phone the strip names the group. */
    hideTitle?: boolean;
}) {
    const id = useId();
    return (
        <section
            aria-labelledby={id}
            data-brand-group={title}
            className="space-y-2"
        >
            <div
                className={cn(
                    "flex min-w-0 items-baseline gap-2",
                    hideTitle && "sr-only",
                )}
            >
                <h3 id={id} className="text-sm font-semibold">
                    {title}
                </h3>
                {note ? (
                    <span className="truncate text-xs text-muted-foreground">
                        {note}
                    </span>
                ) : null}
                {action ? (
                    <span className="ml-auto shrink-0">{action}</span>
                ) : null}
            </div>
            {children}
        </section>
    );
}

const OWN = "own";

/**
 * Colours' head (`WXBBrand`): the template's colourways and "Your own" as
 * chips, then "Colours from my brand colour". Choosing "Your own" leaves
 * a colourway for the six rows' colours; the six rows open from "Edit each
 * colour" (the panel draws them). A paid colourway is refused in place by
 * `onColourway` returning false.
 */
export function ColourwayChips({
    style,
    colourways,
    current,
    paidMark,
    onColourway,
    onOwn,
}: {
    style: SiteStyle;
    colourways: StyleColourway[];
    current: StyleColourway | undefined;
    paidMark: (id: string) => ReactNode;
    onColourway: (cw: StyleColourway) => void;
    onOwn: () => void;
}) {
    if (colourways.length === 0) return null;
    const own = style.brandColour
        ? `Your own · from your ${colourName(style.brandColour).toLowerCase()}`
        : "Your own";
    return (
        <ChoiceGroup
            label="Colours"
            className="flex flex-wrap gap-1.5"
            value={current?.id ?? OWN}
            onChange={(id) => {
                if (id === OWN) return onOwn();
                const cw = colourways.find((c) => c.id === id);
                if (cw) onColourway(cw);
            }}
            choices={[
                ...colourways.map((cw) => ({
                    value: cw.id,
                    data: { "data-colourway": cw.id },
                    label: (
                        <>
                            <Chips hsls={cw.chips} />
                            {cw.name}
                            {paidMark(cw.id)}
                        </>
                    ),
                })),
                { value: OWN, label: own, data: { "data-colourway": OWN } },
            ]}
            itemClassName={(active) =>
                cn(
                    "flex min-h-9 items-center gap-2 rounded-full border px-3 py-1 text-[0.8125rem] coarse:min-h-11",
                    active
                        ? "border-foreground ring-1 ring-foreground"
                        : "border-border hover:bg-muted",
                )
            }
        />
    );
}

function Chips({ hsls }: { hsls: string[] }) {
    return (
        <span
            aria-hidden
            className="flex shrink-0 overflow-hidden rounded-full border"
        >
            {hsls.map((hsl, i) => (
                <span
                    key={i}
                    className="h-4 w-2"
                    style={{ background: `hsl(${hsl})` }}
                />
            ))}
        </span>
    );
}

/** "Colours from my brand colour" and its sheet (`WXBBrandColour`). */
export function BrandColourButton({
    style,
    onChange,
}: {
    style: SiteStyle;
    onChange: (next: SiteStyle) => void;
}) {
    const [open, setOpen] = useState(false);
    // Each opening starts from what the site has.
    const [opened, setOpened] = useState(0);
    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                data-brand-colour-open=""
                onClick={() => {
                    setOpened((n) => n + 1);
                    setOpen(true);
                }}
            >
                <Droplet aria-hidden />
                Colours from my brand colour
            </Button>
            {opened > 0 ? (
                <BrandColourSheet
                    key={opened}
                    open={open}
                    style={style}
                    onClose={() => setOpen(false)}
                    onUse={onChange}
                />
            ) : null}
        </>
    );
}

/** What the Logo and tab icon group needs: the site and its icon now. */
export interface SiteIconSource {
    siteId: string;
    siteName: string;
    saved: SiteIconSaved;
}

/**
 * Logo and tab icon (`WXBBrand`): the business logo and the tab icon the
 * site shows, with Change opening the same sheet as Settings › Search and
 * sharing › Site icon. Light and dark logo versions wait for their own
 * unit and are not drawn.
 */
export function LogoGroup({
    icon,
    style,
    options,
    hideTitle,
}: {
    icon: SiteIconSource;
    style: SiteStyle;
    options: SiteStyleOptions;
    hideTitle?: boolean;
}) {
    const [saved, setSaved] = useState(icon.saved);
    const [open, setOpen] = useState(false);
    const [opened, setOpened] = useState(0);
    const [pending, start] = useTransition();
    const site = { name: icon.siteName, style, styleOptions: options };
    const shown = shownSiteIcon(site, saved.own?.url, saved.businessLogoUrl);

    function save(mediaId: string | null) {
        start(async () => {
            const res = await runAction(async () => {
                // Imported on save, as the sheet is on open.
                const { saveSiteIcon } = await import("@/lib/sites/actions");
                return saveSiteIcon(icon.siteId, mediaId);
            });
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setSaved(res.data.icon);
            setOpen(false);
            showSuccess(
                mediaId
                    ? "Tab icon saved. Publish to make it public."
                    : "Tab icon removed. Publish to make it public.",
            );
        });
    }

    return (
        <BrandGroup title="Logo and tab icon" hideTitle={hideTitle}>
            <div className="flex items-center gap-3 rounded-[10px] border bg-card p-2.5">
                <SiteIconImage src={shown.src} className="size-9 rounded-md" />
                <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
                    <b className="block truncate font-semibold">
                        {icon.siteName}
                    </b>
                    <span
                        className="text-xs text-muted-foreground"
                        data-icon-source={shown.source}
                    >
                        {SITE_ICON_LINE[shown.source]}
                    </span>
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Change the tab icon"
                    onClick={() => {
                        setOpened((n) => n + 1);
                        setOpen(true);
                    }}
                >
                    Change
                </Button>
            </div>
            {opened > 0 ? (
                <SiteIconSheet
                    key={opened}
                    site={site}
                    saved={saved}
                    open={open}
                    pending={pending}
                    onClose={() => setOpen(false)}
                    onSave={save}
                />
            ) : null}
        </BrandGroup>
    );
}
