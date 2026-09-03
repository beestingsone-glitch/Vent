import React, { useEffect, useRef, useState } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  Shield,
  Volume2,
  Radio,
} from 'lucide-react';
import { useCall } from '../context/CallContext.tsx';

export const ActiveCallModal: React.FC = () => {
  const {
    callState,
    callType,
    peerInfo,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    formattedDuration,
    endCall,
    toggleMute,
    toggleCamera,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isMinimized, setIsMinimized] = useState(false);

  // Bind local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState === 'idle' || callState === 'ringing' || !peerInfo) return null;

  return (
    <div
      id="active-call-overlay"
      className={`fixed z-50 transition-all duration-300 ${
        isMinimized
          ? 'bottom-6 right-6 w-72 h-44 rounded-2xl shadow-2xl overflow-hidden border border-indigo-500/40 bg-slate-900'
          : 'inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4'
      }`}
    >
      {/* Hidden audio element for WebRTC audio playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div
        className={`bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative ${
          isMinimized ? 'w-full h-full' : 'w-full max-w-3xl h-[85vh] max-h-[700px]'
        }`}
      >
        {/* Top Header Bar */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={
                  peerInfo.avatarUrl ||
                  `https://api.dicebear.com/7.x/identicon/svg?seed=${peerInfo.displayName}`
                }
                alt={peerInfo.displayName}
                className="w-8 h-8 rounded-full object-cover border border-slate-700"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>{peerInfo.displayName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 font-normal">
                  <Shield className="w-2.5 h-2.5" /> P2P Call
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {callState === 'calling' ? (
                  <span className="text-indigo-400 animate-pulse">Calling peer...</span>
                ) : (
                  <span className="text-emerald-400 font-semibold">{formattedDuration}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="btn-toggle-minimize-call"
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title={isMinimized ? 'Expand window' : 'Minimize to PiP'}
            >
              {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Call Stage */}
        <div className="flex-1 relative bg-slate-950 flex items-center justify-center overflow-hidden">
          {callType === 'video' ? (
            <>
              {/* Remote Video Feed */}
              {remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain bg-slate-950"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <div className="relative">
                    <img
                      src={
                        peerInfo.avatarUrl ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${peerInfo.displayName}`
                      }
                      alt={peerInfo.displayName}
                      className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500/50 shadow-2xl"
                    />
                    <div className="absolute inset-0 rounded-full border border-indigo-400/40 animate-ping" />
                  </div>
                  <p className="text-sm text-slate-300 font-medium">
                    {callState === 'calling'
                      ? 'Waiting for answer...'
                      : 'Connecting video stream...'}
                  </p>
                </div>
              )}

              {/* Local Video (Picture-in-Picture in bottom corner) */}
              {!isMinimized && (
                <div className="absolute bottom-4 right-4 w-40 h-28 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl z-20">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
                  />
                  {isCameraOff && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400">
                      <VideoOff className="w-6 h-6 mb-1 text-slate-500" />
                      <span className="text-[10px]">Camera Off</span>
                    </div>
                  )}
                  <div className="absolute bottom-1 left-2 text-[10px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-xs font-semibold">
                    You
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Audio Call Ambient Visualization */
            <div className="flex flex-col items-center justify-center p-8 text-center relative w-full h-full">
              <div className="absolute inset-0 bg-radial from-indigo-950/30 to-transparent pointer-events-none" />

              {/* Pulsing Avatar */}
              <div className="relative mb-6">
                <div
                  className={`absolute -inset-4 rounded-full bg-indigo-500/10 ${
                    callState === 'connected' ? 'animate-pulse' : 'animate-ping'
                  }`}
                />
                <img
                  src={
                    peerInfo.avatarUrl ||
                    `https://api.dicebear.com/7.x/identicon/svg?seed=${peerInfo.displayName}`
                  }
                  alt={peerInfo.displayName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-indigo-500/40 shadow-2xl relative z-10 bg-slate-900"
                />
              </div>

              <h2 className="text-2xl font-bold text-white mb-1 z-10">{peerInfo.displayName}</h2>
              <p className="text-xs text-slate-400 mb-6 z-10">
                {callState === 'calling'
                  ? 'Calling anonymous peer...'
                  : 'Encrypted P2P Voice Connected'}
              </p>

              {/* Animated Voice Waveform Simulation */}
              {callState === 'connected' && (
                <div className="flex items-center gap-1.5 h-10 mb-4 z-10">
                  {[40, 75, 50, 95, 60, 85, 30, 70, 90, 45, 80, 60].map((height, i) => (
                    <div
                      key={i}
                      className="w-1 bg-indigo-400/80 rounded-full animate-pulse"
                      style={{
                        height: `${height}%`,
                        animationDuration: `${0.6 + (i % 4) * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Control Toolbar */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-center gap-4 z-10">
          {/* Mute Mic */}
          <button
            id="btn-toggle-mute"
            type="button"
            onClick={toggleMute}
            className={`p-3.5 rounded-2xl transition cursor-pointer flex items-center justify-center ${
              isMuted
                ? 'bg-rose-950 text-rose-300 border border-rose-500/40 hover:bg-rose-900'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Toggle Video */}
          <button
            id="btn-toggle-camera"
            type="button"
            onClick={toggleCamera}
            className={`p-3.5 rounded-2xl transition cursor-pointer flex items-center justify-center ${
              isCameraOff
                ? 'bg-rose-950 text-rose-300 border border-rose-500/40 hover:bg-rose-900'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
            }`}
            title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* End Call */}
          <button
            id="btn-end-call"
            type="button"
            onClick={endCall}
            className="px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
            {!isMinimized && <span>End Call</span>}
          </button>
        </div>
      </div>
    </div>
  );
};
