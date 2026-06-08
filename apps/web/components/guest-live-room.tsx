"use client";

import { useEffect, useRef, useState } from "react";

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

export function GuestLiveRoom({
  roomCode,
  guestToken,
}: {
  roomCode: string;
  guestToken: string;
}) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localPreviewRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const handledSignalIdsRef = useRef<Set<string>>(new Set());
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const hasJoinedLiveRef = useRef(false);
  const [status, setStatus] = useState("Conectando à sala");
  const [lastUpdate, setLastUpdate] = useState("Aguardando leitura ao vivo.");
  const [mediaStatus, setMediaStatus] = useState("Aguardando permissão de câmera e microfone.");
  const [isStartingMedia, setIsStartingMedia] = useState(false);
  const [isLocalCameraReady, setIsLocalCameraReady] = useState(false);
  const [hasJoinedLive, setHasJoinedLive] = useState(false);

  useEffect(() => {
    if (!isLocalCameraReady || !localPreviewRef.current || !localStreamRef.current) return;

    localPreviewRef.current.srcObject = localStreamRef.current;
    void localPreviewRef.current.play();
  }, [isLocalCameraReady]);

  useEffect(() => {
    void fetch(`/api/guest/${guestToken}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "guest.room_opened",
        payload: {
          roomCode,
        },
      }),
    });

    let cancelled = false;
    const mountedAt = Date.now();

    const postLiveSignal = async (eventType: string, payload?: Record<string, unknown>) => {
      await fetch(`/api/guest/${guestToken}/signals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventType, payload }),
      });
    };

    const ensurePeer = () => {
      if (peerRef.current) return peerRef.current;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peer.ontrack = event => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          void remoteVideoRef.current.play().catch(() => {
            setStatus("Vídeo recebido. Toque no player para iniciar.");
          });
        }
        setStatus("Vídeo conectado.");
      };

      peer.onicecandidate = event => {
        if (event.candidate) {
          void postLiveSignal("live.guest_ice_candidate", {
            roomCode,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      peerRef.current = peer;
      return peer;
    };

    const attachLocalStreamToPeer = (peer: RTCPeerConnection) => {
      const stream = localStreamRef.current;
      if (!stream) return;

      const existingTrackIds = new Set(
        peer.getSenders().map(sender => sender.track?.id).filter(Boolean),
      );

      stream.getTracks().forEach(track => {
        if (!existingTrackIds.has(track.id)) {
          peer.addTrack(track, stream);
        }
      });
    };

    const flushPendingIceCandidates = async (peer: RTCPeerConnection) => {
      const candidates = pendingIceCandidatesRef.current.splice(0);
      for (const candidate of candidates) {
        await peer.addIceCandidate(candidate);
      }
    };

    const answerOffer = async (offer: RTCSessionDescriptionInit) => {
      const peer = ensurePeer();
      if (peer.remoteDescription) return;

      attachLocalStreamToPeer(peer);
      await peer.setRemoteDescription(offer);
      await flushPendingIceCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await postLiveSignal("live.webrtc_answer", { roomCode, answer });
      setStatus("Oferta recebida. Finalizando conexão.");
    };

    const handleSignal = async (signal: LiveSignal) => {
      if (handledSignalIdsRef.current.has(signal.id)) return;
      if (Date.parse(signal.createdAt) < mountedAt) return;
      handledSignalIdsRef.current.add(signal.id);

      if (signal.eventType === "live.host_ready") {
        if (hasJoinedLiveRef.current) {
          await postLiveSignal("live.guest_ready", {
            roomCode,
            mediaEnabled: Boolean(localStreamRef.current),
            mediaKind: localStreamRef.current?.getAudioTracks().length
              ? "audio-video"
              : localStreamRef.current?.getVideoTracks().length
                ? "video-only"
                : "none",
          });
          setStatus("Host pronto. Conectando mídia.");
          return;
        }
        setStatus("Host pronto. Entre com câmera e microfone para iniciar.");
        return;
      }

      if (signal.eventType === "live.webrtc_offer") {
        const offer = signal.payload?.offer;
        if (isSessionDescription(offer)) {
          if (hasJoinedLiveRef.current) {
            await answerOffer(offer);
          } else {
            pendingOfferRef.current = offer;
            setStatus("Host pronto. Aguardando sua entrada com câmera e microfone.");
          }
        }
        return;
      }

      if (signal.eventType === "live.host_ice_candidate") {
        const candidate = signal.payload?.candidate;
        if (!isIceCandidate(candidate)) return;

        const peer = ensurePeer();
        if (peer.remoteDescription) {
          await peer.addIceCandidate(candidate);
        } else {
          pendingIceCandidatesRef.current.push(candidate);
        }
        return;
      }

      if (signal.eventType === "live.card_locked") {
        const cardSlug = signal.payload?.cardSlug;
        setStatus("Carta em análise.");
        setLastUpdate(`Reconhecimento estável para ${String(cardSlug ?? "carta")}.`);
        return;
      }

      if (signal.eventType === "live.card_confirmed") {
        const cardName = signal.payload?.cardName;
        const position = signal.payload?.position;
        setLastUpdate(`Carta ${String(position ?? "")}: ${String(cardName ?? "confirmada")}`);
        return;
      }

      if (signal.eventType === "live.peer_left" && signal.payload?.role === "host") {
        setStatus("Host desconectado.");
      }
    };

    const pollSignals = async () => {
      if (cancelled) return;

      try {
        const response = await fetch(`/api/guest/${guestToken}/signals`, {
          cache: "no-store",
        });

        if (response.ok) {
          const signals = (await response.json()) as LiveSignal[];
          for (const signal of signals) {
            await handleSignal(signal);
          }
        } else {
          setStatus("Não foi possível acessar a sala ao vivo.");
        }
      } finally {
        if (!cancelled) {
          window.setTimeout(pollSignals, 1000);
        }
      }
    };

    void pollSignals();

    return () => {
      cancelled = true;
      void postLiveSignal("live.peer_left", { roomCode, role: "guest" });
      peerRef.current?.close();
      peerRef.current = null;
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      pendingIceCandidatesRef.current = [];
    };
  }, [guestToken, roomCode]);

  const startGuestMedia = async () => {
    if (hasJoinedLive || hasJoinedLiveRef.current || isStartingMedia) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Navegador sem suporte à câmera e microfone.");
      setMediaStatus("Este navegador não oferece suporte à captura de mídia.");
      hasJoinedLiveRef.current = true;
      setHasJoinedLive(true);
      await fetch(`/api/guest/${guestToken}/signals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: "live.guest_ready",
          payload: { roomCode, mediaEnabled: false, mediaKind: "none" },
        }),
      });
      return;
    }

    setIsStartingMedia(true);
    const attempts: Array<{ constraints: MediaStreamConstraints; mediaKind: "audio-video" | "video-only" }> = [
      { constraints: { video: true, audio: true }, mediaKind: "audio-video" },
      { constraints: { video: true, audio: false }, mediaKind: "video-only" },
    ];

    try {
      for (const attempt of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
          localStreamRef.current = stream;

          setIsLocalCameraReady(true);
          setStatus("Câmera do consulente ativa. Conectando ao host.");
          setMediaStatus(
            attempt.mediaKind === "audio-video"
              ? "Câmera e microfone ativos."
              : "Câmera ativa sem microfone.",
          );

          if (peerRef.current) {
            stream.getTracks().forEach(track => {
              peerRef.current?.addTrack(track, stream);
            });
          }

          hasJoinedLiveRef.current = true;
          setHasJoinedLive(true);
          await fetch(`/api/guest/${guestToken}/signals`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              eventType: "live.guest_ready",
              payload: { roomCode, mediaEnabled: true, mediaKind: attempt.mediaKind },
            }),
          });

          return;
        } catch (error) {
          console.error(error);
        }
      }

      setStatus("Permissão negada ou câmera indisponível.");
      setMediaStatus("Você entrou sem câmera e microfone.");
      hasJoinedLiveRef.current = true;
      setHasJoinedLive(true);
      await fetch(`/api/guest/${guestToken}/signals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: "live.guest_ready",
          payload: { roomCode, mediaEnabled: false, mediaKind: "none" },
        }),
      });
    } finally {
      setIsStartingMedia(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-panel overflow-hidden rounded-[28px]">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          controls
          className="aspect-video w-full bg-stone-950 object-cover"
        />
      </div>

      <div className="glass-panel rounded-[28px] p-5">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-700">Sala do consulente</p>
        <h3 className="mt-3 text-2xl font-semibold text-stone-950">{status}</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {lastUpdate} Esta tela nunca recebe teleprompter, notas internas ou confiança da IA.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="primary-button"
            disabled={isStartingMedia || hasJoinedLive}
            onClick={startGuestMedia}
            type="button"
          >
            {isStartingMedia ? "Abrindo câmera..." : "Entrar com câmera e microfone"}
          </button>
          <span className="text-sm text-stone-600">{mediaStatus}</span>
        </div>
        {isLocalCameraReady ? (
          <div className="mt-5 max-w-56 overflow-hidden rounded-[18px] bg-stone-950">
            <video
              ref={localPreviewRef}
              autoPlay
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
