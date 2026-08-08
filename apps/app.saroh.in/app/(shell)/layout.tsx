import { AppShell } from "@/components/shared/app-shell";

/**
 * Every route that belongs inside the working app. The `(shell)` group exists
 * only to scope `AppShell` — it does not appear in any URL — so first-run
 * routes outside it can render their own, quieter chrome.
 */
export default function ShellLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppShell>{children}</AppShell>;
}
