import Link from "next/link";
import { SiGithub } from "react-icons/si";
export default function Header() {
    return (
        <header className=" border-b py-4 ">
            <div className="mx-auto flex max-w-screen-2xl items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href={"/"}
                        className="mr-4 font-mono text-xl font-bold"
                    >
                        saroh/ui
                    </Link>
                    {links.map((link) => (
                        <Link
                            href={link.href}
                            key={link.title}
                            className="text-md text-muted-foreground hover:text-primary font-medium transition-colors hover:underline "
                        >
                            {link.title}
                        </Link>
                    ))}
                </div>
                <div>
                    <Link
                        href="https://github.com/himohitmehta/saroh.io"
                        target="_blank"
                        title="Github"
                    >
                        <SiGithub />
                    </Link>
                </div>
            </div>
        </header>
    );
}

const links = [
    {
        title: "Docs",
        href: "/docs",
    },
    {
        title: "Components",
        href: "/components",
    },
    {
        title: "Charts",
        href: "/charts",
    },
    {
        title: "Templates",
        href: "/templates",
    },
];
