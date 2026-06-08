"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTarotVisionCardBySlug,
  shouldLockDetection,
  type DetectionCandidate,
} from "@taro/vision-core";

type ConfirmedCard = {
  id: string;
  position: number;
  cardName: string;
  generatedText: string | null;
};

type TimelineEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
};

type VisionDetectionCandidate = {
  cardId: number;
  cardSlug: string;
  cardName: string;
  confidence: number;
  boundingBox: DetectionCandidate["boundingBox"];
  source: DetectionCandidate["source"];
  isValid: boolean;
  timestamp: number | string;
};

type LiveSignal = {
  id: string;
  eventType: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
};

const isSessionDescription = (value: unknown): value is RTCSessionDescriptionInit =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  "sdp" in value &&
  typeof (value as RTCSessionDescriptionInit).type === "string" &&
  typeof (value as RTCSessionDescriptionInit).sdp === "string";

const isIceCandidate = (value: unknown): value is RTCIceCandidateInit =>
  typeof value === "object" && value !== null && "candidate" in value;

export function HostLiveRoom({
  readingId,
  roomCode,
  cards,
  confirmedCards,
  initialStatus,
  initialEvents,
}: {
  readingId: string;
  roomCode: string;
  cards: Array<{ slug: string; name: string }>;
  confirmedCards: ConfirmedCard[];
  initialStatus: "DRAFT" | "LIVE" | "FINISHED" | "CANCELED";
  initialEvents: TimelineEvent[];
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteGuestVideoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteGuestStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const handledSignalIdsRef = useRef<Set<string>>(new Set());

  const [status, setStatus] = useState("Preparando câmera");
  const [selectedCardSlug, setSelectedCardSlug] = useState(cards[0]?.slug ?? "");
  const [position, setPosition] = useState(1);
  const [confidence, setConfidence] = useState(0.91);
  const [history, setHistory] = useState<DetectionCandidate[]>([]);
  const [locked, setLocked] = useState(false);
  const [script, setScript] = useState(
    confirmedCards.map(item => item.generatedText).filter(Boolean).join("\n\n"),
  );
  const [savedCards, setSavedCards] = useState(confirmedCards);
  const [readingStatus, setReadingStatus] = useState(
    initialStatus === "DRAFT" ? "LIVE" : initialStatus,
  );
  const [timeline, setTimeline] = useState(initialEvents);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [hasRemoteGuestVideo, setHasRemoteGuestVideo] = useState(false);
  const [remoteGuestStatus, setRemoteGuestStatus] = useState("Consulente sem câmera");

  const appendTimeline = useCallback((eventType: string, payload?: Record<string, unknown>) => {
    setTimeline(current => [
      {
        id: `${eventType}-${Date.now()}`,
        eventType,
        payload: payload ?? null,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
  }, []);

  const persistEvent = useCallback(async (eventType: string, payload?: Record<string, unknown>) => {
    appendTimeline(eventType, payload);
    await fetch(`/api/readings/${readingId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventType, payload }),
    });
  }, [appendTimeline, readingId]);

  const postLiveSignal = useCallback(async (
    eventType: string,
    payload?: Record<string, unknown>,
  ) => {
    await fetch(`/api/readings/${readingId}/signals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventType, payload }),
    });
  }, [readingId]);

  const persistStatus = useCallback(async (nextStatus: "DRAFT" | "LIVE" | "FINISHED" | "CANCELED") => {
    await fetch(`/api/readings/${readingId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: nextStatus }),
    });
    appendTimeline("reading.status_changed", { status: nextStatus });
  }, [appendTimeline, readingId]);

  useEffect(() => {
    let cancelled = false;

    async function bootCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Este navegador não oferece suporte à câmera.");
        return;
      }

      const videoConstraints = { facingMode: { ideal: "environment" } };
      const attempts: MediaStreamConstraints[] = [
        { video: videoConstraints, audio: true },
        { video: videoConstraints, audio: false },
      ];

      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);

          if (cancelled) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }

          streamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }

          setIsCameraReady(true);
          setStatus(
            constraints.audio
              ? "Câmera e microfone ativos. Aguardando cliente."
              : "Câmera ativa sem microfone. Aguardando cliente.",
          );
          return;
        } catch (error) {
          console.error(error);
        }
      }

      setIsCameraReady(false);
      setStatus("Permissão negada ou câmera indisponível. Libere câmera e microfone no navegador.");
    }

    void bootCamera();
    if (initialStatus !== "FINISHED" && initialStatus !== "CANCELED") {
      void fetch(`/api/readings/${readingId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "LIVE" }),
      });
    }
    void fetch(`/api/readings/${readingId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "host.room_opened",
        payload: { roomCode },
      }),
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      setIsCameraReady(false);
    };
  }, [initialStatus, readingId, roomCode]);

  useEffect(() => {
    if (!isCameraReady || !streamRef.current) return;
    let cancelled = false;
    const mountedAt = Date.now();

    const ensurePeer = () => {
      if (peerRef.current) return peerRef.current;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      streamRef.current?.getTracks().forEach(track => {
        peer.addTrack(track, streamRef.current as MediaStream);
      });

      const hasVideoSender = peer.getSenders().some(sender => sender.track?.kind === "video");
      const hasAudioSender = peer.getSenders().some(sender => sender.track?.kind === "audio");
      if (!hasVideoSender) {
        peer.addTransceiver("video", { direction: "recvonly" });
      }
      if (!hasAudioSender) {
        peer.addTransceiver("audio", { direction: "recvonly" });
      }

      peer.getTransceivers().forEach(transceiver => {
        if (transceiver.sender.track) {
          transceiver.direction = "sendrecv";
        }
      });

      remoteGuestStreamRef.current = new MediaStream();
      peer.ontrack = event => {
        const [remoteStream] = event.streams;
        const guestStream = remoteStream ?? remoteGuestStreamRef.current;
        if (!guestStream) return;

        if (!remoteStream && !guestStream.getTracks().some(track => track.id === event.track.id)) {
          guestStream.addTrack(event.track);
        }

        if (remoteGuestVideoRef.current) {
          remoteGuestVideoRef.current.srcObject = guestStream;
          void remoteGuestVideoRef.current.play().catch(() => {
            setRemoteGuestStatus("Consulente conectado. Toque no vídeo para liberar áudio.");
          });
        }

        if (event.track.kind === "video") {
          setHasRemoteGuestVideo(true);
          setRemoteGuestStatus("Consulente conectado");
        }
        if (event.track.kind === "audio") {
          setRemoteGuestStatus("Consulente com áudio conectado");
        }
      };

      peer.onicecandidate = event => {
        if (event.candidate) {
          void postLiveSignal("live.host_ice_candidate", {
            roomCode,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      peerRef.current = peer;
      return peer;
    };

    const sendOffer = async () => {
      if (
        peerRef.current &&
        (peerRef.current.remoteDescription || peerRef.current.signalingState !== "stable")
      ) {
        peerRef.current.close();
        peerRef.current = null;
        remoteGuestStreamRef.current = null;
        setHasRemoteGuestVideo(false);
        pendingIceCandidatesRef.current = [];
      }

      const peer = ensurePeer();
      if (peer.signalingState !== "stable") return;

      setStatus("Cliente conectado. Enviando oferta WebRTC.");
      void persistEvent("guest.joined_realtime", { roomCode });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await postLiveSignal("live.webrtc_offer", { roomCode, offer });
    };

    const flushPendingIceCandidates = async (peer: RTCPeerConnection) => {
      const candidates = pendingIceCandidatesRef.current.splice(0);
      for (const candidate of candidates) {
        await peer.addIceCandidate(candidate);
      }
    };

    const handleSignal = async (signal: LiveSignal) => {
      if (handledSignalIdsRef.current.has(signal.id)) return;
      if (Date.parse(signal.createdAt) < mountedAt) return;
      handledSignalIdsRef.current.add(signal.id);

      if (signal.eventType === "live.guest_ready") {
        const mediaKind = signal.payload?.mediaKind;
        setRemoteGuestStatus(
          mediaKind === "none"
            ? "Consulente sem câmera"
            : "Consulente entrando com câmera",
        );
        await sendOffer();
        return;
      }

      if (signal.eventType === "live.webrtc_answer") {
        const answer = signal.payload?.answer;
        if (!isSessionDescription(answer)) return;

        const peer = ensurePeer();
        await peer.setRemoteDescription(answer);
        await flushPendingIceCandidates(peer);
        setStatus("Conexão com cliente estabelecida.");
        void persistEvent("webrtc.answer_received", { roomCode });
        return;
      }

      if (signal.eventType === "live.guest_ice_candidate") {
        const candidate = signal.payload?.candidate;
        if (!isIceCandidate(candidate)) return;

        const peer = ensurePeer();
        if (peer.remoteDescription) {
          await peer.addIceCandidate(candidate);
        } else {
          pendingIceCandidatesRef.current.push(candidate);
        }
      }
    };

    const pollSignals = async () => {
      if (cancelled) return;

      try {
        const response = await fetch(`/api/readings/${readingId}/signals`, {
          cache: "no-store",
        });

        if (response.ok) {
          const signals = (await response.json()) as LiveSignal[];
          for (const signal of signals) {
            await handleSignal(signal);
          }
        }
      } finally {
        if (!cancelled) {
          window.setTimeout(pollSignals, 1000);
        }
      }
    };

    void postLiveSignal("live.host_ready", { roomCode });
    void pollSignals();

    return () => {
      cancelled = true;
      void postLiveSignal("live.peer_left", { roomCode, role: "host" });
      void persistEvent("host.room_closed", { roomCode });
      peerRef.current?.close();
      peerRef.current = null;
      remoteGuestStreamRef.current = null;
      setHasRemoteGuestVideo(false);
      setRemoteGuestStatus("Consulente sem câmera");
      pendingIceCandidatesRef.current = [];
    };
  }, [isCameraReady, persistEvent, postLiveSignal, readingId, roomCode]);

  const simulateStableFrame = () => {
    const selectedCard = getTarotVisionCardBySlug(selectedCardSlug);
    const candidate: DetectionCandidate = {
      cardId: selectedCard?.id ?? 0,
      cardSlug: selectedCardSlug,
      cardName: selectedCard?.title ?? selectedCardSlug,
      confidence,
      boundingBox: {
        x: 120,
        y: 80,
        width: 220,
        height: 340,
      },
      source: "manual",
      isValid: Boolean(selectedCard),
      timestamp: Date.now(),
    };

    setHistory(current => {
      const next = [...current, candidate];
      const isLocked = shouldLockDetection(next);
      if (isLocked) {
        setLocked(true);
        setStatus(`Carta ${selectedCardSlug} travada por estabilidade.`);
        void postLiveSignal("live.card_locked", {
          roomCode,
          cardSlug: selectedCardSlug,
          confidence,
        });
        void persistEvent("reading.card_locked", {
          roomCode,
          cardSlug: selectedCardSlug,
          confidence,
        });
      }
      return next;
    });
  };

  const detectCurrentFrame = async () => {
    const video = localVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setStatus("Vídeo ainda não está pronto para captura.");
      return;
    }

    const canvas = captureCanvasRef.current ?? document.createElement("canvas");
    captureCanvasRef.current = canvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setStatus("Canvas indisponível para captura.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

    setIsDetecting(true);
    setStatus("Enviando frame para análise.");

    try {
      const response = await fetch("/api/vision/detect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64,
          cardHint: selectedCardSlug,
        }),
      });

      if (!response.ok) {
        setStatus("Vision service indisponível.");
        return;
      }

      const detections = (await response.json()) as VisionDetectionCandidate[];
      const rawCandidate = detections[0];
      const candidate = rawCandidate
        ? {
            ...rawCandidate,
            timestamp:
              typeof rawCandidate.timestamp === "string"
                ? Date.parse(rawCandidate.timestamp)
                : rawCandidate.timestamp,
          }
        : null;
      if (!candidate) {
        setStatus("Nenhuma carta detectada.");
        return;
      }

      setSelectedCardSlug(candidate.cardSlug);
      setConfidence(candidate.confidence);
      setStatus(`Frame analisado para ${candidate.cardSlug}.`);
      setHistory(current => {
        const next = [...current, candidate];
        const isLocked = shouldLockDetection(next);
        if (isLocked) {
          setLocked(true);
          void postLiveSignal("live.card_locked", {
            roomCode,
            cardSlug: candidate.cardSlug,
            confidence: candidate.confidence,
          });
          void persistEvent("reading.card_locked", {
            roomCode,
            cardSlug: candidate.cardSlug,
            confidence: candidate.confidence,
          });
        }
        return next;
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const resetDetection = () => {
    setHistory([]);
    setLocked(false);
  };

  const confirmCard = async () => {
    const response = await fetch(`/api/readings/${readingId}/cards/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cardSlug: selectedCardSlug,
        position,
        orientation: "UPRIGHT",
        confidence,
      }),
    });

    if (!response.ok) {
      setStatus("Falha ao confirmar carta.");
      return;
    }

    const payload = await response.json();
    const nextCard = {
      id: payload.id,
      position: payload.position,
      cardName: payload.card.name,
      generatedText: payload.generatedText,
    };

    setSavedCards(current => [...current.filter(item => item.position !== nextCard.position), nextCard]);
    setScript(current => [current, payload.generatedText].filter(Boolean).join("\n\n"));
    setPosition(current => current + 1);
    setHistory([]);
    setLocked(false);
    setStatus(`Carta ${payload.card.name} confirmada.`);

    void postLiveSignal("live.card_confirmed", {
      roomCode,
      cardName: payload.card.name,
      position: payload.position,
    });
  };

  const showSessionTimeline = false;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        <div className="glass-panel relative overflow-hidden rounded-[28px]">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="aspect-[4/5] w-full bg-stone-950 object-cover"
          />
          <div className="absolute bottom-4 right-4 w-[42%] max-w-72 overflow-hidden rounded-[18px] border border-stone-100/30 bg-stone-950 shadow-2xl">
            <div className="absolute left-3 top-3 z-10 rounded-full bg-stone-950/80 px-3 py-1 text-xs font-medium text-stone-50">
              Consulente
            </div>
            <video
              ref={remoteGuestVideoRef}
              autoPlay
              playsInline
              className={`aspect-video w-full object-cover ${hasRemoteGuestVideo ? "block" : "hidden"}`}
            />
            {!hasRemoteGuestVideo ? (
              <div className="flex aspect-video items-center justify-center px-4 text-center text-sm text-stone-200">
                {remoteGuestStatus}
              </div>
            ) : null}
          </div>
        </div>

        <div className="glass-panel rounded-[28px] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-amber-700">Host room</p>
              <h3 className="text-xl font-semibold text-stone-950">Detecção e confirmação</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-stone-900 px-3 py-1 text-xs text-stone-50">
                {status}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">
                Sessão {readingStatus}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-stone-700">
              Carta simulada
              <select
                className="field"
                value={selectedCardSlug}
                onChange={event => setSelectedCardSlug(event.target.value)}
              >
                {cards.map(card => (
                  <option key={card.slug} value={card.slug}>
                    {card.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-stone-700">
              Posição
              <input
                className="field"
                min={1}
                type="number"
                value={position}
                onChange={event => setPosition(Number(event.target.value))}
              />
            </label>

            <label className="space-y-2 text-sm text-stone-700">
              Confiança
              <input
                className="field"
                max={1}
                min={0}
                step={0.01}
                type="number"
                value={confidence}
                onChange={event => setConfidence(Number(event.target.value))}
              />
            </label>

            <div className="rounded-[20px] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              Frames acumulados: <strong>{history.length}</strong>
              <br />
              Estado: <strong>{locked ? "travado" : "analisando"}</strong>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="secondary-button"
              disabled={isDetecting}
              onClick={detectCurrentFrame}
              type="button"
            >
              {isDetecting ? "Analisando..." : "Detectar frame atual"}
            </button>
            <button className="secondary-button" onClick={simulateStableFrame} type="button">
              Simular frame
            </button>
            <button className="secondary-button" onClick={resetDetection} type="button">
              Limpar buffer
            </button>
            <button className="primary-button" disabled={!locked} onClick={confirmCard} type="button">
              Confirmar carta
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setReadingStatus("FINISHED");
                void persistStatus("FINISHED");
              }}
              type="button"
            >
              Encerrar leitura
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="glass-panel rounded-[28px] p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-700">Teleprompter privado</p>
          <div className="mt-4 max-h-[34rem] overflow-y-auto rounded-[24px] bg-stone-950 p-5 text-lg leading-8 text-stone-100">
            {script || "Confirme a primeira carta para gerar o texto oral."}
          </div>
        </div>

        <div className="glass-panel rounded-[28px] p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-700">Histórico confirmado</p>
          <div className="mt-4 space-y-3">
            {savedCards.length ? (
              savedCards
                .sort((a, b) => a.position - b.position)
                .map(card => (
                  <div
                    key={card.id}
                    className="rounded-[20px] border border-stone-200 bg-stone-50 p-4"
                  >
                    <strong className="text-stone-900">
                      {card.position}. {card.cardName}
                    </strong>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      {card.generatedText || "Sem texto gerado."}
                    </p>
                  </div>
                ))
            ) : (
              <p className="text-sm text-stone-600">Nenhuma carta confirmada ainda.</p>
            )}
          </div>
        </div>

        {showSessionTimeline ? (
          <div className="glass-panel rounded-[28px] p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-700">Timeline da sessão</p>
            <div className="mt-4 space-y-3">
              {timeline.length ? (
                timeline.slice(0, 8).map(event => (
                  <div key={event.id} className="rounded-[20px] bg-stone-50 p-4">
                    <strong className="text-sm text-stone-900">{event.eventType}</strong>
                    <p className="mt-1 text-xs text-stone-500">
                      {new Date(event.createdAt).toLocaleString("pt-BR")}
                    </p>
                    {event.payload ? (
                      <pre className="mt-2 overflow-x-auto text-xs text-stone-600">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-600">Sem eventos persistidos ainda.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
