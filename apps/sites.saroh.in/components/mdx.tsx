"use client";

import { replaceLinks } from "@/lib/remark-plugins";
import type { MDXRemoteProps } from "next-mdx-remote";
import { MDXRemote } from "next-mdx-remote";
// import { Tweet } from "react-tweet";
import BlurImage from "@/components/blur-image";

export default function MDX({ source }: { source: MDXRemoteProps }) {
    const components = {
        a: replaceLinks,
        BlurImage,
        // Examples,
        // Tweet,
    };

    return (
        <article
            className={`prose-md prose prose-stone m-auto w-11/12 dark:prose-invert sm:prose-lg sm:w-3/4`}
            suppressHydrationWarning={true}
        >
            <MDXRemote {...source} components={components} />
        </article>
    );
}
