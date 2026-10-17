import { buttonVariants } from "@saroh/ui/button";
import Link from "next/link";

const TABS = [
    { href: "/billing/invoices", label: "Invoices" },
    { href: "/billing/subscriptions", label: "Subscriptions" },
    { href: "/billing/actions", label: "Needs action" },
    { href: "/billing/events", label: "Provider events" },
] as const;

/** Invoices | Subscriptions | Needs action | Provider events (DEC-166). */
export function BillingTabs({
    current,
}: {
    current: (typeof TABS)[number]["href"];
}) {
    return (
        <nav aria-label="Billing" className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => {
                const on = tab.href === current;
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        aria-current={on ? "page" : undefined}
                        className={buttonVariants({
                            variant: on ? "secondary" : "ghost",
                            size: "sm",
                        })}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </nav>
    );
}
