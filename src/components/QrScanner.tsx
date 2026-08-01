import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X } from 'lucide-react';

interface QrScannerProps {
  onScan: (id: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play();
        }
        animationFrameRef.current = requestAnimationFrame(scanQRCode);
      } catch (err) {
        console.error('Camera access error:', err);
        setError('Unable to access camera. Please check permissions.');
      }
    }

    startCamera();

    return () => {
      // Stop media tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const scanQRCode = () => {
    if (!videoRef.current || !canvasRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        // Check if QR code is a ZapDrop URL with a connect param or a raw peer ID
        try {
          const url = new URL(code.data);
          const connectId = url.searchParams.get('connect');
          if (connectId) {
            onScan(connectId);
            return;
          }
        } catch {
          // If not a URL, check if it fits peer ID format (e.g. zap-xxxxxx)
          if (code.data.startsWith('zap-')) {
            onScan(code.data);
            return;
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanQRCode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div 
        className="w-full max-w-sm rounded-2xl border p-6 flex flex-col relative overflow-hidden"
        style={{ 
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)'
        }}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full transition-opacity hover:opacity-60 z-10"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X size={20} />
        </button>

        <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          Scan Connection QR
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Center the QR code in the camera frame
        </p>

        {/* Video / Canvas Container */}
        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black flex items-center justify-center border" style={{ borderColor: 'var(--border)' }}>
          {error ? (
            <p className="text-sm text-center px-4 text-red-500">{error}</p>
          ) : (
            <>
              <video 
                ref={videoRef} 
                className="absolute inset-0 w-full h-full object-cover"
                muted
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {/* Scan HUD Overlay */}
              <div className="absolute inset-8 border border-white/20 rounded-md pointer-events-none flex items-center justify-center">
                {/* Scanner corners */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white"></div>
                
                {/* Moving scan line */}
                <div 
                  className="absolute left-0 right-0 h-0.5 bg-white/60 shadow-[0_0_8px_#fff]"
                  style={{
                    animation: 'scan 2.5s linear infinite'
                  }}
                />
              </div>
            </>
          )}
        </div>

        <style>{`
          @keyframes scan {
            0% { top: 0%; }
            50% { top: 100%; }
            100% { top: 0%; }
          }
        `}</style>
      </div>
    </div>
  );
}
