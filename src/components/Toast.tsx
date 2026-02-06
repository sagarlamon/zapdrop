import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, Download, Upload, Link2 } from 'lucide-react';
import { cn } from '@/utils/cn';

type ToastType = 'success' | 'error' | 'info' | 'download' | 'upload' | 'connection';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);

    const duration = toast.duration || 4000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast, index) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onClose={() => removeToast(toast.id)} 
          index={index}
        />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose, index }: { toast: Toast; onClose: () => void; index: number }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    download: <Download className="w-5 h-5 text-emerald-500" />,
    upload: <Upload className="w-5 h-5 text-indigo-500" />,
    connection: <Link2 className="w-5 h-5 text-purple-500" />,
  };

  const borderColors = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    info: 'border-l-blue-500',
    download: 'border-l-emerald-500',
    upload: 'border-l-indigo-500',
    connection: 'border-l-purple-500',
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 rounded-xl border-l-4 shadow-2xl backdrop-blur-xl transition-all duration-300',
        borderColors[toast.type],
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
      style={{ 
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        transitionDelay: `${index * 50}ms`
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        {icons[toast.type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-1 rounded-lg transition-colors hover:bg-black/10"
        style={{ color: 'var(--text-muted)' }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
