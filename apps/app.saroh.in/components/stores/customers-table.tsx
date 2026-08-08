"use client";

import type { ColumnDef } from "@saroh/ui/data-table";
import { DataTable } from "@saroh/ui/data-table";
import { useRouter } from "next/navigation";

import type { Customer } from "@/lib/customers/service";

function fullName(c: Customer) {
    return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

const columns: ColumnDef<Customer>[] = [
    {
        id: "name",
        accessorFn: (c) => fullName(c) || c.email,
        header: "Name",
        cell: ({ row }) => (
            <span className="font-medium">
                {fullName(row.original) || row.original.email}
            </span>
        ),
    },
    {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
            <span className="text-muted-foreground">{row.original.email}</span>
        ),
    },
    {
        accessorKey: "city",
        header: "City",
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {row.original.city ?? "—"}
            </span>
        ),
    },
];

/** Sortable, clickable customers table. Rows link to the customer detail. */
export function CustomersTable({
    customers,
    base,
}: {
    customers: Customer[];
    base: string;
}) {
    const router = useRouter();
    return (
        <DataTable
            columns={columns}
            data={customers}
            onRowClick={(c) => router.push(`${base}/${c.id}`)}
        />
    );
}
