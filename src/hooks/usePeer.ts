import { useState, useEffect, useCallback, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';

type ConnectionStatus = 'initializing' | 'ready' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface UsePeerReturn {
  myId: string | null;
  connection: DataConnection | null;
  status: ConnectionStatus;
  error: string | null;
  connectToPeer: (remoteId: string) => void;
  retry: () => void;
}

function generateShortId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'zap-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function usePeer(): UsePeerReturn {
  const [myId, setMyId] = useState<string | null>(null);
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  const initializePeer = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
    }

    const id = generateShortId();
    const peer = new Peer(id);
    peerRef.current = peer;

    peer.on('open', (peerId) => {
      setMyId(peerId);
      setStatus('ready');
      setError(null);
      reconnectAttempts.current = 0;
    });

    peer.on('connection', (conn) => {
      setStatus('connecting');
      
      conn.on('open', () => {
        setConnection(conn);
        setStatus('connected');
      });

      conn.on('close', () => {
        setConnection(null);
        setStatus('ready');
      });

      conn.on('error', (err) => {
        console.error('Connection error:', err);
        setError('Connection lost');
        setStatus('error');
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      
      if (err.type === 'unavailable-id') {
        initializePeer();
        return;
      }
      
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        setStatus('reconnecting');
        setTimeout(initializePeer, 2000);
      } else {
        setError(err.message || 'Connection failed');
        setStatus('error');
      }
    });

    peer.on('disconnected', () => {
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        setStatus('reconnecting');
        peer.reconnect();
      }
    });
  }, []);

  useEffect(() => {
    initializePeer();

    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [initializePeer]);

  const connectToPeer = useCallback((remoteId: string) => {
    if (!peerRef.current) return;

    setStatus('connecting');
    setError(null);

    const conn = peerRef.current.connect(remoteId, { reliable: true });

    conn.on('open', () => {
      setConnection(conn);
      setStatus('connected');
    });

    conn.on('close', () => {
      setConnection(null);
      setStatus('ready');
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect');
      setStatus('error');
    });
  }, []);

  const retry = useCallback(() => {
    reconnectAttempts.current = 0;
    initializePeer();
  }, [initializePeer]);

  return {
    myId,
    connection,
    status,
    error,
    connectToPeer,
    retry
  };
}
