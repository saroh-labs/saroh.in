import Navbar from "@/components/app/navbar";
import NavTabs from "@/components/app/navbar/nav-tabs";
import MaxWidthWrapper from "@/components/shared/max-width-wrapper";
import React, { ReactNode } from "react";

interface DashboardLayoutProps {
	children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
	return (
		<div>
			
			{/* <NavTabs /> */}
			{children}
			{/* <MaxWidthWrapper>{children}</MaxWidthWrapper> */}
		</div>
	);
}
