import Link from "next/link";

/**
 * "Payments › Invoices › RC/26-27/0020", as the invoice designs head their
 * pages; the list is a link back.
 */
export function InvoiceCrumbs({ current }: { current: string }) {
    const chevron = (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-3 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M9 6 L15 12 L9 18" />
        </svg>
    );
    return (
        <nav
            aria-label="Breadcrumb"
            className="mb-[9px] flex items-center gap-2 text-[12px] text-muted-foreground print:hidden"
        >
            <span>Payments</span>
            {chevron}
            <Link href="/billing/invoices" className="hover:text-foreground">
                Invoices
            </Link>
            {chevron}
            <span aria-current="page" className="text-foreground">
                {current}
            </span>
        </nav>
    );
}
