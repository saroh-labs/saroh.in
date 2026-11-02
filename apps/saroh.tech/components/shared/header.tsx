import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { signInHref, signupHref } from "@/site.config";

import { ButtonLink } from "./button";
import { PhoneMenu } from "./phone-menu";

export const NAV = [
    { name: "Tools", href: "/tools" },
    { name: "Templates", href: "/templates" },
    { name: "Guides", href: "/guides" },
    { name: "Pricing", href: "/pricing" },
] as const;

/** Four items only; on a phone they go into a menu and "Start free" stays. */
export function Header() {
    return (
        <header className="sticky top-0 z-30 border-b border-line bg-paper">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-4 md:px-20">
                <Link
                    prefetch={false}
                    href="/"
                    aria-label="Saroh home"
                    className="flex min-h-11 items-center rounded-control no-underline"
                >
                    <Wordmark aria-hidden style={{ fontSize: 22 }} />
                </Link>
                <nav
                    aria-label="Main"
                    className="hidden items-center gap-7 text-[15px] font-medium no-underline md:flex"
                >
                    {NAV.map((item) => (
                        <Link
                            prefetch={false}
                            key={item.href}
                            href={item.href}
                            className="no-underline hover:underline hover:underline-offset-4"
                        >
                            {item.name}
                        </Link>
                    ))}
                </nav>
                <div className="flex items-center gap-2 md:gap-3.5">
                    <a
                        href={signInHref}
                        data-cta="sign-in"
                        className="hidden text-[15px] font-medium no-underline hover:underline hover:underline-offset-4 md:inline"
                    >
                        Sign in
                    </a>
                    <ButtonLink
                        look="compact"
                        href={signupHref("header")}
                        data-cta="start-free"
                    >
                        Start free
                    </ButtonLink>
                    <PhoneMenu items={NAV} signIn={signInHref} />
                </div>
            </div>
        </header>
    );
}
