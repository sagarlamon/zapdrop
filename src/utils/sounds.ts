const audioContext = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

export function playSound(type: 'click' | 'connected' | 'complete' | 'error') {
  if (!audioContext) return;
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  const now = audioContext.currentTime;
  
  switch (type) {
    case 'click':
      oscillator.frequency.setValueAtTime(800, now);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;
      
    case 'connected':
      oscillator.frequency.setValueAtTime(523, now);
      oscillator.frequency.setValueAtTime(659, now + 0.1);
      oscillator.frequency.setValueAtTime(784, now + 0.2);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
      break;
      
    case 'complete':
      oscillator.frequency.setValueAtTime(659, now);
      oscillator.frequency.setValueAtTime(784, now + 0.1);
      oscillator.frequency.setValueAtTime(1047, now + 0.2);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      oscillator.start(now);
      oscillator.stop(now + 0.4);
      break;
      
    case 'error':
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.setValueAtTime(150, now + 0.1);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
      break;
  }
}
