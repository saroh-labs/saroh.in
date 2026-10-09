"use client";

import { Button } from "@saroh/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@saroh/ui/collapsible";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { DomainView } from "@/lib/domains/domain-view";
import { DOMAIN_WORDS } from "@/lib/domains/domain-view";
import type { SiteDomain } from "@/lib/domains/service";

/**
 * The DNS records a domain asks for (#200, #861), each part something to
 * COPY exactly as a registrar wants it. Which records show, and whether they
 * sit folded under "DNS records" once the domain is live, is the view's
 * (`lib/domains/domain-view.ts`).
 */

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function CopyField({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <code
                className="min-w-0 truncate rounded border bg-muted/40 px-2 py-1 text-xs"
                title={value}
            >
                {value}
            </code>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 justify-self-start text-xs sm:justify-self-end"
                onClick={() =>
                    void copy(value).then((ok) =>
                        ok
                            ? showSuccess(`${label} copied.`)
                            : showError(
                                  "Could not copy. Select the text and copy it yourself.",
                              ),
                    )
                }
            >
                Copy
            </Button>
        </div>
    );
}

function Records({ domain, view }: { domain: SiteDomain; view: DomainView }) {
    // Numbered only when both are listed: one record needs no "1.".
    const both = view.showTxt && view.showCname;
    return (
        <>
            {view.showTxt ? (
                <>
                    {both ? (
                        <p className="text-xs font-medium">
                            {DOMAIN_WORDS.txtHeading}
                        </p>
                    ) : null}
                    <CopyField label="Type" value={domain.dnsRecord.type} />
                    <CopyField label="Name" value={domain.dnsRecord.name} />
                    <CopyField label="Value" value={domain.dnsRecord.value} />
                </>
            ) : null}
            {view.showCname ? (
                <>
                    {both ? (
                        <p className="pt-1 text-xs font-medium">
                            {view.scene === "waiting"
                                ? DOMAIN_WORDS.cnameHeadingWaiting
                                : DOMAIN_WORDS.cnameHeading}
                        </p>
                    ) : null}
                    <CopyField label="Type" value="CNAME" />
                    <CopyField label="Name" value={view.cname.name} />
                    <CopyField label="Value" value={view.cname.value} />
                </>
            ) : null}
        </>
    );
}

/**
 * The records with the sentence that goes with them: open, or — for a live
 * domain — folded under "DNS records", which a tap opens. Nothing is hidden
 * behind hover.
 */
export function DomainRecords({
    domain,
    view,
}: {
    domain: SiteDomain;
    view: DomainView;
}) {
    const [open, setOpen] = useState(false);

    if (!view.foldRecords) {
        return (
            <div className="space-y-2">
                {view.intro ? (
                    <p className="text-sm text-muted-foreground">
                        {view.intro}
                    </p>
                ) : null}
                <Records domain={domain} view={view} />
            </div>
        );
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 gap-1"
                >
                    {DOMAIN_WORDS.recordsToggle}
                    <ChevronDown
                        aria-hidden
                        className={
                            open
                                ? "size-4 rotate-180 transition-transform"
                                : "size-4 transition-transform"
                        }
                    />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
                {view.intro ? (
                    <p className="text-sm text-muted-foreground">
                        {view.intro}
                    </p>
                ) : null}
                <Records domain={domain} view={view} />
            </CollapsibleContent>
        </Collapsible>
    );
}
