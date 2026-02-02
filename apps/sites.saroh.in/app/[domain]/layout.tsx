// import Image from "next/image";
import prisma from "@/lib/prisma";
import Link from "next/link";
// import CTA from "@/components/cta";
import { getSiteData } from "@/lib/fetchers";
import { fontMapper } from "@/styles/fonts";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata | null> {
    const { domain } = await params;
    const data = await getSiteData(domain);
    if (!data) {
        return null;
    }
    const {
        name: title,
        description,
        image,
        logo,
    } = data as {
        name: string;
        description: string;
        image: string;
        logo: string;
    };

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            images: [image],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
            creator: "@vercel",
        },
        icons: [logo],
        metadataBase: new URL(`https://${domain}`),
    };
}

export async function generateStaticParams() {
    const [subdomains, customDomains] = await Promise.all([
        prisma.site.findMany({
            select: {
                subdomain: true,
            },
        }),
        prisma.site.findMany({
            where: {
                NOT: {
                    customDomain: null,
                },
            },
            select: {
                customDomain: true,
            },
        }),
    ]);

    const allPaths = [
        ...subdomains.map(({ subdomain }) => subdomain),
        ...customDomains.map(({ customDomain }) => customDomain),
    ].filter((path) => path) as Array<string>;

    return allPaths.map((domain) => ({
        params: {
            domain,
        },
    }));
}

export default async function SiteLayout({
    params,
    children,
}: {
    params: Promise<{ domain: string }>;
    children: React.ReactNode;
}) {
    const { domain } = await params;
    const data = await getSiteData(domain);

    if (!data) {
        notFound();
    }

    // Optional: Redirect to custom domain if it exists
    if (
        domain.endsWith(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) &&
        data.customDomain &&
        process.env.REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS === "true"
    ) {
        return redirect(`https://${data.customDomain}`);
    }

    return (
        <div className={fontMapper[data.font]}>
            <div className="ease left-0 right-0 top-0 z-30 flex h-16 bg-white transition-all duration-150 dark:bg-black dark:text-white">
                <div className="mx-auto flex h-full max-w-screen-xl items-center justify-center space-x-5 px-10 sm:px-20">
                    <Link href="/" className="flex items-center justify-center">
                        <div className="inline-block h-8 w-8 overflow-hidden rounded-full align-middle">
                            {/* <Image
								alt={"logo"}
								height={40}
								src={"/vercel.svg"}
								width={40}
							/> */}
                        </div>
                        <span className="font-title ml-3 inline-block truncate font-medium">
                            {data.name}
                        </span>
                    </Link>
                </div>
            </div>

            <div className="mt-20">{children}</div>

            {/* {params.domain == `demo.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` ||
			params.domain == `saroh.site` ? (
				<CTA />
			) : (
				<ReportAbuse />
			)} */}
        </div>
    );
}
