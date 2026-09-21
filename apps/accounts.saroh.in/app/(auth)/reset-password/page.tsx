import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";

import {
    EXPIRED_PANEL,
    MISSING_PANEL,
    RESET_PANEL,
} from "@/components/auth/panel-copy";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
    title: "Reset password | Saroh",
    description: "Set a new password for your Saroh account.",
};

/**
 * One route, three states, and the panel follows the state: a usable link,
 * an expired one (Better Auth redirects here with `?error=INVALID_TOKEN` and
 * no token), or none at all. The form decides the same three in the same
 * order — expired first — so the two halves cannot disagree.
 */
export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { token, error } = await searchParams;
    const panel =
        error === "INVALID_TOKEN"
            ? EXPIRED_PANEL
            : token
              ? RESET_PANEL
              : MISSING_PANEL;
    return (
        <SplitShell panel={<SplitPanel {...panel} />}>
            <ResetPasswordForm />
        </SplitShell>
    );
}
