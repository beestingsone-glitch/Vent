import React, { useState, useEffect } from 'react';
import { X, Phone, Video, Search, User, Shield, Radio, PhoneCall } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useChat } from '../context/ChatContext.tsx';
import { useCall } from '../context/CallContext.tsx';
import { PublicUser } from '../types.ts';

interface CallsModalProps {
  onClose: () => void;
}

export const CallsModal: React.FC<CallsModalProps> = ({ onClose }) => {
  const { user, token } = useAuth();
  const { conversations, onlineUserIds } = useChat();
  const { startCall } = useCall();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Extract direct chat participants
  const directContacts = conversations
    .filter((c) => c.type === 'direct')
    .map((c) => {
      const other = c.members.find((m) => m.user_id !== user?.id);
      return {
        id: other?.user_id || c.id,
        display_name: c.name || other?.display_name || 'Anonymous User',
        avatar_url: c.avatar_url || other?.avatar_url,
        isOnline: other ? onlineUserIds.includes(other.user_id) : false,
      };
    });

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || !token) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Failed to search users for call', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, token]);

  const handleInitiateCall = (targetUserId: string, targetName: string, isVideo: boolean) => {
    onClose();
    startCall(targetUserId, targetName, isVideo);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Encrypted Calls</h2>
              <p className="text-[11px] text-slate-400">P2P Voice & Video over WebRTC</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user to call..."
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
          {searchQuery.trim() ? (
            searchResults.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                {isSearching ? 'Searching...' : 'No users found'}
              </div>
            ) : (
              searchResults.map((usr) => (
                <div
                  key={usr.id}
                  className="p-3 flex items-center justify-between rounded-xl hover:bg-slate-800/60 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={
                        usr.avatar_url ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${usr.display_name}`
                      }
                      alt={usr.display_name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-700 bg-slate-800"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{usr.display_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{usr.bio || 'Encrypted User'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleInitiateCall(usr.id, usr.display_name, false)}
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 flex items-center justify-center transition cursor-pointer"
                      title="Audio Call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleInitiateCall(usr.id, usr.display_name, true)}
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-500/30 flex items-center justify-center transition cursor-pointer"
                      title="Video Call"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )
          ) : directContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-2">
              <Shield className="w-8 h-8 text-slate-600 mx-auto" />
              <p>No recent contacts yet.</p>
              <p className="text-[11px] text-slate-500">
                Search for a pseudonym above or start a chat to make a voice/video call.
              </p>
            </div>
          ) : (
            directContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-3 flex items-center justify-between rounded-xl hover:bg-slate-800/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={
                        contact.avatar_url ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${contact.display_name}`
                      }
                      alt={contact.display_name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-700 bg-slate-800"
                    />
                    {contact.isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{contact.display_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {contact.isOnline ? (
                        <span className="text-emerald-400">Online & Ready</span>
                      ) : (
                        'Available'
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleInitiateCall(contact.id, contact.display_name, false)}
                    className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 flex items-center justify-center transition cursor-pointer"
                    title="Start Audio Call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleInitiateCall(contact.id, contact.display_name, true)}
                    className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-500/30 flex items-center justify-center transition cursor-pointer"
                    title="Start Video Call"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Note */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Peer-to-peer audio and video are end-to-end encrypted.</span>
        </div>
      </div>
    </div>
  );
};
