"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { ExternalLink, Eye, MoreHorizontal, Users } from "lucide-react";
import Link from "next/link";

import { productHref } from "@/lib/products/links";

/**
 * A phone's header (Products audit, 16 Oct 2026): beside the name and its
 * state, one ⋯ holding what the desk shows in a row — the shop page, with
 * why it doesn't open yet written under it rather than hidden, and the
 * switch to the Customer view.
 */
export function PhoneShopMenu({
    productId,
    storeId,
    view,
    shopUrl,
    note,
}: {
    productId: string;
    storeId: string;
    view: "team" | "customer";
    shopUrl: string | null;
    /** Why the shop page doesn't open; null when it does or isn't offered. */
    note: string | null;
}) {
    const base = productHref(storeId, productId);
    return (
        <span className="sm:hidden">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        label="Shop page and views"
                        icon={<MoreHorizontal />}
                        variant="ghost"
                        size="sm"
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    {shopUrl ? (
                        <DropdownMenuItem asChild>
                            <a
                                href={shopUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <ExternalLink />
                                View on the shop
                            </a>
                        </DropdownMenuItem>
                    ) : note ? (
                        <DropdownMenuItem disabled className="items-start">
                            <ExternalLink />
                            <span className="flex flex-col gap-0.5">
                                <span>View on the shop</span>
                                <span className="text-pretty text-[12px] leading-[1.4] text-muted-foreground">
                                    {note}
                                </span>
                            </span>
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem asChild>
                        <Link
                            href={
                                view === "customer"
                                    ? base
                                    : `${base}&view=customer`
                            }
                            scroll={false}
                        >
                            {view === "customer" ? <Users /> : <Eye />}
                            {view === "customer"
                                ? "Team view"
                                : "Customer view"}
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </span>
    );
}
