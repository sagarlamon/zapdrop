================================================================================
                           ZAPDROP - P2P FILE TRANSFER
                              COMPLETE DOCUMENTATION
================================================================================

Made by: SAGAR
Version: 1.0.0
Type: Serverless Web Application

================================================================================
                              ABOUT THIS WEBSITE
================================================================================

ZapDrop is a peer-to-peer file transfer application similar to Apple AirDrop,
but it works entirely in the browser. No server needed for file transfers!

KEY FEATURES:
-------------
✓ Peer-to-Peer Connection  - Direct device-to-device transfer
✓ No File Size Limit       - Supports large files (1GB+) via chunking
✓ Multiple Files           - Send many files at once
✓ QR Code Sharing          - Scan to connect on mobile
✓ Dark/Light Theme         - Toggle between themes
✓ Sound Effects            - Audio feedback for actions
✓ Browser Notifications    - Get notified when transfer completes
✓ Transfer History         - View past transfers
✓ Image Preview            - Preview images before sending
✓ Auto-Reconnect           - Reconnects if connection drops
✓ Fully Encrypted          - WebRTC provides end-to-end encryption
✓ No Backend Required      - 100% client-side, serverless

HOW IT WORKS:
-------------
1. Uses WebRTC (via PeerJS) for direct browser-to-browser connection
2. Files are split into 16KB chunks to prevent browser crashes
3. Uses public PeerJS signaling server (only for initial connection)
4. Actual file data goes directly between browsers (P2P)


================================================================================
                              TECHNOLOGY STACK
================================================================================

Frontend Framework    : React 18 (with TypeScript)
Build Tool           : Vite
Styling              : Tailwind CSS
P2P Library          : PeerJS (WebRTC wrapper)
QR Code Generation   : qrcode.react
Icons                : Lucide React
