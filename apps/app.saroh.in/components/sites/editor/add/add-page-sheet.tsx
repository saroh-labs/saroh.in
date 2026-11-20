"use client";

import { Button } from "@saroh/ui/button";
import { RadioCards } from "@saroh/ui/choice-group";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { Switch } from "@saroh/ui/switch";
import { useId, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { slugify } from "@/lib/products/editor-sections";
import { createPage, duplicatePage } from "@/lib/sites/actions";
import type { ModulePageOffer } from "@/lib/sites/page-menu";
import type {
    CreatePageInput,
    ModulePageKind,
    SitePage,
} from "@/lib/sites/service";

/** What a new page starts from: blank, one ready page, or a copy. */
export type PageStart = "blank" | "copy" | ModulePageKind;

/** A refusal in the API's words, and the link it offers instead. */
interface Refusal {
    message: string;
    suggestion?: string;
}

/**
 * Add a page (U46e, `fix/WXBAddPage`): its name and link, what it starts
 * from, and whether it shows in the menu. Opens here as a draft page.
 * Today's Add a page in the page picker (`AddPagePanel`) stays as it is.
 *
 * The API decides whether a link is free; a refusal is said in its words
 * and, where it offers another link, the link is put in the field to see
 * before adding (as the picker's panel does).
 */
export function AddPageSheet({
    open,
    siteId,
    address,
    offers,
    page,
    start: initialStart,
    onClose,
    onAdded,
}: {
    open: boolean;
    siteId: string;
    /** "gulmohar.saroh.app", or null before the site has one. */
    address: string | null;
    /** The ready pages this site can add (`addPageOffers`). */
    offers: ModulePageOffer[];
    /** The open page, for "A copy". */
    page: SitePage | undefined;
    start: PageStart;
    onClose: () => void;
    /** A page went in: open it. */
    onAdded: (page: SitePage) => void;
}) {
    const [start, setStart] = useState<PageStart>(initialStart);
    const [title, setTitle] = useState("");
    const [path, setPath] = useState<string | null>(null);
    const [inMenu, setInMenu] = useState(true);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<Refusal | null>(null);
    const [missing, setMissing] = useState(false);
    const menuId = useId();

    const offer = offers.find((o) => o.kind === start);
    // The link follows the name until it is typed in.
    const link = path ?? (title.trim() ? `/${slugify(title)}` : "");

    const options = [
        { value: "blank" as const, label: "Blank", note: "An empty page" },
        ...offers.map((o) => ({
            value: o.kind,
            label: `A ready page: ${o.label}`,
            note: o.what,
        })),
        ...(page
            ? [
                  {
                      value: "copy" as const,
                      label: "A copy",
                      note: `Of ${page.title}, hidden and out of the menu`,
                  },
              ]
            : []),
    ];

    async function add() {
        setRefusal(null);
        let res;
        if (start === "copy") {
            if (!page) return;
            res = await runAction(() => duplicatePage(siteId, page.id), {
                setBusy,
            });
        } else {
            let input: CreatePageInput;
            if (start === "blank") {
                const t = title.trim();
                if (t === "" || link.trim() === "") {
                    setMissing(true);
                    return;
                }
                input = { title: t, path: link.trim(), inMenu };
            } else {
                input = {
                    kind: start,
                    ...(title.trim() ? { title: title.trim() } : {}),
                    // Only once the API offered another link for it.
                    ...(path ? { path } : {}),
                    inMenu,
                };
            }
            res = await runAction(() => createPage(siteId, input), {
                setBusy,
            });
        }
        if (!res) return;
        if (res.ok) {
            onAdded(res.data);
            return;
        }
        setRefusal({ message: res.error, suggestion: res.suggestion });
    }

    return (
        <FormSheet
            open={open}
            title="Add a page"
            description="Opens here as a draft page. Nothing is live until you publish."
            pending={busy}
            saveLabel="Add page"
            savingLabel="Adding…"
            bottomOnPhone
            dirty
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void add();
            }}
        >
            <div className="grid gap-5">
                {start === "copy" ? null : (
                    <>
                        <Field
                            label="Page name"
                            optional={start !== "blank"}
                            error={
                                missing && start === "blank" && !title.trim()
                                    ? "Give the page a name."
                                    : undefined
                            }
                        >
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={offer?.label ?? "Our team"}
                            />
                        </Field>
                        <Field
                            holdsData
                            label="Page link"
                            hint={
                                start === "blank"
                                    ? "Made from the name. Change it if you like."
                                    : `${offer?.path ?? ""} · this page's own link`
                            }
                        >
                            <div className="flex min-w-0 items-center gap-1">
                                {address ? (
                                    <span className="shrink-0 truncate text-sm text-muted-foreground">
                                        {address}
                                    </span>
                                ) : null}
                                <Input
                                    className="min-w-0 font-mono"
                                    value={
                                        start === "blank"
                                            ? link
                                            : (path ?? offer?.path ?? "")
                                    }
                                    disabled={start !== "blank"}
                                    onChange={(e) => setPath(e.target.value)}
                                    placeholder="/trials"
                                />
                            </div>
                        </Field>
                    </>
                )}

                <RadioCards
                    label="Start from"
                    options={options}
                    value={start}
                    onChange={(v) => {
                        setStart(v);
                        setPath(null);
                        setRefusal(null);
                    }}
                />

                {start === "copy" ? null : (
                    <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={menuId}>Show in the menu</Label>
                        <Switch
                            id={menuId}
                            checked={inMenu}
                            onCheckedChange={setInMenu}
                        />
                    </div>
                )}

                {refusal ? (
                    <Notice
                        tone="error"
                        action={
                            refusal.suggestion && start !== "copy" ? (
                                <Button
                                    data-ph-mask=""
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => {
                                        // Put in the field to see first;
                                        // Add page then sends it.
                                        setPath(refusal.suggestion ?? null);
                                        setRefusal(null);
                                    }}
                                >
                                    Use {refusal.suggestion}
                                </Button>
                            ) : undefined
                        }
                    >
                        {refusal.message}
                    </Notice>
                ) : null}
            </div>
        </FormSheet>
    );
}
