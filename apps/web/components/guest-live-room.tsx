"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export function GuestLiveRoom({
  roomCode,
  realtimeServerUrl,
  guestToken,
}: {
  roomCode: string;
  realtimeServerUrl: string;
  guestToken: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState("Conectando à sala");
  const [lastUpdate, setLastUpdate] = useState("Aguardando leitura ao vivo.");

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

    const socket = io(realtimeServerUrl, {
      transports: ["websocket"],
    });
    socketRef.current = socket;

    const ensurePeer = () => {
      if (peerRef.current) return peerRef.current;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peer.ontrack = event => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        }
        setStatus("Vídeo conectado.");
      };

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

    socket.emit("room:join", { roomCode, role: "guest" });

    socket.on("webrtc:offer", async ({ offer }) => {
      const peer = ensurePeer();
      await peer.setRemoteDescription(offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("webrtc:answer", { roomCode, answer });
      setStatus("Oferta recebida. Finalizando conexão.");
    });

    socket.on("webrtc:ice-candidate", async ({ candidate }) => {
      const peer = ensurePeer();
      if (candidate) {
        await peer.addIceCandidate(candidate);
      }
    });

    socket.on("reading:card-confirmed", ({ cardName, position }) => {
      setLastUpdate(`Carta ${position}: ${cardName}`);
    });

    socket.on("reading:card-locked", ({ cardSlug }) => {
      setStatus("Carta em análise.");
      setLastUpdate(`Reconhecimento estável para ${cardSlug}.`);
    });

    socket.on("room:host-ready", () => {
      setStatus("Host pronto para iniciar.");
    });

    socket.on("room:peer-left", ({ role }) => {
      setStatus(role === "host" ? "Host desconectado." : "Convidado desconectado.");
    });

    return () => {
      socket.disconnect();
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, [guestToken, realtimeServerUrl, roomCode]);

  return (
    <div className="space-y-5">
      <div className="glass-panel overflow-hidden rounded-[28px]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="aspect-video w-full bg-stone-950 object-cover"
        />
      </div>

      <div className="glass-panel rounded-[28px] p-5">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-700">Sala do consulente</p>
        <h3 className="mt-3 text-2xl font-semibold text-stone-950">{status}</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {lastUpdate} Esta tela nunca recebe teleprompter, notas internas ou confiança da IA.
        </p>
      </div>
    </div>
  );
}
