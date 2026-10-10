"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useState } from "react";

import { DomainRecords } from "@/components/sites/domain-records";
import type { DomainView } from "@/lib/domains/domain-view";
import { bareHostname } from "@/lib/domains/hostname";
import type { SiteDomain } from "@/lib/domains/service";
import { settingsEditId } from "@/lib/sites/settings-edit";

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
    added: { domain: SiteDomain; view: DomainView; line: string | null } | null;
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
            setFormError("Enter the domain to add.");
            return;
        }
        setAdding(true);
        setFormError(null);
        const res = await onClaim(value);
        setAdding(false);
        if (!res.ok) setFormError(res.error);
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o && !adding) onClose();
            }}
        >
            <DialogContent
                className="sm:max-w-[520px]"
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    document.getElementById(settingsEditId("domain"))?.focus();
                }}
            >
                {added ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                {added.domain.hostname} added
                            </DialogTitle>
                            <DialogDescription>
                                One step left, at your registrar. You can close
                                this and come back: the records stay under the
                                domain.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3" data-added-domain>
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-medium">
                                    {added.domain.hostname}
                                </span>
                                <Badge variant={added.view.badge.variant}>
                                    {added.view.badge.label}
                                </Badge>
                            </div>
                            {added.view.problem ? (
                                <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
                                    {added.view.problem}
                                </p>
                            ) : null}
                            <DomainRecords
                                domain={added.domain}
                                view={added.view}
                            />
                            {added.line ? (
                                <p
                                    className="text-xs text-muted-foreground"
                                    aria-live="polite"
                                >
                                    {added.line}
                                </p>
                            ) : null}
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                            >
                                Done
                            </Button>
                            {added.view.checkLabel ? (
                                <Button
                                    type="button"
                                    disabled={checking}
                                    onClick={() => onCheck(added.domain)}
                                >
                                    {checking
                                        ? "Checking…"
                                        : added.view.checkLabel}
                                </Button>
                            ) : null}
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Add a domain</DialogTitle>
                            <DialogDescription>
                                Point a domain you own at this site. Visitors
                                see no change until it&apos;s verified.
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            noValidate
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void add();
                            }}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="add-domain-field">
                                    Domain to add
                                </Label>
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
                                {formError ? (
                                    <p
                                        id="add-domain-note"
                                        role="alert"
                                        className="text-xs text-destructive"
                                    >
                                        {formError}
                                    </p>
                                ) : (
                                    <p
                                        id="add-domain-note"
                                        className="text-xs text-muted-foreground"
                                    >
                                        {first
                                            ? "A domain you already own, like www.yourshop.in."
                                            : "Add another domain for this site."}
                                    </p>
                                )}
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={adding}
                                    onClick={onClose}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={adding}>
                                    {adding ? "Adding…" : "Add domain"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
