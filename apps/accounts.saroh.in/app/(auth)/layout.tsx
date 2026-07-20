import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Login | Saroh",
    description:
        "Login to saroh. A platform for managing your portfolios, marketing websites and more.",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="mb-8 flex justify-center">
                <Link href="https://saroh.in" aria-label="Saroh">
                    <Wordmark style={{ fontSize: "1.5rem" }} />
                </Link>
            </div>
            {children}
        </div>
    );
}
