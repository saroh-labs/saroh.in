"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Eye } from "lucide-react";

import { PaperPreview } from "../new-invoice/paper-preview";
import type { PaperProps } from "../new-invoice/paper-props";

/** "Vivek Nair · Brew Lane" → "Vivek". */
export function firstName(name: string | null): string | null {
    const first = name?.trim().split(/[\s·]+/)[0];
    return first === undefined || first === "" ? null : first;
}

/**
 * "See it as Vivek will" (INVNewEdit): the paper with nothing to press and
 * no labels, in the look it will go out in, as the PDF and the pay page
 * draw it from the same rule (`paperColours`, every Rule 46 particular in
 * every style). The number is given on issue, so it says so.
 */
export function SeeAsCustomer({
    paper,
    className,
}: {
    paper: PaperProps;
    className?: string;
}) {
    const who = firstName(paper.buyer.name);
    const label = who
        ? `See it as ${who} will`
        : "See it as your customer will";
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" className={className}>
                    <Eye aria-hidden className="size-4" />
                    {label}
                </Button>
            </DialogTrigger>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>
                        {who
                            ? `As ${who} will see it`
                            : "As your customer will see it"}
                    </DialogTitle>
                    <DialogDescription>
                        The invoice as its PDF and pay page show it. Issuing
                        gives it its number.
                    </DialogDescription>
                </DialogHeader>
                <PaperPreview {...paper} />
            </DialogContent>
        </Dialog>
    );
}
