"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Below 768px: the header's four items and Sign in, under one button. */
export function PhoneMenu({
    items,
    signIn,
}: {
    items: readonly { name: string; href: string }[];
    signIn: string;
}) {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const pathname = usePathname();
    const [shownFor, setShownFor] = useState(pathname);
    if (shownFor !== pathname) {
        setShownFor(pathname);
        setOpen(false);
    }

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            setOpen(false);
            button.current?.focus();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    return (
        <div className="md:hidden">
            <button
                ref={button}
                type="button"
                aria-label={open ? "Close menu" : "Menu"}
                aria-expanded={open}
                aria-controls="phone-menu"
                onClick={() => setOpen(!open)}
                className="grid size-11 cursor-pointer place-items-center rounded-button border border-strong bg-transparent text-ink"
            >
                <span aria-hidden="true" className="text-xl leading-none">
                    {open ? "×" : "≡"}
                </span>
            </button>
            {open ? (
                <nav
                    id="phone-menu"
                    aria-label="Main"
                    className="absolute inset-x-0 top-full border-b border-line bg-paper px-4 pb-4"
                >
                    {items.map((item) => (
                        <Link
                            prefetch={false}
                            key={item.href}
                            href={item.href}
                            className="flex h-14 items-center border-t border-line text-lg font-semibold no-underline"
                        >
                            {item.name}
                        </Link>
                    ))}
                    <a
                        href={signIn}
                        className="flex h-14 items-center border-t border-line text-lg font-semibold no-underline"
                    >
                        Sign in
                    </a>
                </nav>
            ) : null}
        </div>
    );
}
