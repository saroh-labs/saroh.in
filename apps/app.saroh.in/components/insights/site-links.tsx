"use client";

import { Button } from "@saroh/ui/button";
import { CopyButton, copyText } from "@saroh/ui/copy-button";
import { FailedState } from "@saroh/ui/data-state";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { Archive, Link2, Plus } from "lucide-react";
import { useId, useState } from "react";

import { ChipGroup } from "@/components/shared/choice-group";
import { FormDialog } from "@/components/shared/form-dialog";
import type { SourceRead } from "@/lib/analytics/takings";
import { runAction } from "@/lib/api/run-action";
import {
    archiveSiteLink,
    makeSiteLink,
    restoreSiteLink,
} from "@/lib/insights/link-actions";
import type { SiteLinkRead, SiteLinksRead } from "@/lib/insights/link-maker";
import {
    labelProblem,
    LINK_LABEL_MAX,
    LINK_NAME_MAX,
    linkFigures,
    linkLabelOf,
    linkUrl,
    NAME_HINT,
    nameProblem,
    typedLabel,
} from "@/lib/insights/link-maker";

/** A website a link can be made for, with the address its link opens. */
export interface LinkSite {
    id: string;
    name: string;
    /** `https://shop.rye.in`: its real address; null: none yet. */
    url: string | null;
}

/**
 * The business's own links (DEC-181, #1099), on Insights › Where customers
 * come from beside "Where do visitors come from?": only a link made here
 * is counted as its own; any other counts under where it was shared.
 *
 * - **Make a link**: a name ("Diwali post", with "Name the post, not the
 *   person." under it), the label made from it, shown and editable, and
 *   the whole link as it will be copied. Making it copies it.
 * - **The list**: each link's name and label, its visits and paid in the
 *   period (or "Fewer than 3 visits"), Copy, and Archive with Undo.
 * - Making and archiving are the website's (`site:update`); without it the
 *   list still copies, and one line says who makes links.
 *
 * At a desk a row reads across; on a phone its figures and buttons wrap
 * under the name at full size.
 */
