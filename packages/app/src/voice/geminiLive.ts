import type { LiveConnector } from './voiceController';

/**
 * Connects to Gemini Live with the ephemeral token from voice.startSession.
 * The SDK is imported on demand so text-only sessions never download it.
 * Everything that matters (persona, voice, transcription) is locked into the
 * token server-side; the config here only has to agree with it.
 */
export const connectGeminiLive: LiveConnector = async (grant, callbacks) => {
  const { GoogleGenAI, Modality } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: grant.token, httpOptions: { apiVersion: 'v1alpha' } });
  return ai.live.connect({
    model: grant.model,
    config: { responseModalities: [Modality.AUDIO] },
    callbacks: {
      onmessage: (message) => callbacks.onmessage(message),
      onclose: (event) => callbacks.onclose({ code: event.code, reason: event.reason }),
      onerror: (event) => callbacks.onerror(event),
    },
  });
};
