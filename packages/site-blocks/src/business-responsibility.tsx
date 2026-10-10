import { cn } from "./lib/utils";

/**
 * Who a customer deals with (Terms rev 46, 9 Oct: "Your customers and your
 * business"). Saroh is the software; the business runs the site and is
 * responsible for what it sells. One quiet line, in the site's own tokens
 * and type, never Saroh's: the footer on every page, and the order and
 * booking confirmations.
 */
export function responsibilityLine(businessName: string): string {
    const name = businessName.trim() || "This business";
    return `${name} runs this website and is responsible for its orders and bookings.`;
}

/**
 * Where "Report this business" goes: saroh.in's page for customers, with
 * the site's address filled in for the report.
 */
export function reportBusinessHref(host: string): string {
    const site = host.trim().toLowerCase();
    return site
        ? `https://saroh.in/customers?site=${encodeURIComponent(site)}`
        : "https://saroh.in/customers";
}

/**
 * The line, and in the footer the small "Report this business" link after
 * it. Its colour comes from where it sits (`className`): the footer's own
 * foreground there, the muted text on a confirmation.
 */
export function BusinessResponsibility({
    businessName,
    reportHref = null,
    className,
    linkClassName,
}: {
    businessName: string;
    /** The footer's report link; null draws none. */
    reportHref?: string | null;
    className?: string;
    linkClassName?: string;
}) {
    return (
        <p
            className={cn("text-[12px] leading-[1.5]", className)}
            data-business-responsibility=""
        >
            {responsibilityLine(businessName)}
            {reportHref ? (
                <>
                    {" "}
                    <a
                        href={reportHref}
                        target="_blank"
                        rel="noopener"
                        className={linkClassName}
                    >
                        Report this business
                    </a>
                </>
            ) : null}
        </p>
    );
}
