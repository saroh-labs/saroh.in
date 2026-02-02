"use client";

import Link from "next/link";
import { useParams, useSelectedLayoutSegments } from "next/navigation";
import React from "react";

let tabs = [
	{
		name: "Dashboard",
		href: "/",
		key: "dashboard",
	},
	// {
	// 	name: "Sites",
	// 	href: "/sites",
	// 	key: "sites",
	// },
	{
		name: "Settings",
		href: "/settings",
		key: "settings",
	},
];

export default function NavTabs() {
	const segments = useSelectedLayoutSegments();
	const params = useParams();
	const siteId = params.subdomain;
	const postTab = [
		{
			name: "Site",
			href: `/${siteId}`,
			key: siteId,
		},
		{
			name: "Settings",
			href: `/${siteId}/settings`,
			key: "post-settings",
		},
	];
	const filteredTabs = tabs.filter((item) => item.key !== "sites");
	const tabsWithPosts = siteId ? postTab : tabs;

	console.log({ segments });
	return (
		<div className="-mb-0.5 flex h-12 items-center justify-start space-x-2 overflow-x-auto scrollbar-hide">
			{tabsWithPosts.map(({ name, href, key }) => (
				<Link
					key={href}
					href={href}
					className={`border-b-2 p-1 ${
						// hacky approach to getting the current tab – will replace with useSelectedLayoutSegments when upgrading to Next.js App Router
						// router.asPath
						// 	.split("?")[0]
						// 	.split("/")
						// 	.slice(0, slug ? 3 : 2)
						// 	.join("/") === href
						segments[0] === key ||
						(key === "dashboard" && segments.length === 0) ||
						key === params.subdomain
							? "border-black text-black dark:text-gray-300 dark:border-white  dark:hover:text-white"
							: "border-transparent text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white"
					}`}
				>
					<div className="px-3 py-2 transition-all duration-75 rounded-md hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-600 dark:active:bg-gray-200 dark:active:text-white ">
						<p className="text-sm">{name}</p>
					</div>
				</Link>
			))}
		</div>
	);
}
