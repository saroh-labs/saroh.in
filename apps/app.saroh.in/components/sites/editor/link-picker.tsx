"use client";

import {
    ctaActionSchema,
    ctaHref,
    isSafeHref,
    sectionFrameOf,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { CheckRow } from "@saroh/ui/check-row";
import { RadioCards } from "@saroh/ui/choice-group";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId, useState } from "react";

import type { ServiceOption } from "@/components/sites/section-fields";
import type { Section, SitePage } from "@/lib/sites/service";

import { sectionTitle } from "./editor-constants";

/** What a link goes to (U47d, `fix/WXKText`, `fix/WXNText`). No Short link (C5). */
export type LinkKind = "page" | "service" | "whatsapp" | "call" | "url";

/** A page of this site, or a section of one, as the picker lists it. */
export interface LinkPlace {
    label: string;
    href: string;
}

/** A link as the picker hands it back. */
export interface LinkChoice {
    href: string;
    newTab: boolean;
}

/**
 * The address a choice makes, or null when it is not one this site may
 * draw. Every address passes the block contract's own `isSafeHref` (the
 * schemes `sanitize.ts` keeps: http, https, mailto, tel, and paths), so
 * the picker never offers what the API would drop at publish.
 */
export function linkTarget(kind: LinkKind, value: string): string | null {
    const v = value.trim();
    if (!v) return null;
    let href: string | null = null;
    switch (kind) {
        case "page":
            // Only the site's own paths and anchors, from the list.
            href = v.startsWith("/") && !v.startsWith("//") ? v : null;
            break;
        case "service":
            href = `/book?service=${encodeURIComponent(v)}`;
            break;
        case "call":
        case "whatsapp": {
            const action = ctaActionSchema.safeParse({ kind, number: v });
            href = action.success
                ? ctaHref(action.data, () => undefined)
                : null;
            break;
        }
        case "url":
            href = /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v) ? v : null;
            break;
    }
    return href !== null && isSafeHref(href) ? href : null;
}

