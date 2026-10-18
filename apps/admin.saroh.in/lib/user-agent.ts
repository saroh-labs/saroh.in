/** A user agent, shortened to the browser and system a person would recognise. */
export function describeAgent(agent: string | null): string {
    if (!agent) return "Unknown device";
    const browser = agent.includes("Edg/")
        ? "Edge"
        : agent.includes("Chrome/")
          ? "Chrome"
          : agent.includes("Firefox/")
            ? "Firefox"
            : agent.includes("Safari/")
              ? "Safari"
              : "A browser";
    const system = /iPhone|iPad/.test(agent)
        ? "iOS"
        : agent.includes("Android")
          ? "Android"
          : agent.includes("Mac OS X")
            ? "macOS"
            : agent.includes("Windows")
              ? "Windows"
              : agent.includes("Linux")
                ? "Linux"
                : "an unknown system";
    return `${browser} on ${system}`;
}
