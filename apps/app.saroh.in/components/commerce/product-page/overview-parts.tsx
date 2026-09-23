import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Small pieces the product page's Overview is built from. */

export function SectionTitle({
    title,
    aside,
    action,
}: {
    title: string;
    aside?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                {title}
            </h2>
            {aside ? (
                <p className="text-[12.5px] text-muted-foreground">{aside}</p>
            ) : null}
            {action ? <div className="ml-auto">{action}</div> : null}
        </div>
    );
}

export function EditLink({ href, label }: { href: string; label: string }) {
    return (
        <Button asChild variant="outline" size="sm">
            <Link href={href}>
                <Pencil aria-hidden />
                {label}
            </Link>
        </Button>
    );
}

export function LinkedCard({
    title,
    href,
    children,
}: {
    title: string;
    href: string;
    children: ReactNode;
}) {
    return (
        <Card className="flex min-w-0 flex-col gap-1 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {title}
                </p>
                <Link
                    href={href}
                    className="text-[12.5px] font-medium underline-offset-4 hover:underline"
                >
                    Open
                </Link>
            </div>
            {children}
        </Card>
    );
}

export function PanelLine({
    status,
    what,
}: {
    status: "failed" | "forbidden";
    what: string;
}) {
    return status === "failed" ? (
        <p role="alert" className="text-[12.5px] text-destructive">
            Couldn&apos;t load {what}. Everything else on this page is current.
        </p>
    ) : (
        <p className="text-[12.5px] text-muted-foreground">
            Your role can&apos;t see {what}.
        </p>
    );
}