export function SiteLinks({
    read,
    sites,
    siteId,
    canMake,
    retryHref,
}: {
    read: SourceRead<SiteLinksRead> | null;
    /** The business's websites; one chosen narrows the list. */
    sites: readonly LinkSite[];
    /** The website chosen on the tab, or null for all of them. */
    siteId: string | null;
    canMake: boolean;
    retryHref: string;
}) {
    const [links, setLinks] = useState<SiteLinkRead[]>(
        read?.status === "ok" ? read.data.links : [],
    );
    const [making, setMaking] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    if (!read || read.status === "denied") return null;
    if (read.status === "failed") {
        return (
            <FailedState
                data-ph-unmask=""
                data-testid="site-links-failed"
                size="panel"
                title={couldntLoad("your links")}
                retryHref={retryHref}
            />
        );
    }
    const minVisits = read.data.minVisits;
    const byId = new Map(sites.map((s) => [s.id, s]));
    // The sites a link can be made for: the one chosen, else every one.
    const makeFor = siteId ? sites.filter((s) => s.id === siteId) : [...sites];
    const several = sites.length > 1;

    async function archive(link: SiteLinkRead) {
        const res = await runAction(() => archiveSiteLink(link.id), {
            setBusy: (on) => setBusy(on ? link.id : null),
        });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        const at = links.findIndex((l) => l.id === link.id);
        setLinks((all) => all.filter((l) => l.id !== link.id));
        showUndo(`${link.name} archived`, async () => {
            const back = await restoreSiteLink(link.id);
            if (back.ok) {
                setLinks((all) => {
                    if (all.some((l) => l.id === link.id)) return all;
                    const next = [...all];
                    next.splice(
                        Math.max(0, Math.min(at, next.length)),
                        0,
                        link,
                    );
                    return next;
                });
            }
            return back;
        });
    }

    return (
        <section
            aria-labelledby="site-links-heading"
            data-testid="site-links"
            className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-border bg-card px-4 py-4 sm:px-5 sm:py-[18px]"
        >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 max-w-[62ch]">
                    <h3
                        id="site-links-heading"
                        data-ph-unmask=""
                        className="text-[13px] font-semibold text-muted-foreground"
                    >
                        Links made in Saroh
                    </h3>
                    <p
                        data-ph-unmask=""
                        className="mt-1 text-pretty text-[13.5px] leading-[1.5]"
                    >
                        Share one of these and its visits are counted as its
                        own. Any other link counts under where it was shared.
                    </p>
                </div>
                {canMake && makeFor.length > 0 ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setMaking(true)}
                        data-testid="make-link"
                    >
                        <Plus aria-hidden className="size-4" />
                        Make a link
                    </Button>
                ) : null}
            </div>
            {links.length > 0 ? (
                <ul className="grid w-full min-w-0" data-ph-mask="">
                    {links.map((link) => {
                        const site = byId.get(link.siteId);
                        const url = linkUrl(site?.url ?? null, link.label);
                        return (
                            <li
                                key={link.id}
                                data-testid="site-link"
                                data-label={link.label}
                                className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/70 py-2.5 first:border-t-0"
                            >
                                <div className="min-w-0 flex-1 basis-[220px]">
                                    <p className="text-[13.5px] font-medium [overflow-wrap:anywhere]">
                                        {link.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                        ?ref={link.label}
                                        {several && site
                                            ? ` · ${site.name}`
                                            : ""}
                                    </p>
                                </div>
                                <p
                                    data-testid="site-link-figures"
                                    className="shrink-0 text-[13px] tabular-nums text-muted-foreground"
                                >
                                    {linkFigures(link, minVisits)}
                                </p>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    {url ? (
                                        <CopyButton
                                            value={url}
                                            label="Copy"
                                            aria-label={`Copy the link for ${link.name}`}
                                        />
                                    ) : (
                                        <span className="text-xs text-muted-foreground">
                                            No address yet
                                        </span>
                                    )}
                                    {canMake ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            busy={busy === link.id}
                                            busyLabel="Archiving…"
                                            aria-label={`Archive ${link.name}`}
                                            onClick={() => void archive(link)}
                                        >
                                            <Archive
                                                aria-hidden
                                                className="size-4"
                                            />
                                            Archive
                                        </Button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p
                    data-testid="site-links-none"
                    data-ph-unmask=""
                    className="flex items-start gap-2 text-[13px] leading-[1.5] text-muted-foreground"
                >
                    <Link2 aria-hidden className="mt-0.5 size-4 shrink-0" />
                    No links yet. Make one for a post, a story or your bio, and
                    see how many visits it brings.
                </p>
            )}
            {!canMake ? (
                <p data-ph-unmask="" className="text-xs text-muted-foreground">
                    Links are made by people who can change the website.
                </p>
            ) : null}
            {making ? (
                <MakeLinkDialog
                    sites={makeFor}
                    onClose={() => setMaking(false)}
                    onMade={(link) => setLinks((all) => [link, ...all])}
                />
            ) : null}
        </section>
    );
}

/**
 * Make a link: the website (only when there are several to choose from),
 * a name, the label made from it until it is changed, and the link as it
 * will be copied. Making it copies it.
 */
function MakeLinkDialog({
    sites,
    onClose,
    onMade,
}: {
    sites: readonly LinkSite[];
    onClose: () => void;
    onMade: (link: SiteLinkRead) => void;
}) {
    const ids = { site: useId(), name: useId(), label: useId() };
    const [siteId, setSiteId] = useState<string | null>(
        sites.length === 1 ? sites[0].id : null,
    );
    const [name, setName] = useState("");
    const [label, setLabel] = useState("");
    const [edited, setEdited] = useState(false);
    const [tried, setTried] = useState(false);
    const [busy, setBusy] = useState(false);
    const [refused, setRefused] = useState<string | null>(null);

    const shown = edited ? label : linkLabelOf(name);
    const site = sites.find((s) => s.id === siteId) ?? null;
    const url = linkUrl(site?.url ?? null, shown || "…");
    const nameError = tried ? nameProblem(name) : null;
    const labelError = refused ?? (tried ? labelProblem(shown) : null);
    const siteError = tried && !site ? "Choose the website." : null;

    async function make() {
        setTried(true);
        setRefused(null);
        if (busy || !site || nameProblem(name) || labelProblem(shown)) return;
        const res = await runAction(
            () =>
                makeSiteLink({
                    siteId: site.id,
                    name: name.trim(),
                    label: shown.trim(),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            // The API's word on the label (taken, or not one) goes under it.
            if (/label/i.test(res.error)) setRefused(res.error);
            else showError(res.error);
            return;
        }
        onMade(res.data);
        const made = linkUrl(site.url, res.data.label);
        const copied = made ? await copyText(made) : false;
        showSuccess(
            copied
                ? `${res.data.name}: link made and copied`
                : `${res.data.name}: link made. Copy it from the list.`,
        );
        onClose();
    }

    return (
        <FormDialog
            open
            size="md"
            title="Make a link"
            description="Share it where you post. Its visits, and how many paid, show here."
            pending={busy}
            saveLabel="Make and copy link"
            savingLabel="Making…"
            dirty={name.trim() !== "" || edited}
            onClose={onClose}
            onSubmit={make}
        >
            {sites.length > 1 ? (
                <div className="grid gap-1.5">
                    <p
                        id={ids.site}
                        className="text-[12.5px] font-medium leading-none"
                    >
                        Website
                    </p>
                    <ChipGroup
                        labelledBy={ids.site}
                        value={siteId}
                        onChange={setSiteId}
                        invalid={siteError !== null}
                        choices={sites.map((s) => ({
                            value: s.id,
                            label: s.name,
                        }))}
                    />
                    {siteError ? (
                        <p
                            role="alert"
                            className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                        >
                            {siteError}
                        </p>
                    ) : null}
                </div>
            ) : null}
            <Field
                label="Name"
                hint={NAME_HINT}
                holdsData={false}
                error={nameError}
            >
                <Input
                    id={ids.name}
                    value={name}
                    maxLength={LINK_NAME_MAX}
                    autoComplete="off"
                    placeholder="Diwali post"
                    onChange={(e) => setName(e.target.value)}
                />
            </Field>
            <Field
                label="Label"
                // The hint shows the business's own link: masked.
                holdsData
                hint={
                    url
                        ? `The link: ${url}`
                        : "This website has no address yet."
                }
                error={labelError}
            >
                <Input
                    id={ids.label}
                    value={shown}
                    maxLength={LINK_LABEL_MAX}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => {
                        setEdited(true);
                        setRefused(null);
                        setLabel(typedLabel(e.target.value));
                    }}
                />
            </Field>
        </FormDialog>
    );
}
