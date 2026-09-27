"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Lock, PanelBottom, PanelTop } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { ReadOnlyNote } from "@/components/shared/read-only-note";

/** The lock's reason, said beside the controls it disables (G6). */
export const FIXED_LOCK = "On every page — can't be removed or moved";

/** What the inspector edits about the header and footer (G6). */
export interface FixedBlockText {
    /** Whether this person holds `site:update`; without it, read-only. */
    canUpdate: boolean;
    name: string;
    setName: (next: string) => void;
    nameError: string | null;
    /** The footer is more than one plain line: Website settings edits it. */
    footerRich: boolean;
    footerText: string;
    setFooterText: (next: string) => void;
}

/** One labelled text field with the note under it, as the design draws it. */
function TextField({
    label,
    value,
    onChange,
    disabled,
    note,
    error,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    disabled: boolean;
    note: string;
    error?: string | null;
}) {
    const id = useId();
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id} className="text-xs font-medium">
                {label}
            </Label>
            <Input
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                maxLength={120}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${id}-note`}
            />
            <p
                id={`${id}-note`}
                className={
                    error
                        ? "text-[0.6875rem] leading-[1.45] text-destructive"
                        : "text-[0.6875rem] leading-[1.45] text-muted-foreground"
                }
            >
                {error ?? note}
            </p>
        </div>
    );
}

/**
 * The header or footer, selected (#336, #338; text since round 2, G6).
 *
 * They are on every page, so the inspector says that first. Their text is
 * edited here: the header's name and the footer's line, which is what the
 * live header and footer draw (G17). Where they sit is not a page's choice,
 * so Move and Remove are here but disabled, with the reason written beside
 * them — absent, they would leave a merchant hunting for a Remove that was
 * never going to exist; in a tooltip, a phone would never show it.
 *
 * Without `site:update` both fields are read-only and a note says who can
 * change them. The gate is the capability the API checks, never a role name.
 */
export function FixedBlockInspector({
    part,
    siteId,
    text,
}: {
    part: "header" | "footer";
    siteId: string;
    text: FixedBlockText;
}) {
    const Icon = part === "header" ? PanelTop : PanelBottom;
    const readOnly = !text.canUpdate;
    const settings = (
        <Button
            asChild
            variant="outline"
            size="sm"
            className="justify-self-start"
        >
            {/* A new tab, for the same reason as the Services link. */}
            <Link
                href={`/sites/${siteId}/settings`}
                target="_blank"
                rel="noopener"
            >
                Open Website settings
            </Link>
        </Button>
    );

    return (
        <div className="space-y-4 p-4">
            <div className="space-y-1.5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Icon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    {part === "header" ? "Header" : "Footer"}
                    <Badge
                        variant="neutral"
                        className="uppercase tracking-[0.06em]"
                    >
                        Fixed
                    </Badge>
                </h2>
                <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                    On every page of this site. Its text is edited here; where
                    it sits is not a per-page choice.
                </p>
            </div>

            {readOnly ? (
                <ReadOnlyNote className="mb-0">
                    Your role can change this page&apos;s blocks but not the
                    site&apos;s name or footer.
                </ReadOnlyNote>
            ) : null}

            {part === "header" ? (
                <>
                    <TextField
                        label="Site name"
                        value={text.name}
                        onChange={text.setName}
                        disabled={readOnly}
                        note="In the header of every page, and in search results unless you set a search title."
                        error={readOnly ? null : text.nameError}
                    />
                    {/*
                     * The menu is not edited here (#206): it keeps its home in
                     * Website settings, and the way there stays.
                     */}
                    <div className="grid gap-2 border-t pt-3">
                        <p className="text-[0.8125rem] leading-relaxed">
                            The menu lists the pages you add to it. It&apos;s
                            changed in Website settings.
                        </p>
                        {settings}
                    </div>
                </>
            ) : text.footerRich ? (
                <div className="grid gap-2">
                    <p className="text-[0.8125rem] leading-relaxed">
                        Your footer is more than one line of plain text, so
                        it&apos;s changed in Website settings. “Runs on Saroh”
                        follows it on your site.
                    </p>
                    {settings}
                </div>
            ) : (
                <>
                    <TextField
                        label="Footer line"
                        value={text.footerText}
                        onChange={text.setFooterText}
                        disabled={readOnly}
                        note={
                            text.footerText.trim() === ""
                                ? "Nothing is written at the foot of this site yet, so visitors see the site's name and “Runs on Saroh”."
                                : "“Runs on Saroh” follows it."
                        }
                    />
                    <div className="grid gap-2 border-t pt-3">
                        <p className="text-[0.8125rem] leading-relaxed">
                            For links or more than one line, write the footer in
                            Website settings.
                        </p>
                        {settings}
                    </div>
                </>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t pt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled
                    aria-label="Move up"
                    aria-describedby="fixed-lock-reason"
                >
                    ↑
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled
                    aria-label="Move down"
                    aria-describedby="fixed-lock-reason"
                >
                    ↓
                </Button>
                <p
                    id="fixed-lock-reason"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-xs leading-relaxed text-muted-foreground"
                >
                    <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                    {FIXED_LOCK}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 px-3 text-xs"
                    disabled
                    aria-describedby="fixed-lock-reason"
                >
                    Remove
                </Button>
            </div>
        </div>
    );
}
