import React from 'react';
import { Phone, PhoneOff, Video, Shield } from 'lucide-react';
import { useCall } from '../context/CallContext.tsx';

export const IncomingCallModal: React.FC = () => {
  const { callState, callType, peerInfo, acceptCall, rejectCall } = useCall();

  if (callState !== 'ringing' || !peerInfo) return null;

  return (
    <div
      id="incoming-call-modal"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="bg-slate-900 border border-indigo-500/30 w-full max-w-sm rounded-3xl p-6 shadow-2xl shadow-indigo-950/50 text-center flex flex-col items-center relative overflow-hidden">
        {/* Glowing Background Ring */}
        <div className="absolute -top-12 -left-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Security Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-[11px] font-medium mb-4">
          <Shield className="w-3 h-3 text-indigo-400" />
          <span>Encrypted WebRTC P2P Call</span>
        </div>

        {/* Pulsing Avatar Container */}
        <div className="relative mb-4">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
          <div className="relative w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-xl">
            <img
              src={
                peerInfo.avatarUrl ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${peerInfo.displayName}`
              }
              alt={peerInfo.displayName}
              className="w-full h-full rounded-full object-cover bg-slate-800"
            />
          </div>
        </div>

        {/* Caller Info */}
        <h3 className="text-xl font-bold text-white tracking-tight mb-1">
          {peerInfo.displayName}
        </h3>
        <p className="text-xs text-cyan-300 font-medium flex items-center gap-1 mb-6">
          {callType === 'video' ? (
            <>
              <Video className="w-3.5 h-3.5 text-cyan-400" />
              <span>Incoming Vent Video Call...</span>
            </>
          ) : (
            <>
              <Phone className="w-3.5 h-3.5 text-cyan-400" />
              <span>Incoming Vent Audio Call...</span>
            </>
          )}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-6 w-full justify-center">
          {/* Decline */}
          <button
            id="btn-decline-call"
            type="button"
            onClick={() => rejectCall('Declined by user')}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-slate-400 group-hover:text-rose-300 transition">
              Decline
            </span>
          </button>

          {/* Accept */}
          <button
            id="btn-accept-call"
            type="button"
            onClick={acceptCall}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition animate-bounce">
              {callType === 'video' ? (
                <Video className="w-6 h-6" />
              ) : (
                <Phone className="w-6 h-6" />
              )}
            </div>
            <span className="text-xs font-semibold text-slate-400 group-hover:text-emerald-300 transition">
              Accept
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
