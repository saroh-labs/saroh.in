import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Reset password | Saroh",
    description: "Set a new password for your Saroh account.",
};

export default function ResetPasswordPage() {
    return <ResetPasswordForm />;
}
