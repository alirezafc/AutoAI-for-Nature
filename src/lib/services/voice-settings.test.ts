import { describe, expect, it } from "vitest";
import { resolveVoiceSettings, VOICE_STATUS } from "./voice";

describe("Voice Agent settings contract (regression: empty/fake settings panel)", () => {
  it("missing DB row resolves to safe defaults (panel never blank)", () => {
    expect(resolveVoiceSettings(null)).toEqual({ ragEnabled: true, systemPrompt: "", temperature: 50 });
    expect(resolveVoiceSettings(undefined)).toEqual({ ragEnabled: true, systemPrompt: "", temperature: 50 });
  });

  it("exposes EXACTLY the fields the V1 implementation consumes — no fake config", () => {
    const settings = resolveVoiceSettings({
      ragEnabled: false,
      systemPrompt: "custom",
      temperature: 30,
    });
    expect(Object.keys(settings).sort()).toEqual(["ragEnabled", "systemPrompt", "temperature"]);
    expect(settings).toEqual({ ragEnabled: false, systemPrompt: "custom", temperature: 30 });
  });

  it("ignores legacy unused columns (stt/tts/llm provider+model, voice, speed, greeting, saving)", () => {
    const settings = resolveVoiceSettings({
      // @ts-expect-error deliberately passing legacy fields that must be dropped
      sttProvider: "azure",
      llmModel: "gpt-4o",
      speed: 1.5,
      greeting: "hi",
      ragEnabled: true,
    });
    expect(settings).toEqual({ ragEnabled: true, systemPrompt: "", temperature: 50 });
  });

  it("status reflects the browser Web Speech reality and supported languages", () => {
    expect(VOICE_STATUS.stt).toBe("browser-web-speech");
    expect(VOICE_STATUS.tts).toBe("browser-web-speech");
    expect(VOICE_STATUS.languages).toEqual(["en", "fa"]);
    // Conversation persistence is NOT part of the current /api/voice flow.
    expect(VOICE_STATUS.conversationSaving).toBe(false);
  });
});
