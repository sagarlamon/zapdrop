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
  Zap,
  Camera,
  Archive,
  History,
  Trash2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { playSound } from './utils/sounds';
import JSZip from 'jszip';
import QrScanner from './components/QrScanner';

interface FileTransferState {
  file: File;
  progress: number;
  status: 'pending' | 'sending' | 'complete' | 'error';
  bytesTransferred?: number;
  speed?: string;
  eta?: string;
}

interface ReceivedFileState {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  objectUrl: string;
}

interface HistoryLogItem {
  id: string;
  name: string;
  size: number;
  type: 'sent' | 'received';
  timestamp: number;
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
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFileState[]>([]);
  const [receivingMetadata, setReceivingMetadata] = useState<{ name: string; size: number } | null>(null);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [receiveSpeed, setReceiveSpeed] = useState('');
  const [receiveEta, setReceiveEta] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<HistoryLogItem[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiverRef = useRef<FileReceiver | null>(null);
  const sendingRef = useRef(false);
  const receiveStartRef = useRef<number | null>(null);

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

  // Register Service Worker for PWA offline support
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered successfully:', reg.scope))
        .catch(err => console.error('SW registration failed:', err));
    }
  }, []);

  // Load history logs on mount
  useEffect(() => {
    const stored = localStorage.getItem('zapdrop_history');
    if (stored) {
      try {
        setHistoryLogs(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const addToHistory = useCallback((name: string, size: number, type: 'sent' | 'received') => {
    const newItem: HistoryLogItem = {
      id: Math.random().toString(36).slice(2),
      name,
      size,
      type,
      timestamp: Date.now()
    };
    setHistoryLogs(prev => {
      const updated = [newItem, ...prev].slice(0, 50);
      localStorage.setItem('zapdrop_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = () => {
    setHistoryLogs([]);
    localStorage.removeItem('zapdrop_history');
    showToast('History cleared', 'info');
  };

  const formatSpeed = useCallback((bytesPerSecond: number) => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(1)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }, []);

  // Recursive Directory Traversal for folder zipping
  const traverseDirectory = async (entry: any, zip: JSZip, path = '') => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      zip.file(`${path}${entry.name}`, file);
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await new Promise<any[]>((resolve) => {
        const result: any[] = [];
        const read = () => {
          dirReader.readEntries((newEntries: any[]) => {
            if (newEntries.length === 0) {
              resolve(result);
            } else {
              result.push(...newEntries);
              read();
            }
          });
        };
        read();
      });
      for (const child of entries) {
        await traverseDirectory(child, zip, `${path}${entry.name}/`);
      }
    }
  };

  // Refs for tracking values inside callbacks to avoid re-binding event listeners
  const soundEnabledRef = useRef(soundEnabled);
  const receiveSizeRef = useRef<number>(0);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // File receiving listener
  useEffect(() => {
    if (!connection) return;

    // Reset any existing listener on connection to avoid duplication
    try {
      (connection as any).off('data');
    } catch (e) {
      console.warn('Failed to cleanup old listeners:', e);
    }

    const receiver = new FileReceiver(connection);
    receiverRef.current = receiver;
    
    receiver.onStart = (fileName, fileSize) => {
      setIsReceiving(true);
      setReceiveProgress(0);
      setReceiveSpeed('');
      setReceiveEta('estimating...');
      setReceivingMetadata({ name: fileName, size: fileSize });
      receiveStartRef.current = Date.now();
      receiveSizeRef.current = fileSize;
    };

    receiver.onProgress = (progress, bytesTransferred) => {
      const elapsed = (Date.now() - (receiveStartRef.current ?? Date.now())) / 1000;
      const speedBps = elapsed > 0 ? bytesTransferred / elapsed : 0;
      const speedText = formatSpeed(speedBps);
      const remainingBytes = receiveSizeRef.current - bytesTransferred;
      const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
      const etaText = speedBps > 0 ? `${etaSeconds}s remaining` : 'estimating...';

      setReceiveProgress(progress);
      setReceiveSpeed(speedText);
      setReceiveEta(etaText);
    };

    receiver.onComplete = (blob, fileName, fileType) => {
      const objectUrl = URL.createObjectURL(blob);
      const newFile: ReceivedFileState = {
        id: Math.random().toString(36).slice(2),
        blob,
        name: fileName,
        type: fileType,
        objectUrl
      };
      setReceivedFiles(prev => [...prev, newFile]);
      setIsReceiving(false);
      setReceivingMetadata(null);
      if (soundEnabledRef.current) playSound('complete');
      showToast(`Received: ${fileName}`, 'success');
      addToHistory(fileName, blob.size, 'received');

      // Auto-download file
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.click();
    };

    receiver.onError = (err) => {
      console.error('Receive error:', err);
      setIsReceiving(false);
      setReceivingMetadata(null);
      if (soundEnabledRef.current) playSound('error');
      showToast('Transfer failed', 'error');
    };

    return () => {
      receiverRef.current = null;
      try {
        (connection as any).off('data');
      } catch (e) {
        console.warn('Failed to cleanup on unmount:', e);
      }
    };
  }, [connection, showToast, addToHistory, formatSpeed]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      receivedFiles.forEach(f => URL.revokeObjectURL(f.objectUrl));
    };
  }, [receivedFiles]);

  // Sequentially send pending files
  useEffect(() => {
    if (!connection || sendingRef.current) return;

    const nextIndex = files.findIndex(f => f.status === 'pending');
    if (nextIndex === -1) return;

    sendingRef.current = true;
    const fileTransfer = files[nextIndex];
    const startTime = Date.now();

    setFiles(prev => prev.map((f, idx) => 
      idx === nextIndex ? { ...f, status: 'sending' } : f
    ));

    const sender = new FileSender(connection, fileTransfer.file);
    sender.onProgress = (progress, bytesTransferred) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const speedBps = elapsed > 0 ? bytesTransferred / elapsed : 0;
      const speedText = formatSpeed(speedBps);
      const remainingBytes = fileTransfer.file.size - bytesTransferred;
      const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
      const etaText = speedBps > 0 ? `${etaSeconds}s remaining` : 'estimating...';

      setFiles(prev => prev.map((f, idx) => 
        idx === nextIndex ? { 
          ...f, 
          progress, 
          bytesTransferred, 
          speed: speedText, 
          eta: etaText 
        } : f
      ));
    };

    sender.send()
      .then(() => {
        setFiles(prev => prev.map((f, idx) => 
          idx === nextIndex ? { ...f, status: 'complete', progress: 100 } : f
        ));
        if (soundEnabledRef.current) playSound('complete');
        showToast(`Sent: ${fileTransfer.file.name}`, 'success');
        addToHistory(fileTransfer.file.name, fileTransfer.file.size, 'sent');
      })
      .catch((err) => {
        console.error('Send error:', err);
        setFiles(prev => prev.map((f, idx) => 
          idx === nextIndex ? { ...f, status: 'error' } : f
        ));
        if (soundEnabledRef.current) playSound('error');
        showToast(`Failed to send: ${fileTransfer.file.name}`, 'error');
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }, [connection, files, showToast, addToHistory, formatSpeed]);

  // Send files trigger (adds files to queue)
  const sendFiles = useCallback((fileList: File[]) => {
    const newFiles = fileList.map(f => ({
      file: f,
      progress: 0,
      status: 'pending' as const
    }));

    setFiles(prev => [...prev, ...newFiles]);
    if (soundEnabled) playSound('click');
  }, [soundEnabled]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items || []);
    const filesToProcess: File[] = [];
    const foldersToZip: any[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            foldersToZip.push(entry);
          } else {
            const file = item.getAsFile();
            if (file) filesToProcess.push(file);
          }
        }
      }
    }

    if (foldersToZip.length > 0) {
      showToast('Zipping folder(s)...', 'info');
      for (const folder of foldersToZip) {
        const zip = new JSZip();
        await traverseDirectory(folder, zip);
        const content = await zip.generateAsync({ type: 'blob' });
        const zippedFile = new File([content], `${folder.name}.zip`, { type: 'application/zip' });
        filesToProcess.push(zippedFile);
      }
    }

    if (filesToProcess.length > 0) {
      sendFiles(filesToProcess);
    }
  }, [sendFiles, showToast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) sendFiles(selectedFiles);
    e.target.value = '';
  };

  const downloadFile = (file: ReceivedFileState) => {
    const a = document.createElement('a');
    a.href = file.objectUrl;
    a.download = file.name;
    a.click();
    if (soundEnabled) playSound('click');
  };

  const downloadAllAsZip = async () => {
    if (receivedFiles.length === 0) return;
    showToast('Creating zip bundle...', 'info');
    if (soundEnabled) playSound('click');

    const zip = new JSZip();
    receivedFiles.forEach(rf => {
      zip.file(rf.name, rf.blob);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zapdrop-bundle-${Date.now().toString().slice(-4)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Zip downloaded!', 'success');
  };

  const removeReceivedFile = (id: string) => {
    setReceivedFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target) {
        URL.revokeObjectURL(target.objectUrl);
      }
      return prev.filter(f => f.id !== id);
    });
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
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>v2.0.0</span>
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
                    onClick={() => setShowScanner(true)}
                    className="p-2 transition-opacity hover:opacity-60"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Scan QR Code"
                  >
                    <Camera size={18} />
                  </button>
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
                          {f.status === 'sending' && f.speed && (
                            <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              <span>{f.speed}</span>
                              <span>{f.eta}</span>
                            </div>
                          )}
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
              {isReceiving && receivingMetadata && (
                <div className="mb-8">
                  <label className="text-xs uppercase tracking-wider mb-3 block truncate" style={{ color: 'var(--text-muted)' }}>
                    Receiving: {receivingMetadata.name} ({formatSize(receivingMetadata.size)})
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
                  {receiveSpeed && (
                    <div className="flex justify-between text-[10px] mt-0.5 px-1" style={{ color: 'var(--text-secondary)' }}>
                      <span>{receiveSpeed}</span>
                      <span>{receiveEta}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Received Files */}
              {receivedFiles.length > 0 && (
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                      Received Files
                    </label>
                    {receivedFiles.length > 1 && (
                      <button
                        onClick={downloadAllAsZip}
                        className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        <Archive size={12} />
                        Download All (Zip)
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {receivedFiles.map((rf) => (
                      <div key={rf.id} className="p-3 border rounded-lg" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1 mr-4">
                            <p className="text-sm truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                              {rf.name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {formatSize(rf.blob.size)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => downloadFile(rf)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-opacity hover:opacity-80"
                              style={{ 
                                background: 'var(--text-primary)',
                                color: 'var(--bg-primary)'
                              }}
                            >
                              <Download size={12} />
                              Download
                            </button>
                            <button
                              onClick={() => removeReceivedFile(rf.id)}
                              className="p-1.5 hover:opacity-60"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        
                        {/* Image Preview inside list item */}
                        {rf.type.startsWith('image/') && (
                          <div className="mt-3 overflow-hidden rounded border" style={{ borderColor: 'var(--border)' }}>
                            <img 
                              src={rf.objectUrl} 
                              alt={rf.name}
                              className="max-w-full max-h-32 object-contain mx-auto"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm mt-4" style={{ color: 'var(--error)' }}>
              {error}
            </p>
          )}

          {/* History Log */}
          {historyLogs.length > 0 && (
            <div className="mt-8 border-t pt-8" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                  <History size={16} />
                  <span className="text-xs uppercase tracking-wider font-semibold">Transfer History</span>
                </div>
                <button
                  onClick={clearHistory}
                  className="text-xs flex items-center gap-1 hover:opacity-75 transition-opacity"
                  style={{ color: 'var(--error)' }}
                >
                  <Trash2 size={12} />
                  Clear
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {historyLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between text-xs py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                        {log.name}
                      </p>
                      <p style={{ color: 'var(--text-muted)' }}>
                        {formatSize(log.size)} • {log.type === 'sent' ? 'Sent' : 'Received'} • {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </p>
                    </div>
                    <span 
                      className="font-medium shrink-0 text-sm"
                      style={{ color: log.type === 'sent' ? 'var(--text-secondary)' : 'var(--success)' }}
                    >
                      {log.type === 'sent' ? '📤' : '📥'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QR Scanner Modal */}
          {showScanner && (
            <QrScanner 
              onScan={(scannedId) => {
                setRemoteId(scannedId);
                setShowScanner(false);
                connectToPeer(scannedId);
              }}
              onClose={() => setShowScanner(false)}
            />
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
