"use client";

import { Button } from "@saroh/ui/button";
import { useState, useTransition } from "react";

import { asWords } from "@/lib/format";
import { recheckDomainAction } from "@/lib/machinery-actions";

/** Check a waiting domain's DNS again now; the answer shows beside it. */
export function RecheckDomain({ domainId }: { domainId: string }) {
    const [message, setMessage] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                    startTransition(async () => {
                        const result = await recheckDomainAction(domainId);
                        setMessage(
                            !result.ok
                                ? result.error
                                : result.data.verified
                                  ? "Verified."
                                  : `Not verified yet: ${result.data.reason ? asWords(result.data.reason).toLowerCase() : "no reason given"}.`,
                        );
                    })
                }
            >
                {pending ? "Checking…" : "Check again"}
            </Button>
            {message && (
                <span
                    role="status"
                    className="text-[13px] text-muted-foreground"
                >
                    {message}
                </span>
            )}
        </div>
    );
}
