"use client";

import { replaceLinks } from "@/lib/remark-plugins";
import { MDXRemote, MDXRemoteProps } from "next-mdx-remote";
// import { Tweet } from "react-tweet";
import BlurImage from "@/components/blur-image";

export default function MDX({ source }: { source: MDXRemoteProps }) {
	const components = {
		a: replaceLinks,
		BlurImage,
	};

	return (
		<article
			className={` prose prose-stone m-auto w-11/12 dark:prose-invert sm:prose-lg sm:w-3/4 `}
			suppressHydrationWarning={true}
		>
			{/* @ts-ignore */}
			<MDXRemote {...source} components={components} />
		</article>
	);
}
