"use client";

import { useModal } from "@/components/modal/provider";
import { ReactNode } from "react";

export default function CreateSiteButton({
	children,
}: {
	children: ReactNode;
}) {
	const modal = useModal();
	const handleClick = () => {
		modal?.show(children);
		console.log({ modal }, "modal clicked");
	};
	return (
		<button
			onClick={() => handleClick()}
			className="rounded-lg border border-black bg-black px-4 py-1.5 text-sm font-medium text-white transition-all hover:bg-white hover:text-black active:bg-stone-100 dark:border-stone-700 dark:hover:border-stone-200 dark:hover:bg-black dark:hover:text-white dark:active:bg-stone-800"
		>
			Create New Site
		</button>
	);
}
