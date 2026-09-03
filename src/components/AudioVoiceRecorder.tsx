import React, { useState, useEffect, useRef } from 'react';
import { Mic, Trash2, Send, AlertCircle } from 'lucide-react';
import { useChat } from '../context/ChatContext.tsx';
import { useI18n } from '../i18n.tsx';

interface AudioVoiceRecorderProps {
  onCancel: () => void;
  onSendComplete: () => void;
}

export const AudioVoiceRecorder: React.FC<AudioVoiceRecorderProps> = ({
  onCancel,
  onSendComplete,
}) => {
  const { uploadMedia, sendMessage } = useChat();
  const { t } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    startRecording();

    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error', err);
      setError('Microphone access denied or unavailable. Please enable permissions.');
    }
  };

  const stopRecordingCleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleCancel = () => {
    stopRecordingCleanup();
    onCancel();
  };

  const handleSendVoiceNote = async () => {
    if (!mediaRecorderRef.current) return;
    setIsUploading(true);

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice-note-${Date.now()}.webm`, {
          type: 'audio/webm',
        });

        const uploadRes = await uploadMedia(file);
        await sendMessage({
          media_url: uploadRes.file_url,
          media_type: 'audio',
          media_name: 'Voice Note',
          media_size: uploadRes.file_size,
          content: '🎙️ ' + t('voice_note'),
        });

        onSendComplete();
      } catch (err: any) {
        setError(err.message || 'Failed to send voice note');
      } finally {
        setIsUploading(false);
      }
    };

    stopRecordingCleanup();
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-900 border border-slate-700 rounded-2xl animate-in fade-in slide-in-from-bottom-2 w-full">
      {error ? (
        <div className="flex items-center gap-2 text-xs text-rose-400">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
          <button
            onClick={handleCancel}
            className="ml-3 text-slate-400 hover:text-white underline cursor-pointer"
          >
            {t('cancel')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <div className="text-xs font-mono font-bold text-rose-400 flex items-center gap-1.5">
              <Mic className="w-4 h-4" />
              <span>{t('recording')} {formatSeconds(duration)}</span>
            </div>

            {/* Waveform Animation */}
            <div className="hidden sm:flex items-center gap-1 h-5">
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className="w-1 bg-cyan-500 rounded-full animate-pulse"
                  style={{
                    height: `${Math.max(20, Math.sin(duration * 2 + i) * 100)}%`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={isUploading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title={t('cancel')}
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleSendVoiceNote}
              disabled={isUploading || duration < 1}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-md shadow-cyan-600/20"
            >
              {isUploading ? (
                <span>{t('sending')}...</span>
              ) : (
                <>
                  <span>{t('send')}</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

