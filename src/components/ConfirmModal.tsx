import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  icon?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmText = 'Delete',
  confirmVariant = 'danger',
  isLoading = false,
  icon,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const getButtonClasses = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 border border-rose-500/30';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-950/40 border border-amber-500/30';
      default:
        return 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-950/40 border border-cyan-500/30';
    }
  };

  return (
    <AnimatePresence>
      <div
        id="confirm-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          id="confirm-modal-dialog"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="relative w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle top glow */}
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              confirmVariant === 'danger'
                ? 'bg-gradient-to-r from-transparent via-rose-500 to-transparent'
                : confirmVariant === 'warning'
                ? 'bg-gradient-to-r from-transparent via-amber-500 to-transparent'
                : 'bg-gradient-to-r from-transparent via-cyan-500 to-transparent'
            }`}
          />

          <button
            id="btn-close-confirm-modal"
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-xl shrink-0 ${
                confirmVariant === 'danger'
                  ? 'bg-rose-950/50 text-rose-400 border border-rose-800/40'
                  : confirmVariant === 'warning'
                  ? 'bg-amber-950/50 text-amber-400 border border-amber-800/40'
                  : 'bg-cyan-950/50 text-cyan-400 border border-cyan-800/40'
              }`}
            >
              {icon || (confirmVariant === 'danger' ? <Trash2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />)}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-slate-100 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              id="btn-cancel-action"
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800/80 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="btn-confirm-action"
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 ${getButtonClasses()}`}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
