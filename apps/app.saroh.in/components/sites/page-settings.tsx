"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useId, useState } from "react";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { ChoiceField, SHOW_HIDE } from "@/components/sites/choice-field";
import { FIELD_LABEL } from "@/components/sites/section-fields/constants";
import { updatePage } from "@/lib/sites/actions";
import { fixedAddress } from "@/lib/sites/page-menu";
import type { SitePage, UpdatePageInput } from "@/lib/sites/service";

/**
 * The open page's own settings, in the editor's page menu (G16): its title,
 * which is also its name in the menu; its address; "In the menu"; whether it
 * is on the site; and Delete. The Site Editor design's "Page top" puts the
 * title and the menu switch at the top of a page; here they sit with the
 * page's other settings, where the page menu already kept Rename, Hide and
 * Delete (00-universal §15: every control keeps a place).
 *
 * - A Book or Shop page's address is its route's (G14): shown as fixed
 *   ("/book — your booking page's path"), never as a field.
 * - A free-form page at an address one of the site's routes answers is
 *   flagged by the pre-publish check; the reason is said here, over the
 *   address, so "Change path" lands on the field that fixes it.
 * - Every rule about addresses is the API's. A refusal is shown in its
 *   words, and an address it offers instead can be taken in one press.
 *
 * Every change needs `site:update`. Without it the settings show read-only,
 * and a note says so.
 */
export function PageSettings({
    siteId,
    page,
    canUpdate,
    unseen,
    onChanged,
    onDelete,
}: {
    siteId: string;
    page: SitePage;
    canUpdate: boolean;
    /** Why visitors can't see this page at its address, if they can't. */
    unseen: string | null;
    /** A change went in: read the pages again. */
    onChanged: () => void;
    /** Ask before deleting this page. */
    onDelete: () => void;
}) {
    const id = useId();
    const fixed = fixedAddress(page);
    const [title, setTitle] = useState(page.title);
    const [path, setPath] = useState(page.path);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<{
        message: string;
        suggestion?: string;
    } | null>(null);
    const readOnly = !canUpdate;

    const changes: UpdatePageInput = {
        ...(title.trim() !== page.title && title.trim() !== ""
            ? { title: title.trim() }
            : {}),
        ...(fixed === null && path.trim() !== page.path && path.trim() !== ""
            ? { path: path.trim() }
            : {}),
    };
    const dirty = Object.keys(changes).length > 0;

    async function save(input: UpdatePageInput, done?: string) {
        setBusy(true);
        setRefusal(null);
        const res = await updatePage(siteId, page.id, input);
        setBusy(false);
        if (!res.ok) {
            if (input.title !== undefined || input.path !== undefined) {
                setRefusal({ message: res.error, suggestion: res.suggestion });
            } else {
                showError(res.error);
            }
            return;
        }
        if (done) showSuccess(done);
        onChanged();
    }

    return (
        <div className="grid gap-3 p-3">
            {readOnly ? (
                <ReadOnlyNote className="mb-0">
                    Your role can change this page&apos;s blocks but not its
                    title, path or place in the menu.
                </ReadOnlyNote>
            ) : null}

            <form
                className="grid gap-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (dirty) void save(changes, "Saved.");
                }}
            >
                <div className="grid gap-1.5">
                    <label htmlFor={`${id}-title`} className={FIELD_LABEL}>
                        Title
                    </label>
                    <Input
                        id={`${id}-title`}
                        value={title}
                        maxLength={200}
                        disabled={readOnly}
                        onChange={(e) => setTitle(e.target.value)}
                        aria-describedby={`${id}-title-note`}
                        className="h-8 text-xs"
                    />
                    <p
                        id={`${id}-title-note`}
                        className="text-xs text-muted-foreground"
                    >
                        Also its name in the menu.
                    </p>
                </div>

                <div className="grid gap-1.5">
                    {fixed !== null ? (
                        <span className={FIELD_LABEL}>Page path</span>
                    ) : (
                        <label htmlFor={`${id}-path`} className={FIELD_LABEL}>
                            Page path
                        </label>
                    )}
                    {fixed !== null ? (
                        <p className="text-xs leading-relaxed text-foreground">
                            <span className="font-mono">{fixed.path}</span>
                            {` — ${fixed.purpose}`}
                        </p>
                    ) : (
                        <>
                            {unseen ? (
                                <p className="text-xs leading-relaxed text-highlight">
                                    {unseen}
                                </p>
                            ) : null}
                            <Input
                                id={`${id}-path`}
                                value={path}
                                maxLength={200}
                                disabled={readOnly}
                                aria-invalid={unseen ? true : undefined}
                                onChange={(e) => setPath(e.target.value)}
                                className="h-8 font-mono text-xs"
                            />
                        </>
                    )}
                </div>

                {refusal ? (
                    <div
                        role="alert"
                        className="grid gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs leading-relaxed text-destructive"
                    >
                        <p>{refusal.message}</p>
                        {refusal.suggestion ? (
                            <Button
                                data-ph-mask=""
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 justify-self-start px-2 text-xs text-foreground"
                                onClick={() => {
                                    if (refusal.suggestion) {
                                        setPath(refusal.suggestion);
                                    }
                                    setRefusal(null);
                                }}
                            >
                                {`Use ${refusal.suggestion}`}
                            </Button>
                        ) : null}
                    </div>
                ) : null}

                {readOnly ? null : (
                    <Button
                        type="submit"
                        size="sm"
                        className="h-8 justify-self-start px-3 text-xs"
                        disabled={busy || !dirty}
                    >
                        {busy ? "Saving…" : "Save"}
                    </Button>
                )}
            </form>

            {/*
             * Home is what the site's own address serves: it is always on
             * the site and always first, so it has no switches and no
             * Delete — not disabled ones, none at all.
             */}
            {page.isHome ? null : (
                <>
                    <ChoiceField
                        label="In the menu"
                        options={SHOW_HIDE}
                        value={page.inMenu !== false}
                        disabled={readOnly || busy}
                        onChange={(on) =>
                            void save(
                                { inMenu: on },
                                on
                                    ? `${page.title} is back in the menu when you publish.`
                                    : `${page.title} leaves the menu when you publish. It still works if you link to it.`,
                            )
                        }
                        note="A page out of the menu still works if you link to it."
                    />
                    {/*
                     * No confirm, deliberately: hiding is the reversible half
                     * of the pair. Delete keeps its confirm; this is what to
                     * reach for instead.
                     */}
                    <ChoiceField
                        label="On the site"
                        options={SHOW_HIDE}
                        value={!page.hidden}
                        disabled={readOnly || busy}
                        onChange={(on) =>
                            void save(
                                { hidden: !on },
                                on
                                    ? `${page.title} is visible again. It goes back on the site when you publish.`
                                    : `${page.title} is hidden. It stays here and comes off the site when you publish.`,
                            )
                        }
                        note="Hidden pages stay here and come off the site when you publish."
                    />
                    {readOnly ? null : (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 justify-self-start px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={busy}
                            onClick={onDelete}
                        >
                            Delete page…
                        </Button>
                    )}
                </>
            )}
        </div>
    );
}
