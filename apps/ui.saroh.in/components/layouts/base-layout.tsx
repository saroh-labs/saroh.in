import React from "react";
import Footer from "../shared/footer";
import Header from "../shared/header";

export default function BaseLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div>
            <Header />
            <div className="mx-auto max-w-screen-2xl">{children}</div>
            <Footer />
        </div>
    );
}
