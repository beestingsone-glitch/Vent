import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  CallType,
  CallState,
  CallPeerInfo,
  CallInvitePayload,
  WSMessage,
  WebRTCSignalPayload,
} from '../types.ts';
import { useAuth } from './AuthContext.tsx';

interface CallContextType {
  callState: CallState;
  callType: CallType;
  peerInfo: CallPeerInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  callDuration: number;
  formattedDuration: string;
  startCall: (
    targetUserId: string,
    targetDisplayName: string,
    targetAvatarUrl?: string,
    conversationId?: string,
    type?: CallType
  ) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// ICE Servers for WebRTC NAT traversal
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// Zero-asset Web Audio Synthesized Ringtones
class AudioRingtoneManager {
  private ctx: AudioContext | null = null;
  private intervalId: any = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public startIncomingRingtone() {
    this.stop();
    const playTone = () => {
      try {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Pleasant chime notes: E5 -> G#5 -> B5 -> E6
        const notes = [659.25, 830.61, 987.77, 1318.51];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);

          gain.gain.setValueAtTime(0.12, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.35);
        });
      } catch (err) {
        // Audio might be blocked without prior user interaction
      }
    };

    playTone();
    this.intervalId = setInterval(playTone, 2400);
  }

  public startOutgoingRingback() {
    this.stop();
    const playRingback = () => {
      try {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Standard ringback dual-tone (440Hz + 480Hz)
        [440, 480].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.05, now + 1.2);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 1.3);
        });
      } catch (err) {
        // ignore
      }
    };

    playRingback();
    this.intervalId = setInterval(playRingback, 3500);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public playHangupTone() {
    this.stop();
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // ignore
    }
  }
}

const ringtones = new AudioRingtoneManager();

