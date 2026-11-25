"use client";

import { Button } from "@saroh/ui/button";
import { RadioCards } from "@saroh/ui/choice-group";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { IntentLink } from "@saroh/ui/intent-link";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { Switch } from "@saroh/ui/switch";
import { Textarea } from "@saroh/ui/textarea";
import { showSuccess } from "@saroh/ui/toast";
import { useLeaveGuard } from "@saroh/ui/use-leave-guard";
import { useId, useState } from "react";

import { MediaPicker } from "@/components/shared/fields/media-picker";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { ShareImageThumb } from "@/components/sites/search-sharing/share-image-thumb";
import { SAVE_LINES } from "@/components/sites/shell/save-footer";
import { runAction } from "@/lib/api/run-action";
import { deletePage, updatePage } from "@/lib/sites/actions";
import { fixedAddress } from "@/lib/sites/page-menu";
import type { SitePage } from "@/lib/sites/service";

import { GooglePreview, SharePreview } from "./page-previews";
import type { PageDraft } from "./page-words";
import {
    draftOf,
    GOOGLE_TEXT_GUIDE,
    GOOGLE_TITLE_GUIDE,
    lengthHint,
    lostWords,
    pageChanges,
    pageLink,
} from "./page-words";

export interface PageSheetProps {
    siteId: string;
    /** The page open in the sheet; null closes it. */
    page: SitePage | null;
    /** The business's web address (DEC-230); null before it has one. */
    host: string | null;
    siteName: string;
    /**
     * The site's own share image, which stands in for a page without one;
     * undefined where it isn't read (the editor).
     */
    siteImageUrl?: string | null;
    /** The site is live: a changed link leaves the old one forwarding. */
    live: boolean;
    /** `site:update`. Without it the sheet reads, and says so. */
    canUpdate: boolean;
    /** Why visitors can't see the page at its link, if they can't. */
    unseen?: string | null;
    /** The page has changes waiting for Publish: the foot says so. */
    waiting?: boolean;
    /** "Open this page in the editor"; left out inside the editor. */
    editorHref?: string | null;
    onClose: () => void;
    /** A change went in: read the pages again. */
    onSaved: () => void;
    /** The page was deleted. */
    onDeleted: (page: SitePage) => void;
    /** The tab's business, on a React Query screen (DEC-259). */
    orgId?: string;
}

/**
 * A page's settings (plan 2026-11-18-001 U5; WXPPageSheet, final
 * WXKPageSettings): its title, its link, its title and text on Google, its
 * share image, the menu, who can see it and "Show on Google". One sheet,
 * opened from Website › Pages and from the editor's page menu, so a change
 * in one is the change in the other.
 *
 * Everything waits for Publish, said in the foot (RULES §2). A link change
 * says the old link forwards (KTD-3) and can be undone before Save. A save
 * that fails keeps every word and turns Save into Try again; leaving the
 * screen with unsaved changes asks once (WXSStates). Every rule about links
 * is the API's: a refusal is shown in its words, with its suggestion one
 * press away.
 */
export function PageSheet(props: PageSheetProps) {
    // Fresh fields for each page opened.
    return props.page ? (
        <OpenPageSheet key={props.page.id} {...props} page={props.page} />
    ) : null;
}

