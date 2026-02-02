import Navbar from "@/components/app/navbar";
import MaxWidthWrapper from "@/components/shared/max-width-wrapper";
import { ReactNode } from "react";

export default function SiteLayout({ children }: { children: ReactNode }) {
	return (
		<div>
			{" "}
			<Navbar />
			<MaxWidthWrapper>
				<div className="flex max-w-screen-xl flex-col space-y-12 p-8">
					<div className="flex flex-col space-y-6">{children}</div>
				</div>
			</MaxWidthWrapper>
		</div>
	);
}
