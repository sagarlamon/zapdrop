// Browser notifications utility
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
}

export function showNotification(title: string, options?: NotificationOptions) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
    
    return notification;
  }
  return null;
}

export function notifyTransferComplete(fileName: string, isReceived: boolean) {
  showNotification(
    isReceived ? '📥 File Received!' : '📤 File Sent!',
    {
      body: fileName,
      tag: 'transfer-complete',
    }
  );
}

export function notifyConnection(peerId: string) {
  showNotification('🔗 Connected!', {
    body: `Connected to ${peerId}`,
    tag: 'connection',
  });
}
