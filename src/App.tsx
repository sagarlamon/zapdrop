import { useState, useCallback, useEffect, useRef } from 'react';
import { usePeer } from './hooks/usePeer';
import { FileSender, FileReceiver } from './utils/fileTransfer';
import { useTheme } from './context/ThemeContext';
import { 
  Sun, 
  Moon, 
  Copy, 
  Check, 
  ArrowRight,
  Download,
  X,
  Volume2,
  VolumeX,
  Zap
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { playSound } from './utils/sounds';

interface FileTransferState {
  file: File;
  progress: number;
  status: 'pending' | 'sending' | 'complete' | 'error';
}

interface ReceivedFile {
  blob: Blob;
  name: string;
  type: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { myId, connection, status, error, connectToPeer, retry } = usePeer();
  const [remoteId, setRemoteId] = useState('');
  const [copied, setCopied] = useState(false);
  const [files, setFiles] = useState<FileTransferState[]>([]);
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [isReceiving, setIsReceiving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiverRef = useRef<FileReceiver | null>(null);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const copyId = async () => {
    if (myId) {
      await navigator.clipboard.writeText(myId);
      setCopied(true);
      if (soundEnabled) playSound('click');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnect = () => {
    if (remoteId.trim()) {
      connectToPeer(remoteId.trim());
      if (soundEnabled) playSound('click');
    }
  };

  // Handle URL connection parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectId = params.get('connect');
    if (connectId && status === 'ready') {
      setRemoteId(connectId);
      connectToPeer(connectId);
    }
  }, [status, connectToPeer]);

  // Connection sound
  useEffect(() => {
    if (status === 'connected' && soundEnabled) {
      playSound('connected');
      showToast('Connected successfully', 'success');
    } else if (status === 'error' && soundEnabled) {
      playSound('error');
    }
  }, [status, soundEnabled, showToast]);

  // File receiving
  useEffect(() => {
    if (!connection) return;

    receiverRef.current = new FileReceiver(connection);
    
    receiverRef.current.onStart = () => {
      setIsReceiving(true);
      setReceiveProgress(0);
      setReceivedFile(null);
    };

    receiverRef.current.onProgress = (progress) => {
      setReceiveProgress(progress);
    };

    receiverRef.current.onComplete = (blob, fileName, fileType) => {
      setReceivedFile({ blob, name: fileName, type: fileType });
      setIsReceiving(false);
      if (soundEnabled) playSound('complete');
      showToast(`Received: ${fileName}`, 'success');
    };

    receiverRef.current.onError = (err) => {
      console.error('Receive error:', err);
      setIsReceiving(false);
      if (soundEnabled) playSound('error');
      showToast('Transfer failed', 'error');
    };

    return () => {
      receiverRef.current = null;
    };
  }, [connection, soundEnabled, showToast]);

  // Send files
  const sendFiles = useCallback(async (fileList: File[]) => {
    if (!connection) return;

    const newFiles = fileList.map(f => ({
      file: f,
      progress: 0,
      status: 'pending' as const
    }));

    setFiles(prev => [...prev, ...newFiles]);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const fileIndex = files.length + i;

      setFiles(prev => prev.map((f, idx) => 
        idx === fileIndex ? { ...f, status: 'sending' } : f
      ));

      try {
        const sender = new FileSender(connection, file);
        sender.onProgress = (progress) => {
          setFiles(prev => prev.map((f, idx) => 
            idx === fileIndex ? { ...f, progress } : f
          ));
        };

        await sender.send();
        
        setFiles(prev => prev.map((f, idx) => 
          idx === fileIndex ? { ...f, status: 'complete', progress: 100 } : f
        ));

        if (soundEnabled) playSound('complete');
        showToast(`Sent: ${file.name}`, 'success');
      } catch (err) {
        setFiles(prev => prev.map((f, idx) => 
          idx === fileIndex ? { ...f, status: 'error' } : f
        ));
        if (soundEnabled) playSound('error');
        showToast(`Failed to send: ${file.name}`, 'error');
      }
    }
  }, [connection, files.length, soundEnabled, showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) sendFiles(droppedFiles);
  }, [sendFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) sendFiles(selectedFiles);
    e.target.value = '';
  };

  const downloadFile = () => {
    if (!receivedFile) return;
    const url = URL.createObjectURL(receivedFile.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = receivedFile.name;
    a.click();
    URL.revokeObjectURL(url);
    if (soundEnabled) playSound('click');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const shareUrl = myId ? `${window.location.origin}${window.location.pathname}?connect=${myId}` : '';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="animate-fade-in px-4 py-2 text-sm"
            style={{
              background: 'var(--bg-secondary)',
              color: toast.type === 'error' ? 'var(--error)' : 
                     toast.type === 'success' ? 'var(--success)' : 'var(--text-primary)',
              borderBottom: `1px solid ${toast.type === 'error' ? 'var(--error)' : 
                            toast.type === 'success' ? 'var(--success)' : 'var(--border)'}`
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header 
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Zap size={20} style={{ color: 'var(--text-primary)' }} />
          <span className="font-medium tracking-tight">ZapDrop</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 transition-opacity hover:opacity-60"
            style={{ color: 'var(--text-secondary)' }}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          
          <button
            onClick={toggleTheme}
            className="p-2 transition-opacity hover:opacity-60"
            style={{ color: 'var(--text-secondary)' }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md animate-slide-up">
          
          {/* Status */}
          <div className="flex items-center gap-2 mb-8">
            <div 
              className="w-2 h-2 rounded-full"
              style={{ 
                background: status === 'connected' ? 'var(--success)' : 
                           status === 'error' ? 'var(--error)' : 'var(--text-muted)'
              }}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {status === 'initializing' && 'Initializing...'}
              {status === 'ready' && 'Ready to connect'}
              {status === 'connecting' && 'Connecting...'}
              {status === 'connected' && 'Connected'}
              {status === 'reconnecting' && 'Reconnecting...'}
              {status === 'error' && 'Connection error'}
            </span>
            {status === 'error' && (
              <button 
                onClick={retry}
                className="text-sm underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                Retry
              </button>
            )}
          </div>

          {/* Not Connected State */}
          {status !== 'connected' && (
            <>
              {/* My ID */}
              <div className="mb-8">
                <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                  Your ID
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-mono tracking-wide" style={{ color: 'var(--text-primary)' }}>
                    {myId || '...'}
                  </span>
                  <button
                    onClick={copyId}
                    className="p-2 transition-opacity hover:opacity-60"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* QR Code */}
              {myId && (
                <div className="mb-8">
                  <div 
                    className="inline-block p-4"
                    style={{ background: '#ffffff' }}
                  >
                    <QRCodeSVG
                      value={shareUrl}
                      size={120}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    Scan to connect
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-4 mb-8">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>

              {/* Connect Form */}
              <div className="mb-8">
                <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                  Connect to
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={remoteId}
                    onChange={(e) => setRemoteId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                    placeholder="Enter peer ID"
                    className="flex-1 bg-transparent text-lg font-mono py-2 border-b transition-colors focus:border-current"
                    style={{ 
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <button
                    onClick={handleConnect}
                    disabled={!remoteId.trim() || status === 'connecting'}
                    className="p-2 transition-opacity hover:opacity-60 disabled:opacity-30"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Connected State */}
          {status === 'connected' && (
            <>
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="py-16 text-center cursor-pointer transition-colors border-2 border-dashed mb-8"
                style={{ 
                  borderColor: isDragging ? 'var(--text-primary)' : 'var(--border)',
                  background: isDragging ? 'var(--bg-secondary)' : 'transparent'
                }}
              >
                <p style={{ color: 'var(--text-secondary)' }}>
                  {isDragging ? 'Drop files here' : 'Drop files or click to select'}
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Supports files of any size
                </p>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Sending Files */}
              {files.length > 0 && (
                <div className="mb-8">
                  <label className="text-xs uppercase tracking-wider mb-3 block" style={{ color: 'var(--text-muted)' }}>
                    Sending
                  </label>
                  <div className="space-y-3">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                            {f.file.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1" style={{ background: 'var(--border)' }}>
                              <div 
                                className="h-full progress-bar transition-all"
                                style={{ width: `${f.progress}%` }}
                              />
                            </div>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {f.status === 'complete' ? '✓' : `${f.progress}%`}
                            </span>
                          </div>
                        </div>
                        {f.status === 'pending' && (
                          <button
                            onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 hover:opacity-60"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Receiving File */}
              {isReceiving && (
                <div className="mb-8">
                  <label className="text-xs uppercase tracking-wider mb-3 block" style={{ color: 'var(--text-muted)' }}>
                    Receiving
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1" style={{ background: 'var(--border)' }}>
                      <div 
                        className="h-full progress-bar transition-all"
                        style={{ width: `${receiveProgress}%` }}
                      />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {receiveProgress}%
                    </span>
                  </div>
                </div>
              )}

              {/* Received File */}
              {receivedFile && (
                <div className="mb-8">
                  <label className="text-xs uppercase tracking-wider mb-3 block" style={{ color: 'var(--text-muted)' }}>
                    Received
                  </label>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {receivedFile.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatSize(receivedFile.blob.size)}
                      </p>
                    </div>
                    <button
                      onClick={downloadFile}
                      className="flex items-center gap-2 px-4 py-2 text-sm transition-opacity hover:opacity-70"
                      style={{ 
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)'
                      }}
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                  
                  {/* Image Preview */}
                  {receivedFile.type.startsWith('image/') && (
                    <div className="mt-4">
                      <img 
                        src={URL.createObjectURL(receivedFile.blob)} 
                        alt={receivedFile.name}
                        className="max-w-full max-h-48 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm" style={{ color: 'var(--error)' }}>
              {error}
            </p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer 
        className="px-6 py-4 text-center border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          made by <span style={{ color: 'var(--text-secondary)' }}>SAGAR</span>
        </span>
      </footer>
    </div>
  );
}
