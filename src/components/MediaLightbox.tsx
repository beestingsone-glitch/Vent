import React, { useEffect } from 'react';
import { X, Download, Maximize2, FileText, Calendar, User } from 'lucide-react';
import { MediaType } from '../types.ts';

interface MediaLightboxProps {
  mediaUrl: string;
  mediaType: MediaType;
  mediaName?: string;
  senderName?: string;
  timestamp?: string;
  onClose: () => void;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  mediaUrl,
  mediaType,
  mediaName,
  senderName,
  timestamp,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-150">
      {/* Top Bar */}
      <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="text-white flex items-center gap-3">
          <div>
            <h4 className="text-sm font-semibold truncate max-w-xs sm:max-w-md">
              {mediaName || 'Media File'}
            </h4>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              {senderName && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {senderName}
                </span>
              )}
              {timestamp && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={mediaUrl}
            download={mediaName || 'download'}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Download file"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition cursor-pointer"
            title="Close viewer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl max-h-[80vh] w-full flex items-center justify-center p-2">
        {mediaType === 'image' && (
          <img
            src={mediaUrl}
            alt={mediaName || 'Fullscreen view'}
            className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl"
          />
        )}

        {mediaType === 'video' && (
          <video
            src={mediaUrl}
            controls
            autoPlay
            className="max-h-[75vh] max-w-full rounded-xl shadow-2xl"
          />
        )}

        {mediaType === 'audio' && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md text-center">
            <audio src={mediaUrl} controls autoPlay className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
};
