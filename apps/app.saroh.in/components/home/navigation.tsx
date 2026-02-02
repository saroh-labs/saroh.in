"use client";

import MaxWidthWrapper from "@/components/shared/max-width-wrapper";
import useScroll from "@/lib/hooks/use-scroll";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import { ThemeToggle } from "../common/ThemeToggle";

export const navItems = [
	{
		name: "Pricing",
		slug: "pricing",
	},
];

export default function Navigation() {
	const { domain = "saroh.in" } = useParams() as { domain: string };
	const scrolled = useScroll(80);
	const selectedLayout = useSelectedLayoutSegment();
	const helpCenter = selectedLayout === "help";

	return (
		<div
			className={cn(`sticky inset-x-0 top-0 z-30 w-full transition-all`, {
				"border-b border-gray-200 bg-white/75 dark:bg-inherit backdrop-blur-lg":
					scrolled,
				"border-b border-gray-200 dark:border-inherit bg-white dark:bg-inherit backdrop-blur-lg":
					selectedLayout,
				// &&
				// !SHOW_BACKGROUND_SEGMENTS.has(selectedLayout),
			})}
		>
			<MaxWidthWrapper
				{...(helpCenter && {
					className: "max-w-screen-lg",
				})}
			>
				<div className="flex h-14 items-center justify-between">
					<div className="flex items-center space-x-4">
						<Link
							href={
								domain === "saroh.in" ? "/" : `https://saroh.in`
							}
						>
							saroh
							{/* <LogoType /> */}
						</Link>
						{helpCenter ? (
							<div className="flex items-center">
								<div className="mr-3 h-5 border-l-2 border-gray-400" />
								<Link
									href="/help"
									className="font-display text-lg font-bold text-gray-700"
								>
									Help Center
								</Link>
							</div>
						) : (
							<div className="hidden items-center space-x-3 lg:flex">
								{navItems.map(({ name, slug }) => (
									<Link
										id={`nav-${slug}`}
										key={slug}
										href={
											domain === "saroh.in"
												? `/${slug}`
												: `https://saroh.in/${slug}`
										}
										{...(domain !== "saroh.in" &&
											{
												// onClick: () => {
												// 	va.track(
												// 		"Referred from custom domain",
												// 		{
												// 			domain,
												// 			medium: `navbar item (${slug})`,
												// 		},
												// 	);
												// },
											})}
										className={cn(
											"z-10 rounded-full px-4 py-1.5 text-sm font-medium capitalize text-gray-500 transition-colors ease-out hover:text-black hover:dark:text-white ",
											{
												"text-black":
													selectedLayout === slug,
											},
										)}
									>
										{name}
									</Link>
								))}
							</div>
						)}
					</div>
					<ThemeToggle />
				</div>
			</MaxWidthWrapper>
		</div>
	);
}
