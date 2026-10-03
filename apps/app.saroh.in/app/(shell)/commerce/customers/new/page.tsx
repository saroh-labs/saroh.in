import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AddCustomerForm } from "@/components/customers/add-customer-form";
import { PageContainer } from "@/components/shared/page-container";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Add customer" };

/**
 * Sell → Customers → Add customer (DEC-056, C14). Someone who has not
 * ordered yet — met at the counter, or on the phone — added to the business
 * as a contact, not to one storefront, so no storefront is asked for. An old
 * `?storefront=` link opens the same form.
 */
export default async function NewCustomerPage() {
    await requireSession();

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={[
                    "Sell",
                    <Link
                        key="customers"
                        href="/commerce/customers"
                        className="hover:text-foreground"
                    >
                        Customers
                    </Link>,
                    "Add customer",
                ]}
                title="Add customer"
                description="An email is enough; the rest is whatever you know. They join your business, not one location, and show on Customers straight away."
            />
            <AddCustomerForm />
        </PageContainer>
    );
}
