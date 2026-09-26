import Link from "next/link";

/**
 * The bar over every Payments screen in the design: "Payments › Subscriptions",
 * or a back link and the record's name on a detail page.
 */
export function PaymentsCrumbs({
    here,
    back,
    children,
}: {
    here: string;
    /** On a detail page: the list it came from. */
    back?: { href: string; label: string };
    /** What sits at the right-hand end of the bar. */
    children?: React.ReactNode;
}) {
    return (
        <div className="flex min-h-[47px] flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px]">
            {back ? (
                <>
                    <Link
                        href={back.href}
                        className="flex items-center gap-[7px] rounded-[8px] px-[9px] py-1.5 text-[12.5px] text-foreground/75 hover:bg-muted coarse:min-h-11"
                    >
                        <svg
                            aria-hidden
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <path
                                d="M14.5 5 L7.5 12 L14.5 19"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        {back.label}
                    </Link>
                    <span
                        aria-hidden
                        className="text-[15px] text-muted-foreground"
                    >
                        /
                    </span>
                    <span className="min-w-0 truncate text-[13.5px] font-semibold">
                        {here}
                    </span>
                </>
            ) : (
                <nav
                    aria-label="Breadcrumb"
                    className="flex items-center gap-2 text-[12px]"
                >
                    <span className="text-muted-foreground">Payments</span>
                    <svg
                        aria-hidden
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="text-muted-foreground"
                    >
                        <path
                            d="M9.5 5 L16.5 12 L9.5 19"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <span aria-current="page" className="text-foreground">
                        {here}
                    </span>
                </nav>
            )}
            {children ? <div className="ml-auto">{children}</div> : null}
        </div>
    );
}