// Create fallback audio/video stream in case device doesn't have camera/mic
function createFallbackMediaStream(callType: CallType): MediaStream {
  const stream = new MediaStream();

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const dst = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = 0.001; // Silent carrier
    osc.connect(gain);
    gain.connect(dst);
    osc.start();
    dst.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch (e) {
    console.warn('Could not generate fallback audio track', e);
  }

  if (callType === 'video') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const cCtx = canvas.getContext('2d')!;

      // Draw subtle animated ring pattern on canvas
      let frame = 0;
      const draw = () => {
        cCtx.fillStyle = '#0f172a';
        cCtx.fillRect(0, 0, canvas.width, canvas.height);

        // Animated rings
        cCtx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        cCtx.lineWidth = 4;
        cCtx.beginPath();
        const r = 40 + Math.sin(frame * 0.05) * 15;
        cCtx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
        cCtx.stroke();

        cCtx.fillStyle = '#94a3b8';
        cCtx.font = '20px sans-serif';
        cCtx.textAlign = 'center';
        cCtx.fillText('Vent Live Camera', canvas.width / 2, canvas.height / 2 + 80);

        frame++;
        requestAnimationFrame(draw);
      };
      draw();

      const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(25) : null;
      if (canvasStream) {
        canvasStream.getVideoTracks().forEach((track: MediaStreamTrack) => stream.addTrack(track));
      }
    } catch (e) {
      console.warn('Could not generate fallback video track', e);
    }
  }

  return stream;
}

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();

  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('audio');
  const [peerInfo, setPeerInfo] = useState<CallPeerInfo | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Keep localStreamRef synced
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Duration timer
  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCallDuration(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  const formattedDuration = `${Math.floor(callDuration / 60)
    .toString()
    .padStart(2, '0')}:${(callDuration % 60).toString().padStart(2, '0')}`;

  // Acquire media stream (microphone / camera)
  const acquireMedia = async (type: CallType): Promise<MediaStream> => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn('getUserMedia denied or not available, using fallback media stream', err);
      const fallback = createFallbackMediaStream(type);
      setLocalStream(fallback);
      return fallback;
    }
  };

  // Cleanup helper
  const cleanupCall = useCallback(() => {
    ringtones.stop();

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }

    setRemoteStream(null);
    setCallState('idle');
    setPeerInfo(null);
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  // Send signaling helper over shared websocket connection
  const sendSignal = useCallback((type: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  // Initialize or connect dedicated signaling WebSocket
  useEffect(() => {
    if (!token || !user) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', payload: { token } }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg: WSMessage<any> = JSON.parse(event.data);

        switch (msg.type) {
          case 'call_invite': {
            const invite: CallInvitePayload = msg.payload;
            if (invite.toUserId !== user.id) return;

            // Incoming call
            setPeerInfo({
              userId: invite.fromUserId,
              displayName: invite.fromDisplayName,
              avatarUrl: invite.fromAvatarUrl,
              conversationId: invite.conversationId,
            });
            setCallType(invite.callType);
            setCallState('ringing');
            ringtones.startIncomingRingtone();
            break;
          }

          case 'call_accepted': {
            if (callState === 'calling' && peerInfo) {
              ringtones.stop();
              setCallState('connected');

              // Setup RTCPeerConnection and create offer
              const pc = createPeerConnection(peerInfo.userId);
              peerConnectionRef.current = pc;

              const stream = localStreamRef.current || (await acquireMedia(callType));
              stream.getTracks().forEach((track) => pc.addTrack(track, stream));

              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);

              sendSignal('webrtc_offer', {
                toUserId: peerInfo.userId,
                sdp: offer,
              });
            }
            break;
          }

          case 'call_rejected': {
            ringtones.playHangupTone();
            alert(`Call declined: ${msg.payload?.reason || 'User busy'}`);
            cleanupCall();
            break;
          }

          case 'call_ended': {
            ringtones.playHangupTone();
            cleanupCall();
            break;
          }

          case 'webrtc_offer': {
            const signal: WebRTCSignalPayload = msg.payload;
            if (!peerConnectionRef.current && peerInfo) {
              const pc = createPeerConnection(signal.fromUserId);
              peerConnectionRef.current = pc;

              const stream = localStreamRef.current || (await acquireMedia(callType));
              stream.getTracks().forEach((track) => pc.addTrack(track, stream));

              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              sendSignal('webrtc_answer', {
                toUserId: signal.fromUserId,
                sdp: answer,
              });
            }
            break;
          }

          case 'webrtc_answer': {
            const signal: WebRTCSignalPayload = msg.payload;
            if (peerConnectionRef.current) {
              await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(signal.sdp)
              );
            }
            break;
          }

          case 'webrtc_ice_candidate': {
            const signal: WebRTCSignalPayload = msg.payload;
            if (peerConnectionRef.current && signal.candidate) {
              try {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(signal.candidate)
                );
              } catch (err) {
                console.warn('Error adding ICE candidate', err);
              }
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Call signal handling error', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [token, user?.id, callState, peerInfo, callType, cleanupCall, sendSignal]);

  const createPeerConnection = (targetUserId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal('webrtc_ice_candidate', {
          toUserId: targetUserId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        const stream = new MediaStream();
        stream.addTrack(e.track);
        setRemoteStream(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanupCall();
      }
    };

    return pc;
  };

  // Start outgoing call
  const startCall = async (
    targetUserId: string,
    targetDisplayName: string,
    targetAvatarUrl?: string,
    conversationId?: string,
    type: CallType = 'audio'
  ) => {
    if (!user) return;

    setCallType(type);
    setPeerInfo({
      userId: targetUserId,
      displayName: targetDisplayName,
      avatarUrl: targetAvatarUrl,
      conversationId,
    });
    setCallState('calling');
    ringtones.startOutgoingRingback();

    // Prepare local media
    await acquireMedia(type);

    // Send invite signal
    sendSignal('call_invite', {
      toUserId: targetUserId,
      fromUserId: user.id,
      fromDisplayName: user.display_name,
      fromAvatarUrl: user.avatar_url,
      conversationId,
      callType: type,
    });
  };

  // Accept incoming call
  const acceptCall = async () => {
    if (!peerInfo || !user) return;

    ringtones.stop();
    setCallState('connected');

    const stream = await acquireMedia(callType);

    const pc = createPeerConnection(peerInfo.userId);
    peerConnectionRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    sendSignal('call_accepted', {
      toUserId: peerInfo.userId,
      fromUserId: user.id,
      conversationId: peerInfo.conversationId,
    });
  };

  // Reject incoming call
  const rejectCall = (reason = 'Call declined') => {
    if (peerInfo) {
      sendSignal('call_rejected', {
        toUserId: peerInfo.userId,
        reason,
      });
    }
    cleanupCall();
  };

  // End active call
  const endCall = () => {
    if (peerInfo) {
      sendSignal('call_ended', {
        toUserId: peerInfo.userId,
      });
    }
    ringtones.playHangupTone();
    cleanupCall();
  };

  // Audio mute toggle
  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Video camera toggle
  const toggleCamera = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff(!isCameraOff);
    }
  };

  return (
    <CallContext.Provider
      value={{
        callState,
        callType,
        peerInfo,
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        callDuration,
        formattedDuration,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
