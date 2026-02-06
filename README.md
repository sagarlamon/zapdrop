# 🚀 ZapDrop — P2P File Transfer

🔗 **Live Demo:** https://sagarlamon.github.io/zapdrop/

**Version:** 1.0.0  
**Author:** Sagar  
**Type:** Serverless Web Application  

ZapDrop is a peer-to-peer file transfer web app inspired by Apple AirDrop, but it works **entirely in the browser**. No backend servers are involved in file transfers.

---

## ✨ Features

- **Peer-to-Peer Connection**  
  Direct device-to-device transfer using WebRTC.

- **No File Size Limit**  
  Supports large files (1GB+) via chunked transfer.

- **Multiple File Support**  
  Send multiple files in one session.

- **QR Code Sharing**  
  Easily connect devices by scanning a QR code.

- **Dark / Light Theme**  
  Toggle themes based on preference.

- **Sound Effects**  
  Audio feedback for transfer actions.

- **Browser Notifications**  
  Notified when transfers complete.

- **Transfer History**  
  View previous file transfers.

- **Image Preview**  
  Preview images before sending.

- **Auto Reconnect**  
  Automatically reconnects if the connection drops.

- **End-to-End Encryption**  
  WebRTC provides built-in encrypted connections.

- **No Backend Required**  
  100% client-side and serverless.

---

## 🧠 How It Works

1. Uses **WebRTC** (via PeerJS) for direct browser-to-browser communication  
2. Files are split into **16 KB chunks** to avoid browser memory issues  
3. A **public PeerJS signaling server** is used only to establish the connection  
4. File data flows **directly between peers**, not through any server  

---

## 🛠 Technology Stack

| Category | Technology |
|--------|------------|
| Frontend | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| P2P | PeerJS (WebRTC wrapper) |
| QR Codes | `qrcode.react` |
| Icons | Lucide React |

---
