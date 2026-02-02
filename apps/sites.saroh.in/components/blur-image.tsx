/* eslint-disable jsx-a11y/alt-text */
"use client";

import cn from "clsx";
import Image, { ImageProps } from "next/image";
import { useState } from "react";


export default function BlurImage({ props }: { props: ImageProps }) {
	const [isLoading, setLoading] = useState(true);

	return (
		<Image
			className={cn(
				props.className,
				"duration-700 ease-in-out",
				isLoading ? "scale-105 blur-lg" : "scale-100 blur-0",
			)}
			onLoadingComplete={() => setLoading(false)}
			{...props}
		/>
	);
}
