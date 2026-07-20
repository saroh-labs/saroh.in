"use client";
import { SparklesCore } from "../ui/sparkles";

export function SparklesPreview() {
    return (
        <div className="relative flex h-[40rem] w-full flex-col items-center justify-center overflow-hidden rounded-md bg-black">
            <div className="absolute inset-0 h-screen w-full">
                <SparklesCore
                    id="tsparticlesfullpage"
                    background="transparent"
                    minSize={0.6}
                    maxSize={1.4}
                    particleDensity={100}
                    className="h-full w-full"
                    particleColor="#FFFFFF"
                />
            </div>
            <h1 className="relative z-20 text-center text-3xl font-bold text-white md:text-7xl lg:text-6xl">
                Build great products <br />
                with{" "}
                <span className="bg-gradient-to-r from-blue-400 via-blue-600 to-blue-700 bg-clip-text text-transparent">
                    Saroh
                </span>
            </h1>
        </div>
    );
}
