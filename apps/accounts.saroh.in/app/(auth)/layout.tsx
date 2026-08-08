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
        <div className="flex min-h-screen flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
            {/* The wordmark leads the entrance and the panel follows 120ms
                later, so the page resolves as brand-then-task rather than
                everything arriving at once. */}
            <div
                className="sa-rise mb-9 flex justify-center"
                style={{ "--sa-delay": "60ms" } as React.CSSProperties}
            >
                <Link
                    href="https://saroh.in"
                    aria-label="Saroh"
                    className="focus-visible:ring-ring rounded-md transition-transform duration-300 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
                >
                    <Wordmark style={{ fontSize: "1.75rem" }} />
                </Link>
            </div>
            {children}
        </div>
    );
}
