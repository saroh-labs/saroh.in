"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import type { PromptKey } from "@/lib/billing/upgrade-prompts";
import {
    promptPressed,
    useUpgradePromptShown,
} from "@/lib/billing/upgrade-prompts";

/**
 * An upgrade prompt's way up (#1197): a `Link` that says the prompt was
 * shown when it is drawn and pressed when it is pressed. Navigation never
 * waits on either.
 */
export function UpgradePromptLink({
    prompt,
    onClick,
    ...props
}: ComponentProps<typeof Link> & { prompt: PromptKey }) {
    useUpgradePromptShown(prompt);
    return (
        <Link
            {...props}
            onClick={(event) => {
                promptPressed(prompt);
                onClick?.(event);
            }}
        />
    );
}

/** Says a prompt drawn without a `UpgradePromptLink` of its own was shown. */
export function UpgradePromptSeen({ prompt }: { prompt: PromptKey }) {
    useUpgradePromptShown(prompt);
    return null;
}
