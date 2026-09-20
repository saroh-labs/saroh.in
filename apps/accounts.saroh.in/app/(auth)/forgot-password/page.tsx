import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { FORGOT_PANEL } from "@/components/auth/panel-copy";

export const metadata: Metadata = {
    title: "Forgot password | Saroh",
    description: "Reset your Saroh account password.",
};

export default function ForgotPasswordPage() {
    return (
        <SplitShell panel={<SplitPanel {...FORGOT_PANEL} />}>
            <ForgotPasswordForm />
        </SplitShell>
    );
}
