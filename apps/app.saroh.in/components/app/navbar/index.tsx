// import { UserButton, auth } from "@clerk/nextjs";

import StoreSwitcher from "./store-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserNav } from "./user-nav";
// import prismadb from "@/lib/prismadb";
import MaxWidthWrapper from "@/components/shared/max-width-wrapper";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import NavTabs from "./nav-tabs";

const Navbar = async () => {
	// const { userId } = auth();
	const session = await getSession();
	const name = session?.user.name!;
	const userName = session?.user.username!;
	

	const email = session?.user.email!;
	const avatarUrl = session?.user.image!;
	// if (!userId) {
	// 	redirect("/sign-in");
	// }

	//   const stores = await prismadb.store.findMany({
	//     where: {
	//       userId,
	//     }
	//   });
	const stores = [
		{ name: "project1", id: "1" },
		{ name: "project2", id: "2" },
	];

	return (
		<div className="border-b dark:border-gray-800 ">
			<MaxWidthWrapper>
				<div className="flex items-center h-16 px-4">
					<Link href={"/"} className="font-bold text-lg px-4">saroh</Link>
					<StoreSwitcher items={stores} />
					{/* <MainNav className="mx-6" /> */}
					<div className="flex items-center ml-auto space-x-4">
						<ThemeToggle />
						{/* <UserButton afterSignOutUrl="/" /> */}
						<UserNav
							avatarUrl={avatarUrl}
							email={email || userName}
							name={name}
							// userName={userName}
						/>
					</div>
				</div>
				<NavTabs />
			</MaxWidthWrapper>
		</div>
	);
};

export default Navbar;