function OpenPageSheet({
    siteId,
    page,
    host,
    siteName,
    siteImageUrl,
    live,
    canUpdate,
    unseen = null,
    waiting = false,
    editorHref = null,
    onClose,
    onSaved,
    onDeleted,
    orgId,
}: PageSheetProps & { page: SitePage }) {
    const id = useId();
    const readOnly = !canUpdate;
    const fixed = fixedAddress(page);
    const [draft, setDraft] = useState<PageDraft>(() => draftOf(page));
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);
    const [refusal, setRefusal] = useState<{
        message: string;
        suggestion?: string;
    } | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const changes = pageChanges(page, draft);
    const dirty = !readOnly && Object.keys(changes).length > 0;
    const guard = useLeaveGuard({ dirty, lost: lostWords(changes) });
    const set = <K extends keyof PageDraft>(key: K, value: PageDraft[K]) => {
        setFailed(null);
        if (key === "path" || key === "title") setRefusal(null);
        setDraft((d) => ({ ...d, [key]: value }));
    };

    async function save() {
        if (!dirty) return onClose();
        setFailed(null);
        setRefusal(null);
        const res = await runAction(
            () => updatePage(siteId, page.id, changes, orgId),
            // Said in the sheet, beside Try again, not in a toast.
            { setBusy, quiet: true, onUnreached: setFailed },
        );
        if (!res) return;
        if (!res.ok) {
            // A link someone has, or a route owns: said at the link, with
            // the one the API offers instead.
            if (res.suggestion) {
                return setRefusal({
                    message: res.error,
                    suggestion: res.suggestion,
                });
            }
            return setFailed(res.error);
        }
        guard.release();
        showSuccess("Saved. It goes live when you publish.");
        onSaved();
        onClose();
    }

    async function remove() {
        const res = await deletePage(siteId, page.id, orgId);
        if (!res.ok) return { ok: false, error: res.error };
        guard.release();
        showSuccess("Page deleted.");
        onDeleted(page);
    }

    const shareImage = draft.shareImageUrl ?? siteImageUrl ?? null;
    const googleTitle = draft.seoTitle.trim() || draft.title.trim();
    const googleText = draft.seoDescription.trim() || null;
    const moved = changes.path !== undefined;

    return (
        <>
            <FormSheet
                open
                wide
                title="Page settings"
                description={page.title}
                pending={busy}
                dirty={dirty}
                onClose={onClose}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!readOnly) void save();
                }}
                doneOnly={readOnly}
                doneLabel="Close"
                saveLabel={failed ? "Try again" : "Save"}
                footNote={
                    readOnly ? null : (
                        <div className="grid gap-2">
                            {failed ? (
                                <Notice tone="error" role="alert">
                                    {`Didn't save. ${failed} Your words are still here.`}
                                </Notice>
                            ) : null}
                            {/* Nothing until there is something waiting:
                                a fresh sheet has saved nothing. A save
                                closes the sheet and says so in a toast. */}
                            {waiting ? (
                                <p
                                    data-save-footer="changed-waits"
                                    className="text-sm text-muted-foreground"
                                >
                                    {SAVE_LINES["changed-waits"]}
                                </p>
                            ) : null}
                        </div>
                    )
                }
                extra={
                    readOnly || page.isHome ? undefined : (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setDeleteOpen(true)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                            Delete page…
                        </Button>
                    )
                }
                fieldsClassName="gap-5"
            >
                {readOnly ? <ReadOnlyNote className="mb-0" /> : null}

                <Field label="Title" hint="Also its name in the menu.">
                    <Input
                        value={draft.title}
                        maxLength={200}
                        disabled={readOnly}
                        onChange={(e) => set("title", e.target.value)}
                    />
                </Field>

                {fixed ? (
                    <Field label="Page link" group>
                        <p className="text-sm">
                            <span className="font-mono">
                                {pageLink(host, fixed.path)}
                            </span>
                            {` · ${fixed.purpose}`}
                        </p>
                    </Field>
                ) : (
                    <Field
                        label="Page link"
                        htmlFor={`${id}-link`}
                        hint={unseen ?? undefined}
                    >
                        <div className="grid gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                                {host ? (
                                    <span
                                        data-ph-mask=""
                                        className="shrink-0 font-mono text-sm text-muted-foreground"
                                    >
                                        {host}
                                    </span>
                                ) : null}
                                <Input
                                    id={`${id}-link`}
                                    value={draft.path}
                                    maxLength={200}
                                    disabled={readOnly}
                                    aria-invalid={
                                        refusal || unseen ? true : undefined
                                    }
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    onChange={(e) =>
                                        set("path", e.target.value)
                                    }
                                    className="min-w-0 font-mono"
                                />
                            </div>
                            {refusal ? (
                                <Notice tone="error">
                                    <div className="grid gap-1.5">
                                        <p>{refusal.message}</p>
                                        {refusal.suggestion ? (
                                            <Button
                                                data-ph-mask=""
                                                type="button"
                                                variant="outline"
                                                size="xs"
                                                className="justify-self-start text-foreground"
                                                onClick={() =>
                                                    set(
                                                        "path",
                                                        refusal.suggestion ??
                                                            draft.path,
                                                    )
                                                }
                                            >
                                                {`Use ${refusal.suggestion}`}
                                            </Button>
                                        ) : null}
                                    </div>
                                </Notice>
                            ) : moved ? (
                                <p
                                    data-link-moved=""
                                    className="text-sm text-muted-foreground"
                                >
                                    {live && !page.hidden ? (
                                        <>
                                            The old link{" "}
                                            <span className="font-mono text-foreground">
                                                {page.path}
                                            </span>{" "}
                                            forwards here, so links already
                                            shared on WhatsApp and Instagram
                                            keep working.{" "}
                                        </>
                                    ) : null}
                                    The new link goes live when you publish.{" "}
                                    <Button
                                        type="button"
                                        variant="link"
                                        size="inline"
                                        onClick={() => set("path", page.path)}
                                    >
                                        Undo
                                    </Button>
                                </p>
                            ) : null}
                        </div>
                    </Field>
                )}

                <section
                    aria-labelledby={`${id}-google`}
                    className="grid gap-4"
                >
                    <h3 id={`${id}-google`} className="text-sm font-semibold">
                        On Google
                    </h3>
                    <Field
                        holdsData={false}
                        label="Title on Google"
                        hint={lengthHint(
                            draft.seoTitle.length,
                            GOOGLE_TITLE_GUIDE,
                        )}
                    >
                        <Input
                            value={draft.seoTitle}
                            maxLength={70}
                            disabled={readOnly}
                            placeholder={draft.title}
                            onChange={(e) => set("seoTitle", e.target.value)}
                        />
                    </Field>
                    <Field
                        label="Text on Google"
                        hint={lengthHint(
                            draft.seoDescription.length,
                            GOOGLE_TEXT_GUIDE,
                        )}
                    >
                        <Textarea
                            value={draft.seoDescription}
                            rows={3}
                            maxLength={300}
                            disabled={readOnly}
                            placeholder="Say what this page offers, in a sentence or two."
                            onChange={(e) =>
                                set("seoDescription", e.target.value)
                            }
                        />
                    </Field>
                    <GooglePreview
                        siteName={siteName}
                        link={pageLink(host, draft.path)}
                        title={googleTitle}
                        text={googleText}
                    />
                </section>

                <Field label="Share image" group>
                    <div className="grid gap-3">
                        <div className="flex items-center gap-3">
                            <ShareImageThumb url={shareImage ?? ""} />
                            <p className="min-w-0 text-sm text-muted-foreground">
                                {draft.shareImageUrl
                                    ? "Shown when someone shares this page."
                                    : siteImageUrl
                                      ? "Your site's share image, until this page has its own."
                                      : siteImageUrl === null
                                        ? "None yet: a shared link shows no picture."
                                        : "Shown when someone shares this page."}
                            </p>
                        </div>
                        {readOnly ? null : (
                            <div className="flex flex-wrap items-start gap-2">
                                <MediaPicker
                                    label={
                                        draft.shareImageUrl
                                            ? "Replace"
                                            : "Choose a photo"
                                    }
                                    onPick={(img) => {
                                        setFailed(null);
                                        setDraft((d) => ({
                                            ...d,
                                            shareImageMediaId:
                                                img.mediaId ?? null,
                                            shareImageUrl: img.src,
                                        }));
                                    }}
                                />
                                {draft.shareImageUrl ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            setDraft((d) => ({
                                                ...d,
                                                shareImageMediaId: null,
                                                shareImageUrl: null,
                                            }))
                                        }
                                    >
                                        Remove
                                    </Button>
                                ) : null}
                            </div>
                        )}
                        <SharePreview
                            image={shareImage}
                            title={googleTitle}
                            text={googleText}
                            host={pageLink(host, draft.path)}
                        />
                    </div>
                </Field>

                <section aria-labelledby={`${id}-site`} className="grid gap-4">
                    <h3 id={`${id}-site`} className="text-sm font-semibold">
                        On the site
                    </h3>
                    {/*
                     * Home is what the site's own address serves: always on
                     * the site and first, so it has no menu or visibility
                     * choice at all, not disabled ones.
                     */}
                    {page.isHome ? null : (
                        <>
                            <SwitchRow
                                id={`${id}-menu`}
                                label="Show in menu"
                                note="A page out of the menu still works if you link to it."
                                checked={draft.inMenu}
                                disabled={readOnly}
                                onChange={(on) => set("inMenu", on)}
                            />
                            <div className="grid gap-2">
                                <p
                                    id={`${id}-who`}
                                    className="text-sm font-medium"
                                >
                                    Who can see it
                                </p>
                                <RadioCards
                                    labelledBy={`${id}-who`}
                                    value={draft.hidden ? "hidden" : "public"}
                                    disabled={readOnly}
                                    onChange={(v) =>
                                        set("hidden", v === "hidden")
                                    }
                                    options={[
                                        {
                                            value: "public",
                                            label: "Public",
                                            note: "Anyone with the link.",
                                        },
                                        {
                                            value: "hidden",
                                            label: "Hidden",
                                            note: "Hidden pages stay here and come off the site when you publish.",
                                        },
                                    ]}
                                />
                            </div>
                        </>
                    )}
                    <SwitchRow
                        id={`${id}-google-on`}
                        label="Show on Google"
                        note="Turn off for a thank-you page or a private offer."
                        checked={draft.onGoogle}
                        disabled={readOnly}
                        onChange={(on) => set("onGoogle", on)}
                    />
                </section>

                {editorHref ? (
                    <IntentLink
                        href={editorHref}
                        className="justify-self-start text-sm font-medium underline underline-offset-4"
                    >
                        Open this page in the editor
                    </IntentLink>
                ) : null}
            </FormSheet>
            {guard.dialog}
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete ${page.title}?`}
                description="Everything on the page is deleted with it. Your other pages stay as they are. This cannot be undone."
                confirmLabel="Delete page"
                keepLabel="Keep page"
                onConfirm={remove}
            />
        </>
    );
}

function SwitchRow({
    id,
    label,
    note,
    checked,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    note: string;
    checked: boolean;
    disabled: boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="grid gap-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p id={`${id}-note`} className="text-sm text-muted-foreground">
                    {note}
                </p>
            </div>
            <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                aria-describedby={`${id}-note`}
                onCheckedChange={onChange}
                className="mt-0.5 shrink-0"
            />
        </div>
    );
}
