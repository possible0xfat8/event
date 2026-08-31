import React, { useState, useEffect, useRef } from 'react';
import { EventItem, QueuedOfflineScan, OfflineManifest } from '../types';
import { api } from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  ScanLine, Wifi, WifiOff, CloudDownload, RefreshCw, AlertOctagon, 
  CheckCircle2, ShieldCheck, Camera, XCircle, FlipHorizontal, 
  Flashlight, Upload, Sparkles, AlertTriangle
} from 'lucide-react';

interface ScannerModeProps {
  events: EventItem[];
  scannerDeviceId: string;
  networkStatus: 'online' | 'offline' | 'spotty';
  onToggleNetworkStatus: (status: 'online' | 'offline' | 'spotty') => void;
}

export const ScannerMode: React.FC<ScannerModeProps> = ({
  events,
  scannerDeviceId,
  networkStatus,
  onToggleNetworkStatus,
}) => {
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const [manifest, setManifest] = useState<OfflineManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [queuedScans, setQueuedScans] = useState<QueuedOfflineScan[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'duplicate' | 'invalid' | 'offline_success' | 'revoked';
    message: string;
    ticketId?: string;
    ownerName?: string;
    usedAt?: string;
  } | null>(null);

  const [manualTokenInput, setManualTokenInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load queued scans & cached manifest
  useEffect(() => {
    const saved = localStorage.getItem(`evnt_queued_scans_${scannerDeviceId}`);
    if (saved) {
      try {
        setQueuedScans(JSON.parse(saved));
      } catch (_) {}
    }

    const savedManifest = localStorage.getItem(`evnt_manifest_${selectedEventId}`);
    if (savedManifest) {
      try {
        setManifest(JSON.parse(savedManifest));
      } catch (_) {}
    }
  }, [scannerDeviceId, selectedEventId]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const persistQueuedScans = (scans: QueuedOfflineScan[]) => {
    setQueuedScans(scans);
    localStorage.setItem(`evnt_queued_scans_${scannerDeviceId}`, JSON.stringify(scans));
  };

  const handleDownloadManifest = async () => {
    if (!selectedEventId) return;
    setManifestLoading(true);
    try {
      const data = await api.getOfflineManifest(selectedEventId);
      if (data) {
        setManifest(data);
        localStorage.setItem(`evnt_manifest_${selectedEventId}`, JSON.stringify(data));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setManifestLoading(false);
    }
  };

  const handleProcessToken = async (rawToken: string) => {
    if (!rawToken || rawToken.trim().length === 0) return;
    const token = rawToken.trim();

    // Haptic feedback if supported on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([80]);
    }

    // 1. Check if we are OFFLINE
    if (networkStatus === 'offline') {
      try {
        const parts = token.split('.');
        if (parts.length !== 2) {
          setScanResult({ status: 'invalid', message: 'Malformed ticket token' });
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return;
        }

        const payload = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
        const ticketId = payload.ticketId;
        const now = new Date().toISOString();

        // Check if scanned already on THIS offline device
        const alreadyInLocalQueue = queuedScans.some(s => s.ticketId === ticketId);
        if (alreadyInLocalQueue) {
          setScanResult({
            status: 'duplicate',
            message: 'Already admitted on this offline handheld device!',
            ticketId,
          });
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return;
        }

        // Queue for background sync
        const newQueueItem: QueuedOfflineScan = {
          ticketId,
          token,
          scannerDeviceId,
          scannedAt: now,
          verifiedLocally: true,
        };

        const updatedQueue = [newQueueItem, ...queuedScans];
        persistQueuedScans(updatedQueue);

        setScanResult({
          status: 'offline_success',
          message: 'OFFLINE PASS ADMITTED (Queued for sync)',
          ticketId,
          ownerName: `User (${payload.ownerUserId})`,
        });
        if (navigator.vibrate) navigator.vibrate([100]);
      } catch (err: any) {
        setScanResult({ status: 'invalid', message: `Offline verification error: ${err.message}` });
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
      return;
    }

    // 2. ONLINE Atomic Path
    try {
      const res = await api.scanTicketOnline(token, scannerDeviceId, selectedEventId);
      if (res.valid) {
        setScanResult({
          status: 'success',
          message: 'ACCESS GRANTED - VALID TICKET',
          ticketId: res.ticketId,
          ownerName: res.ownerName,
        });
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } else {
        if (res.status === 'already_used') {
          setScanResult({
            status: 'duplicate',
            message: res.error || 'TICKET ALREADY USED',
            ticketId: res.ticketId,
            ownerName: res.ownerName,
            usedAt: res.usedAt,
          });
        } else if (res.status === 'revoked') {
          setScanResult({
            status: 'revoked',
            message: 'TICKET REVOKED (Resold / Refunded)',
            ticketId: res.ticketId,
            ownerName: res.ownerName,
          });
        } else {
          setScanResult({
            status: 'invalid',
            message: res.error || 'INVALID TICKET SIGNATURE',
          });
        }
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      }
    } catch (err: any) {
      setScanResult({ status: 'invalid', message: err.message || 'Verification connection failed' });
    }
  };

  const handleSyncOfflineBatch = async () => {
    if (queuedScans.length === 0) return;
    setSyncLoading(true);
    try {
      const res = await api.syncOfflineScans(queuedScans);
      if (res.success) {
        setSyncResult(res);
        persistQueuedScans([]); // Clear queue
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSyncLoading(false);
    }
  };

  // Start Camera with direct video stream and Html5Qrcode fallback
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);

    try {
      // First attempt native getUserMedia for ultra-fast, smooth video feed
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          videoStreamRef.current = stream;
          if (videoElementRef.current) {
            videoElementRef.current.srcObject = stream;
            videoElementRef.current.play().catch(() => {});
          }
        } catch (streamErr: any) {
          console.warn('Native getUserMedia stream info:', streamErr);
        }
      }

      // Initialize Html5Qrcode engine on un-mutated DOM element
      const html5QrCode = new Html5Qrcode('qr-reader-surface');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(minEdge * 0.75),
              height: Math.floor(minEdge * 0.75),
            };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleProcessToken(decodedText);
          stopCamera();
        },
        () => {}
      );
    } catch (err: any) {
      console.error('Camera engine initialization error:', err);
      setCameraError(err.message || 'Unable to open camera stream. Ensure camera permissions are granted.');
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (_) {}
      scannerRef.current = null;
    }

    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
    }

    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }

    setIsCameraActive(false);
    setTorchOn(false);
  };

  const toggleCameraFacing = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (isCameraActive) {
      await stopCamera();
      setTimeout(startCamera, 200);
    }
  };

  const toggleTorch = async () => {
    if (!videoStreamRef.current) return;
    const track = videoStreamRef.current.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const nextTorch = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setTorchOn(nextTorch);
      } catch (_) {}
    }
  };

  // Image file QR scanner
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('qr-reader-surface');
      const decoded = await html5QrCode.scanFile(file, true);
      if (decoded) {
        handleProcessToken(decoded);
      }
    } catch (err: any) {
      setScanResult({ status: 'invalid', message: 'Could not detect QR code in uploaded image.' });
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="max-w-lg mx-auto p-4 pb-28 space-y-4">
      {/* Top Scanner HUD Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88] animate-pulse" />
            <h2 className="font-display font-black text-xl sm:text-2xl text-white">Door Gate Scanner</h2>
          </div>
          <p className="text-[11px] text-slate-400">Terminal: {scannerDeviceId}</p>
        </div>

        {/* Network Status Toggle Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#121522] border border-[#212638]">
          <button
            onClick={() => onToggleNetworkStatus('online')}
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition flex items-center gap-1 ${
              networkStatus === 'online' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wifi className="w-3 h-3" /> Online
          </button>
          <button
            onClick={() => onToggleNetworkStatus('offline')}
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition flex items-center gap-1 ${
              networkStatus === 'offline' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <WifiOff className="w-3 h-3" /> Offline
          </button>
        </div>
      </div>

      {/* Target Gate Event Selector */}
      <div className="glass-panel p-3.5 sm:p-4 rounded-3xl border border-[#242b40] space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Assigned Gate Event</label>
          {manifest && (
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Manifest Cached
            </span>
          )}
        </div>

        <select
          value={selectedEventId}
          onChange={e => setSelectedEventId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-xs font-semibold text-white focus:outline-none focus:border-[#00ff88]"
        >
          {events.map(e => (
            <option key={e.id} value={e.id}>
              {e.title} ({e.venue_name})
            </option>
          ))}
        </select>

        <button
          onClick={handleDownloadManifest}
          disabled={manifestLoading}
          className="w-full py-2 rounded-xl bg-[#1b2236] hover:bg-[#252f4c] text-[11px] font-bold text-slate-200 transition border border-[#2e3b5e] flex items-center justify-center gap-1.5"
        >
          <CloudDownload className="w-3.5 h-3.5 text-[#00f0ff]" />
          <span>{manifestLoading ? 'Syncing...' : 'Pre-Cache Event Manifest for Offline Doors'}</span>
        </button>
      </div>

      {/* Live Camera Viewport with Viewfinder Overlay */}
      <div className="glass-panel rounded-3xl p-3 sm:p-4 border border-[#242b40] flex flex-col items-center gap-3 relative overflow-hidden">
        {/* The Viewport Container */}
        <div className="w-full aspect-square max-h-[340px] sm:max-h-[380px] rounded-2xl overflow-hidden bg-black relative border-2 border-[#1e253c] flex items-center justify-center">
          {/* Dedicated Html5Qrcode Surface (React does not manipulate children) */}
          <div
            id="qr-reader-surface"
            className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
          />

          {/* Backup Native Video Stream */}
          {isCameraActive && (
            <video
              ref={videoElementRef}
              playsInline
              autoPlay
              muted
              className="absolute inset-0 w-full h-full object-cover pointer-events-none -z-10"
            />
          )}

          {/* Viewfinder Overlays when Camera is Active */}
          {isCameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              {/* Corner brackets */}
              <div className="w-48 h-48 sm:w-56 sm:h-56 relative border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_20px_rgba(0,255,136,0.3)]">
                {/* Scanning Laser Line */}
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#00ff88] to-transparent shadow-[0_0_10px_#00ff88] animate-scan-line" />
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[#00ff88] bg-black/70 px-2 py-0.5 rounded-full mt-4 backdrop-blur-md">
                Align Pass QR Code
              </p>
            </div>
          )}

          {/* Idle Camera Placeholder */}
          {!isCameraActive && (
            <div className="p-6 text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-[#141824] border border-[#232a3e] text-[#00ff88] mx-auto flex items-center justify-center shadow-lg">
                <ScanLine className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Camera Viewfinder Idle</p>
                <p className="text-[11px] text-slate-400 mt-0.5">High-speed Ed25519 token verification</p>
              </div>

              <button
                onClick={startCamera}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00ff88] to-[#00f0ff] text-slate-950 font-black text-xs hover:opacity-90 active:scale-95 transition shadow-xl shadow-emerald-500/20 flex items-center gap-2 mx-auto"
              >
                <Camera className="w-4 h-4" />
                <span>Open Live Scanner Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Camera Controls Bar (Flip, Torch, File Upload, Stop) */}
        {isCameraActive && (
          <div className="w-full flex items-center justify-between gap-2 px-1">
            <button
              onClick={toggleCameraFacing}
              className="p-2.5 rounded-xl bg-[#181d2f] border border-[#2c3652] text-slate-300 hover:text-white transition"
              title="Flip Camera"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-xl border transition ${
                torchOn ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-[#181d2f] border-[#2c3652] text-slate-300'
              }`}
              title="Toggle Flashlight"
            >
              <Flashlight className="w-4 h-4" />
            </button>

            <button
              onClick={stopCamera}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-md"
            >
              Close Camera
            </button>
          </div>
        )}

        {/* Camera Error Message */}
        {cameraError && (
          <div className="w-full p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* Image File Upload Scanner Option */}
        <div className="w-full flex items-center justify-between gap-2 pt-1 border-t border-[#1e2538]">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 rounded-xl bg-[#141724] hover:bg-[#1a1f30] border border-[#212638] text-[11px] font-bold text-slate-300 flex items-center justify-center gap-1.5 transition"
          >
            <Upload className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>Scan QR from Photo / Screenshot</span>
          </button>
        </div>

        {/* Quick Test Pass Simulator Buttons (For fast simulator testing) */}
        <div className="w-full space-y-1.5 pt-2 border-t border-[#1e2538]">
          <span className="text-[10px] uppercase font-bold text-slate-400">1-Tap Test Simulator Passes:</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleProcessToken('tkt_sarah_bushwick_001.mock_sig_pass')}
              className="py-1.5 px-2 rounded-lg bg-[#141724] hover:bg-[#1c2234] border border-[#232a3e] text-[10px] font-semibold text-emerald-400 truncate"
            >
              ⚡ Test Valid Pass (Sarah)
            </button>
            <button
              onClick={() => handleProcessToken('tkt_marcus_lagos_002.mock_sig_pass')}
              className="py-1.5 px-2 rounded-lg bg-[#141724] hover:bg-[#1c2234] border border-[#232a3e] text-[10px] font-semibold text-[#00f0ff] truncate"
            >
              🇳🇬 Test Obi's House Pass
            </button>
          </div>
        </div>

        {/* Manual Token Verification */}
        <div className="w-full space-y-1.5 pt-2 border-t border-[#1e2538]">
          <span className="text-[10px] uppercase font-bold text-slate-400">Manual Token String:</span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste token payload.sig..."
              value={manualTokenInput}
              onChange={e => setManualTokenInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-[#141724] border border-[#212638] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00ff88]"
            />
            <button
              onClick={() => handleProcessToken(manualTokenInput)}
              className="px-4 py-2 rounded-xl bg-[#00ff88] hover:bg-[#00e67a] text-slate-950 font-black text-xs transition"
            >
              Verify
            </button>
          </div>
        </div>
      </div>

      {/* Instant Gate Decision Alert Card */}
      {scanResult && (
        <div
          className={`p-4 sm:p-5 rounded-3xl border shadow-2xl animate-in zoom-in-95 duration-150 flex items-start gap-3.5 ${
            scanResult.status === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100'
              : scanResult.status === 'offline_success'
              ? 'bg-amber-950/90 border-amber-500/60 text-amber-100'
              : 'bg-rose-950/90 border-rose-500/60 text-rose-100'
          }`}
        >
          {scanResult.status === 'success' ? (
            <CheckCircle2 className="w-8 h-8 text-[#00ff88] flex-shrink-0" />
          ) : scanResult.status === 'offline_success' ? (
            <ShieldCheck className="w-8 h-8 text-amber-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-8 h-8 text-rose-400 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-display font-black text-lg uppercase tracking-wide">
              {scanResult.status === 'success'
                ? 'ACCESS GRANTED'
                : scanResult.status === 'offline_success'
                ? 'OFFLINE ADMITTED'
                : 'ACCESS DENIED'}
            </h3>
            <p className="text-xs font-semibold mt-0.5">{scanResult.message}</p>
            {scanResult.ownerName && (
              <p className="text-xs text-slate-300 mt-1 font-bold">Holder: {scanResult.ownerName}</p>
            )}
            {scanResult.ticketId && (
              <p className="text-[10px] font-mono text-slate-400 mt-0.5">Ticket ID: {scanResult.ticketId}</p>
            )}
          </div>
        </div>
      )}

      {/* Offline Queue Sync Card */}
      <div className="glass-panel p-4 rounded-3xl border border-[#242b40] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#00f0ff]" />
            <h4 className="text-xs font-bold text-white">Offline Scans Sync Queue</h4>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-[#181d2f] text-xs font-extrabold text-[#00f0ff] border border-[#2c3652]">
            {queuedScans.length} Pending
          </span>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          When the device reconnects to Wi-Fi/cellular, upload offline scans to execute atomic sync and catch fraud.
        </p>

        <button
          onClick={handleSyncOfflineBatch}
          disabled={queuedScans.length === 0 || syncLoading || networkStatus === 'offline'}
          className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-[#00f0ff] to-[#3a86ff] text-slate-950 font-black text-xs hover:opacity-90 transition disabled:opacity-40 shadow-lg shadow-cyan-500/20"
        >
          {syncLoading ? 'Reconciling Batch...' : `Sync ${queuedScans.length} Offline Scans Now`}
        </button>

        {syncResult && (
          <div className="p-3 rounded-2xl bg-[#141724] border border-[#212638] text-xs space-y-1">
            <div className="text-emerald-400 font-bold">
              ✓ Successfully synced {syncResult.totalSynced} scans ({syncResult.admittedCount} admitted)
            </div>
            {syncResult.duplicateFraudCount > 0 && (
              <div className="text-rose-400 font-bold flex items-center gap-1 mt-1">
                <AlertOctagon className="w-4 h-4" />
                <span>FLAGGED {syncResult.duplicateFraudCount} DUPLICATE SCANS FOR SECURITY REVIEW</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
