import { SignupForm } from "@/components/auth/signup-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign up | Saroh",
    description: "Create an account with Saroh.",
};

export default function SignupPage() {
    return <SignupForm />;
}
