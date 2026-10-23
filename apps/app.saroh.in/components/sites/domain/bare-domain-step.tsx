"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";

import type { BareView } from "@/lib/domains/bare-view";
import { aliasNote, BARE_WORDS, bareSelfNote } from "@/lib/domains/bare-view";
import type { DomainView } from "@/lib/domains/domain-view";
import type { SiteDomain } from "@/lib/domains/service";
import { CopyField } from "./domain-records";

/**
 * The bare domain of a `www` connection (DEC-140), under the domain's DNS
 * records: what the last look found, and the step that forwards
 * `yourshop.in` to `www.yourshop.in` at the provider, each part something
 * to COPY. What shows is the view's (`lib/domains/bare-view.ts`).
 *
 * A notice, never the domain's state: the badge and the records above say
 * whether `www` serves, and this never changes them. Where the bare domain
 * already points at Saroh, it is added from here, in place.
 */
export function BareDomainStep({
    view,
    target,
    adding,
    onAdd,
}: {
    view: BareView;
    /** The CNAME target, for the ALIAS note. */
    target: string;
    /** The bare domain is being added now. */
    adding?: boolean;
    /** Adds the bare domain as a domain of its own; absent where it can't. */
    onAdd?: (hostname: string) => void;
}) {
    return (
        <div className="space-y-2" data-bare-domain={view.hostname}>
            {view.line && view.tone !== "plain" ? (
                <Notice
                    tone={view.tone}
                    action={
                        view.canAdd && onAdd ? (
                            <Button
                                data-ph-mask=""
                                type="button"
                                size="sm"
                                variant="outline"
                                busy={adding}
                                busyLabel="Adding…"
                                onClick={() => onAdd(view.hostname)}
                            >
                                {BARE_WORDS.add(view.hostname)}
                            </Button>
                        ) : undefined
                    }
                >
                    {view.line}
                </Notice>
            ) : view.line ? (
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {view.line}
                </p>
            ) : null}

            {view.showStep ? (
                <>
                    <p className="pt-1 text-xs font-medium [overflow-wrap:anywhere]">
                        {view.stepHeading}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {BARE_WORDS.stepBody}
                    </p>
                    <CopyField label={BARE_WORDS.from} value={view.hostname} />
                    <CopyField label={BARE_WORDS.to} value={view.forwardTo} />
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {aliasNote(view.hostname, target)}
                    </p>
                </>
            ) : null}
        </div>
    );
}

/**
 * What a domain's row says about bare domains, under its records: for a
 * `www` domain, its bare domain's step and standing; for a bare domain
 * connected as itself and not live yet, the record it needs and the way
 * out. Nothing for any other subdomain.
 */
export function BareDomainPart({
    domain,
    view,
    bare,
    adding,
    onAdd,
}: {
    domain: SiteDomain;
    view: DomainView;
    bare: BareView | null;
    adding?: boolean;
    onAdd?: (hostname: string) => void;
}) {
    if (bare) {
        return (
            <BareDomainStep
                view={bare}
                target={view.cname.value}
                adding={adding}
                onAdd={onAdd}
            />
        );
    }
    if (domain.hostnameKind !== "bare" || view.scene === "live") return null;
    return (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {bareSelfNote(domain.hostname)}
        </p>
    );
}
