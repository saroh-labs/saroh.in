"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";
import { useId, useState } from "react";

import {
    addressHost,
    hostOf,
    suffixOf,
    typedAddress,
    useAddressCheck,
} from "@/lib/organizations/web-address";
import {
    checkWebAddress,
    saveWebAddress,
} from "@/lib/organizations/web-address-actions";

/** What the Publish sheet needs to offer the web address in place. */
export interface WebAddressFix {
    /** The address the business holds: its setup one, until a site has one. */
    address: string;
    /** `https://<address>.saroh.app`: where the suffix is read from. */
    platformOrigin: string;
    /** The owner, with changing switched on: the field is offered. */
    canChange: boolean;
}

/**
 * "No web address", fixed inside the Publish sheet (DEC-185): the same
 * field and live check as Settings › Business (`WebAddressDialog`), so
 * nothing navigates away. The API decides what is free; a refusal is said
 * under the field with its suggestion.
 */
export function AddressFix({
    fix,
    onCancel,
    onSaved,
}: {
    fix: WebAddressFix;
    onCancel: () => void;
    /** The site's host now: "northwind.saroh.app". */
    onSaved: (host: string) => void;
}) {
    const [address, setAddress] = useState(fix.address);
    const [saving, setSaving] = useState(false);
    const [refused, setRefused] = useState<{
        message: string;
        suggestion?: string;
    } | null>(null);
    const check = useAddressCheck(address, checkWebAddress);
    const suffix = suffixOf(fix);
    const fieldId = useId();
    const statusId = useId();

    const answer = check.state === "answered" ? check.answer : null;
    const problem =
        refused?.message ?? (answer && !answer.ok ? answer.reason : null);
    const suggestion =
        refused?.suggestion ??
        (answer && !answer.ok ? answer.suggestion : null);
    const saveOff =
        address === "" ||
        check.state === "checking" ||
        (answer !== null && !answer.ok);

    async function save() {
        setSaving(true);
        try {
            const res = await saveWebAddress(address);
            if (!res.ok) {
                setRefused({
                    message: res.error,
                    suggestion: res.suggestion,
                });
                return;
            }
            onSaved(hostOf(res.data.origin));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="mt-3 grid gap-2">
            <Label htmlFor={fieldId} className="text-xs font-medium">
                Web address
            </Label>
            <div
                className={cn(
                    "flex h-[38px] items-center rounded-md border border-input bg-field pr-3 font-mono text-sm focus-within:ring-2 focus-within:ring-ring coarse:h-11",
                    problem && "border-destructive",
                )}
            >
                <Input
                    id={fieldId}
                    value={address}
                    onChange={(e) => {
                        setRefused(null);
                        setAddress(typedAddress(e.target.value));
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    aria-describedby={statusId}
                    className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-0 text-right font-mono shadow-none focus-visible:ring-0"
                />
                <span className="text-muted-foreground">{suffix}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <p
                    id={statusId}
                    role="status"
                    className={cn(
                        "mr-auto min-h-[1.2em] text-xs",
                        problem ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {problem ??
                        (check.state === "checking" ? (
                            "Checking…"
                        ) : answer?.ok ? (
                            <span className="inline-flex items-center gap-1 text-success">
                                <Check aria-hidden className="size-3.5" />
                                Free
                            </span>
                        ) : null)}
                    {suggestion ? (
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="ml-2 h-auto p-0 font-medium"
                            onClick={() => {
                                setRefused(null);
                                setAddress(suggestion);
                            }}
                        >
                            Use {addressHost(suggestion, suffix)}
                        </Button>
                    ) : null}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={saveOff}
                    busy={saving}
                    busyLabel="Saving…"
                    onClick={() => void save()}
                >
                    Save address
                </Button>
            </div>
        </div>
    );
}
