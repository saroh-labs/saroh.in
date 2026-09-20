import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import { ThemeToggle } from "@saroh/ui/theme-toggle";
import type { Metadata } from "next";

import { RESET_PANEL } from "@/components/auth/panel-copy";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
    title: "Reset password | Saroh",
    description: "Set a new password for your Saroh account.",
};

export default function ResetPasswordPage() {
    return (
        <SplitShell
            action={<ThemeToggle />}
            panel={<SplitPanel {...RESET_PANEL} />}
        >
            <ResetPasswordForm />
        </SplitShell>
    );
}
