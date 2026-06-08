"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
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

export function HostLiveRoom({
  readingId,
  roomCode,
  cards,
  confirmedCards,
  realtimeServerUrl,
  initialStatus,
  initialEvents,
}: {
  readingId: string;
  roomCode: string;
  cards: Array<{ slug: string; name: string }>;
  confirmedCards: ConfirmedCard[];
  realtimeServerUrl: string;
  initialStatus: "DRAFT" | "LIVE" | "FINISHED" | "CANCELED";
  initialEvents: TimelineEvent[];
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: true,
        });

        if (cancelled) return;
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setStatus("Câmera ativa. Aguardando cliente.");
      } catch (error) {
        console.error(error);
        setStatus("Não foi possível acessar a câmera.");
      }
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
    };
  }, [initialStatus, readingId, roomCode]);

  useEffect(() => {
    const socket = io(realtimeServerUrl, {
      transports: ["websocket"],
    });
    socketRef.current = socket;

    const ensurePeer = () => {
      if (peerRef.current) return peerRef.current;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      streamRef.current?.getTracks().forEach(track => {
        peer.addTrack(track, streamRef.current as MediaStream);
      });

      peer.onicecandidate = event => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", {
            roomCode,
            candidate: event.candidate,
          });
        }
      };

      peerRef.current = peer;
      return peer;
    };

    socket.emit("room:create", { roomCode });

    socket.on("room:guest-joined", async () => {
      setStatus("Cliente conectado. Enviando oferta WebRTC.");
      void persistEvent("guest.joined_realtime", { roomCode });
      const peer = ensurePeer();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("webrtc:offer", { roomCode, offer });
    });

    socket.on("webrtc:answer", async ({ answer }) => {
      const peer = ensurePeer();
      await peer.setRemoteDescription(answer);
      setStatus("Conexão com cliente estabelecida.");
      void persistEvent("webrtc.answer_received", { roomCode });
    });

    socket.on("webrtc:ice-candidate", async ({ candidate }) => {
      const peer = ensurePeer();
      if (candidate) {
        await peer.addIceCandidate(candidate);
      }
    });

    return () => {
      void persistEvent("host.room_closed", { roomCode });
      socket.disconnect();
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, [persistEvent, realtimeServerUrl, roomCode]);

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
        socketRef.current?.emit("reading:card-locked", {
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
          socketRef.current?.emit("reading:card-locked", {
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

    socketRef.current?.emit("reading:card-confirmed", {
      roomCode,
      cardName: payload.card.name,
      position: payload.position,
      });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        <div className="glass-panel overflow-hidden rounded-[28px]">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="aspect-[4/5] w-full bg-stone-950 object-cover"
          />
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
      </div>
    </div>
  );
}
