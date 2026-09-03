import React from 'react';
import { X, Users, Lock, Calendar } from 'lucide-react';
import { Conversation } from '../types.ts';
import { useChat } from '../context/ChatContext.tsx';
import { useI18n } from '../i18n.tsx';

interface GroupInfoModalProps {
  conversation: Conversation;
  onClose: () => void;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({ conversation, onClose }) => {
  const { onlineUserIds } = useChat();
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">{t('room_settings')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Group Profile */}
        <div className="p-6 text-center border-b border-slate-800 bg-slate-950/40">
          <img
            src={
              conversation.avatar_url ||
              `https://api.dicebear.com/7.x/identicon/svg?seed=${conversation.name || conversation.id}`
            }
            alt={conversation.name || 'Group'}
            className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border-2 border-cyan-500/40 shadow-lg"
          />
          <h2 className="text-base font-bold text-white">{conversation.name}</h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            Created on {new Date(conversation.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Isolation Notice */}
        <div className="p-3 bg-cyan-950/30 border-b border-cyan-500/20 text-cyan-200 text-xs flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Member identities are protected with zero-knowledge pseudonyms.</span>
        </div>

        {/* Members List */}
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {t('members')} ({conversation.members.length})
          </div>

          <div className="space-y-1.5">
            {conversation.members.map((member) => {
              const isOnline = onlineUserIds.includes(member.user_id);
              return (
                <div
                  key={member.user_id}
                  className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative shrink-0">
                      <img
                        src={
                          member.avatar_url ||
                          `https://api.dicebear.com/7.x/identicon/svg?seed=${member.display_name}`
                        }
                        alt={member.display_name}
                        className="w-8 h-8 rounded-full object-cover border border-slate-700"
                      />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {member.display_name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Joined {new Date(member.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      isOnline
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {isOnline ? t('online') : t('offline')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
