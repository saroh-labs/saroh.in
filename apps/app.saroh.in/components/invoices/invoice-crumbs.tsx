import { PaymentsCrumbs } from "@/components/subscriptions/payments-crumbs";

/**
 * The bar over every invoice page in the designs, as over Subscriptions and
 * Plan Detail: "Payments › Invoices", or "Payments › Invoices ›
 * RC/26-27/0020" with the list as a link back. It runs the full width of the
 * work area, so it steps out of the page container's padding.
 */
export function InvoiceCrumbs({ current }: { current?: string }) {
    return (
        <div className="-mx-4 -mt-5 mb-5 sm:-mx-[26px] print:hidden">
            <PaymentsCrumbs
                here={current ?? "Invoices"}
                trail={
                    current
                        ? [{ href: "/billing/invoices", label: "Invoices" }]
                        : []
                }
            />
        </div>
    );
}
