import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, which can't name itself: without this
// its tab read "Sign in · Saroh" to someone already signed in.
export const metadata: Metadata = { title: "Your account" };

export default function AccountLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