/** Which kind an existing link is, and what its picker field holds. */
export function linkKindOf(href: string): { kind: LinkKind; value: string } {
    if (href.startsWith("tel:")) return { kind: "call", value: href.slice(4) };
    const wa = /^https:\/\/wa\.me\/(\d+)/.exec(href);
    if (wa) return { kind: "whatsapp", value: `+${wa[1]}` };
    const service = /^\/book\?service=([^&#]+)/.exec(href);
    if (service?.[1]) {
        return { kind: "service", value: decodeURIComponent(service[1]) };
    }
    if (href.startsWith("/")) return { kind: "page", value: href };
    return { kind: "url", value: href };
}

/**
 * The places a link can go on this site: each page that will be
 * published, and the sections of the open page that have a link name.
 */
export function linkPlaces(
    pages: readonly SitePage[],
    pageId: string,
    sections: readonly Section[],
): LinkPlace[] {
    const shown = pages.filter((p) => !p.hidden);
    const open = shown.find((p) => p.id === pageId);
    const anchors = open
        ? sections.flatMap((s) => {
              const anchor = sectionFrameOf(s.content).anchor;
              return anchor && !s.hidden
                  ? [
                        {
                            label: sectionTitle(s),
                            href: `${open.path}#${anchor}`,
                        },
                    ]
                  : [];
          })
        : [];
    return [
        ...shown.map((p) => ({ label: p.title, href: p.path })),
        ...anchors,
    ];
}

const KINDS: { value: LinkKind; label: string; note?: string }[] = [
    { value: "page", label: "A page on this site" },
    {
        value: "service",
        label: "A service",
        note: "Opens it on your booking page",
    },
    {
        value: "whatsapp",
        label: "WhatsApp",
        note: "Opens a chat with the number",
    },
    { value: "call", label: "Phone call", note: "Calls the number" },
    { value: "url", label: "Outside link", note: "Any web address" },
];

/**
 * The link picker (U47d): what the chosen words link to. A page of this
 * site or one of its sections, a service, WhatsApp or a call to the
 * business number, or an outside address; Open in a new tab; Remove and
 * Apply. Apply stays off until the choice makes an address the site may
 * draw (`linkTarget`).
 */
export function LinkPicker({
    words,
    places,
    services = [],
    businessPhone = null,
    current = null,
    onApply,
    onRemove,
}: {
    /** The words being linked, for the heading. */
    words: string;
    places: readonly LinkPlace[];
    services?: readonly ServiceOption[];
    /** The business's number, for WhatsApp and Phone call (DEC-128). */
    businessPhone?: string | null;
    /** The link the words have now, to change or remove. */
    current?: LinkChoice | null;
    onApply: (link: LinkChoice) => void;
    onRemove?: () => void;
}) {
    const id = useId();
    const start = current ? linkKindOf(current.href) : null;
    const [kind, setKind] = useState<LinkKind>(start?.kind ?? "page");
    const [values, setValues] = useState<Partial<Record<LinkKind, string>>>(
        () => ({
            call: businessPhone ?? "",
            whatsapp: businessPhone ?? "",
            ...(start ? { [start.kind]: start.value } : {}),
        }),
    );
    const [newTab, setNewTab] = useState(current?.newTab ?? false);
    const [find, setFind] = useState("");
    const value = values[kind] ?? "";
    const set = (next: string) => setValues((v) => ({ ...v, [kind]: next }));
    const href = linkTarget(kind, value);
    const shown = places.filter((p) =>
        `${p.label} ${p.href}`
            .toLowerCase()
            .includes(find.trim().toLowerCase()),
    );
    const live = services.filter((s) => s.status === "ACTIVE");

    return (
        <div data-link-picker="" className="grid gap-3">
            <p
                id={`${id}-title`}
                className="text-[0.8125rem] font-medium text-muted-foreground"
            >
                {`Link “${words}” to`}
            </p>
            <RadioCards
                labelledBy={`${id}-title`}
                options={KINDS.map((k) => ({
                    value: k.value,
                    label: k.label,
                    note: k.note,
                }))}
                value={kind}
                onChange={setKind}
            />
            {kind === "page" ? (
                <div className="grid gap-2">
                    <Input
                        aria-label="Find a page or a section"
                        placeholder="Find a page or a section"
                        value={find}
                        onChange={(e) => setFind(e.target.value)}
                    />
                    <RadioCards
                        label="Pages and sections"
                        options={shown.map((p) => ({
                            value: p.href,
                            label: p.label,
                            aside: p.href,
                        }))}
                        value={value || null}
                        onChange={set}
                    />
                </div>
            ) : kind === "service" ? (
                live.length > 0 ? (
                    <RadioCards
                        label="Services"
                        options={live.map((s) => ({
                            value: s.id,
                            label: s.name,
                        }))}
                        value={value || null}
                        onChange={set}
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No services to link to yet.
                    </p>
                )
            ) : (
                <div className="grid gap-1.5">
                    <Label htmlFor={`${id}-value`}>
                        {kind === "url" ? "Web address" : "Phone number"}
                    </Label>
                    <Input
                        id={`${id}-value`}
                        type={kind === "url" ? "url" : "tel"}
                        inputMode={kind === "url" ? "url" : "tel"}
                        placeholder={kind === "url" ? "https://" : undefined}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        aria-invalid={value.trim() !== "" && href === null}
                        aria-describedby={`${id}-problem`}
                    />
                    {value.trim() !== "" && href === null ? (
                        <p
                            id={`${id}-problem`}
                            className="text-[0.8125rem] text-destructive"
                        >
                            {kind === "url"
                                ? "Enter a full web address, starting with https://"
                                : "Enter a phone number with digits only"}
                        </p>
                    ) : null}
                </div>
            )}
            <CheckRow checked={newTab} onChange={setNewTab}>
                Open in a new tab
            </CheckRow>
            <div className="flex justify-end gap-2">
                {current && onRemove ? (
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-11"
                        onClick={onRemove}
                    >
                        Remove
                    </Button>
                ) : null}
                <Button
                    type="button"
                    className="h-11"
                    disabled={href === null}
                    onClick={() => {
                        if (href !== null) onApply({ href, newTab });
                    }}
                >
                    Apply
                </Button>
            </div>
        </div>
    );
}
