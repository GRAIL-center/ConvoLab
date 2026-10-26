import { useQuery } from '@tanstack/react-query';
import type {
  VoiceExchange,
  VoiceState,
  VoiceStatusEvent,
  VoiceTranscribeContext,
} from '@workspace/api/src/voice/contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTRPC, useTRPCClient } from '../api/trpc';
import { PcmPlayer, startMicCapture } from './audio';
import { connectGeminiLive } from './geminiLive';
import {
  type LiveTurn,
  NO_LIVE_TURN,
  type TurnTranscript,
  VoiceController,
  type VoiceError,
} from './voiceController';

export interface VoiceMode {
  /** The server can offer voice. False hides every voice control. */
  available: boolean;
  /** A voice session is running (any state but disconnected). */
  active: boolean;
  state: VoiceState;
  /** Mic input level, 0-1, for the level meter. */
  level: number;
  /** The exchange in flight, shown in the transcript until it is sent. */
  liveTurn: LiveTurn;
  error: VoiceError | null;
  start: () => void;
  stop: () => void;
  toggleMute: () => void;
  dismissError: () => void;
}

export function useVoiceMode(args: {
  sessionId: string;
  /** False keeps voice off entirely (e.g. study sessions, not yet approved). */
  enabled: boolean;
  sendVoiceExchange: (exchange: VoiceExchange) => void;
  sendVoiceStatus: (event: VoiceStatusEvent) => void;
  transcribeVoiceTurn: (
    audio: string,
    context: VoiceTranscribeContext
  ) => Promise<TurnTranscript | null>;
}): VoiceMode {
  const { sessionId, enabled, sendVoiceExchange, sendVoiceStatus, transcribeVoiceTurn } = args;
  const trpc = useTRPC();
  const client = useTRPCClient();
  const availability = useQuery({
    ...trpc.voice.available.queryOptions(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [active, setActive] = useState(false);
  const [state, setState] = useState<VoiceState>('disconnected');
  const [level, setLevel] = useState(0);
  const [liveTurn, setLiveTurn] = useState<LiveTurn>(NO_LIVE_TURN);
  const [error, setError] = useState<VoiceError | null>(null);
  const controllerRef = useRef<VoiceController | null>(null);

  // The controller outlives renders; read the latest senders through refs.
  const sendExchangeRef = useRef(sendVoiceExchange);
  const sendStatusRef = useRef(sendVoiceStatus);
  const transcribeRef = useRef(transcribeVoiceTurn);
  sendExchangeRef.current = sendVoiceExchange;
  sendStatusRef.current = sendVoiceStatus;
  transcribeRef.current = transcribeVoiceTurn;

  const start = useCallback(() => {
    if (controllerRef.current) return;
    setError(null);
    setActive(true);
    const controller = new VoiceController({
      getGrant: () => client.voice.startSession.mutate({ sessionId }),
      connect: connectGeminiLive,
      createPlayer: () => new PcmPlayer(),
      startMic: startMicCapture,
      onExchange: (exchange) => sendExchangeRef.current(exchange),
      transcribe: (audio, context) => transcribeRef.current(audio, context),
      onStatus: (event) => sendStatusRef.current(event),
      onState: setState,
      onLevel: setLevel,
      onLiveTurn: setLiveTurn,
      onFatal: (voiceError) => {
        controllerRef.current = null;
        setActive(false);
        setLevel(0);
        setError(voiceError);
      },
    });
    controllerRef.current = controller;
    void controller.start();
  }, [client, sessionId]);

  const stop = useCallback(() => {
    controllerRef.current?.stop();
    controllerRef.current = null;
    setActive(false);
    setLevel(0);
  }, []);

  const toggleMute = useCallback(() => {
    controllerRef.current?.setMuted(state !== 'muted');
  }, [state]);

  // Leaving the page ends voice; the mic must never stay open behind it.
  useEffect(() => () => controllerRef.current?.stop(), []);

  return {
    available: enabled && availability.data?.available === true,
    active,
    state,
    level,
    liveTurn,
    error,
    start,
    stop,
    toggleMute,
    dismissError: () => setError(null),
  };
}
