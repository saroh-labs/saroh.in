import Navbar from "@/components/app/navbar";
import MaxWidthWrapper from "@/components/shared/max-width-wrapper";
import React from "react";

export default function HomeLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div>
			<Navbar />
			<MaxWidthWrapper>{children}</MaxWidthWrapper>
		</div>
	);
}
