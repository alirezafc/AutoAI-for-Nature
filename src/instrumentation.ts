export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { applyAiConnections } = await import("./lib/services/ai-connections");
      await applyAiConnections();
    } catch (err) {
      console.warn("AutoAI: failed to apply stored AI connections at boot", err);
    }
  }
}
