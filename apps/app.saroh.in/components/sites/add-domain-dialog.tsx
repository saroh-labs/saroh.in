"use client";

import { FormDialog, FormDialogFoot } from "@/components/shared/form-dialog";
import { Refusal } from "@/components/shared/refusal";
import { Badge } from "@saroh/ui/badge";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { useState } from "react";

import { BareDomainStep } from "@/components/sites/bare-domain-step";
import { DomainRecords } from "@/components/sites/domain-records";
import { runAction } from "@/lib/api/run-action";
import type { BareView } from "@/lib/domains/bare-view";
import { BARE_WORDS, connectedAsWww } from "@/lib/domains/bare-view";
import type { DomainView } from "@/lib/domains/domain-view";
import { bareHostname } from "@/lib/domains/hostname";
import type { SiteDomain } from "@/lib/domains/service";
import { settingsEditId } from "@/lib/sites/settings-edit";

/** The field's own problem; anything else here is the API's sentence. */
const NEEDS_DOMAIN = "Enter the domain to add.";

/**
 * Add a domain, start to finish in one dialog (owner, 10 Oct): the domain
 * to add, then, once the api has taken it, the records to copy to the
 * registrar and the check that looks for them. Nobody is sent to find the
 * new domain's card under the dialog to carry on.
 *
 * A refusal stays here with what was typed, in the api's own words: a
 * taken hostname (409), a plan without custom domains (403), a malformed
 * name (400, plain since UX-066). Each says what to do. Mounted per
 * opening (`key`), so each one starts empty.
 */
export function AddDomainDialog({
    open,
    first,
    added,
    checking,
    onClaim,
    onCheck,
    onClose,
}: {
    open: boolean;
    /** No domain yet: the note names an example instead of "another". */
    first: boolean;
    /** The domain this opening added, as the list now has it, and its view. */
    added: {
        domain: SiteDomain;
        view: DomainView;
        line: string | null;
        /** Its bare domain's forwarding step (DEC-140), for a `www` one. */
        bare?: BareView | null;
    } | null;
    /** A check on the added domain is on its way. */
    checking: boolean;
    /** Claims the hostname; the refusal comes back to be said here. */
    onClaim: (
        hostname: string,
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    onCheck: (domain: SiteDomain) => void;
    onClose: () => void;
}) {
    const [hostname, setHostname] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

    async function add() {
        // A pasted https://…/ address is taken down to its domain (UX-066).
        const value = bareHostname(hostname);
        if (!value) {
            setFormError(NEEDS_DOMAIN);
            return;
        }
        setFormError(null);
        const res = await runAction(() => onClaim(value), {
            setBusy: setAdding,
            // Said in the dialog, under the domain they typed.
            quiet: true,
            onUnreached: setFormError,
        });
        if (res && !res.ok) setFormError(res.error);
    }

    return (
        <FormDialog
            open={open}
            size="lg"
            returnFocusTo={settingsEditId("domain")}
            title={added ? `${added.domain.hostname} added` : "New domain"}
            description={
                added
                    ? "The rest is at your registrar. You can close this and come back: the steps stay under the domain."
                    : "Point a domain you own at this site. Visitors see no change until it's verified."
            }
            pending={adding}
            onClose={onClose}
        >
            {added ? (
                <>
                    <div className="space-y-3" data-added-domain>
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium">
                                {added.domain.hostname}
                            </span>
                            <Badge variant={added.view.badge.variant}>
                                {added.view.badge.label}
                            </Badge>
                        </div>
                        {/* DEC-140: a bare domain was typed, and its
                            `www` is what was added. Said plainly, first. */}
                        {added.bare?.hostname === bareHostname(hostname) ? (
                            <Notice tone="info">
                                {connectedAsWww(
                                    added.bare.hostname,
                                    added.bare.www,
                                )}
                            </Notice>
                        ) : null}
                        {added.view.problem ? (
                            <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
                                {added.view.problem}
                            </p>
                        ) : null}
                        <DomainRecords
                            domain={added.domain}
                            view={added.view}
                        />
                        {added.bare ? (
                            <BareDomainStep
                                view={added.bare}
                                target={added.view.cname.value}
                            />
                        ) : null}
                        {added.line ? (
                            <p
                                className="text-xs text-muted-foreground"
                                aria-live="polite"
                            >
                                {added.line}
                            </p>
                        ) : null}
                    </div>
                    {added.view.checkLabel ? (
                        <FormDialogFoot
                            cancelLabel="Done"
                            saveLabel={added.view.checkLabel}
                            savingLabel="Checking…"
                            pending={checking}
                            onSubmit={() => onCheck(added.domain)}
                        />
                    ) : (
                        <FormDialogFoot doneOnly />
                    )}
                </>
            ) : (
                <>
                    <div className="space-y-2">
                        <Label htmlFor="add-domain-field">Domain to add</Label>
                        <Input
                            id="add-domain-field"
                            value={hostname}
                            onChange={(e) => {
                                setHostname(e.target.value);
                                if (formError) setFormError(null);
                            }}
                            placeholder="shop.example.com"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={formError ? true : undefined}
                            aria-describedby="add-domain-note"
                        />
                        {formError === NEEDS_DOMAIN ? (
                            <p
                                id="add-domain-note"
                                role="alert"
                                className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                            >
                                {formError}
                            </p>
                        ) : formError ? (
                            // Why the domain wasn't added, as the API or
                            // the connection said it.
                            <Refusal id="add-domain-note">{formError}</Refusal>
                        ) : (
                            <p
                                id="add-domain-note"
                                className="text-xs text-muted-foreground"
                            >
                                {first
                                    ? BARE_WORDS.fieldHint
                                    : "Add another domain for this site."}
                            </p>
                        )}
                    </div>
                    <FormDialogFoot
                        saveLabel="Add domain"
                        savingLabel="Adding…"
                        onSubmit={add}
                    />
                </>
            )}
        </FormDialog>
    );
}
