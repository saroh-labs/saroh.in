"use client";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";

export function MainNav({
    className,
    ...props
}: React.HTMLAttributes<HTMLElement>) {
    const params = useParams();
    const domain = params.teamId as string;
    return (
        <nav
            className={cn(
                "flex items-center space-x-4 lg:space-x-6",
                className,
            )}
            {...props}
        >
            <Link
                href={`/${domain}`}
                className="hover:text-primary text-sm font-medium transition-colors"
            >
                Overview
            </Link>
            <Link
                href={`/${domain}`}
                className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
            >
                Customers
            </Link>
            <Link
                href={`/${domain}/products`}
                className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
            >
                Products
            </Link>
            <Link
                href={`/${domain}/settings`}
                className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
            >
                Settings
            </Link>
        </nav>
    );
}
