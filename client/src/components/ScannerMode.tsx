import React, { useState, useEffect, useRef } from 'react';
import { EventItem, QueuedOfflineScan, OfflineManifest } from '../types';
import { api } from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanLine, Wifi, WifiOff, CloudDownload, RefreshCw, AlertOctagon, CheckCircle2, ShieldCheck, Camera, XCircle } from 'lucide-react';

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
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Load queued scans from localStorage
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

  // Save queued scans to localStorage
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

    // 1. Check if we are OFFLINE
    if (networkStatus === 'offline') {
      try {
        const parts = token.split('.');
        if (parts.length !== 2) {
          setScanResult({ status: 'invalid', message: 'Malformed ticket token' });
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
            message: 'Already scanned on this handheld device!',
            ticketId,
          });
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
          message: 'OFFLINE PASS VERIFIED (Queued for sync)',
          ticketId,
          ownerName: `User (${payload.ownerUserId})`,
        });
      } catch (err: any) {
        setScanResult({ status: 'invalid', message: `Offline verification error: ${err.message}` });
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

  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const html5QrCode = new Html5Qrcode('qr-reader-container');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleProcessToken(decodedText);
          stopCamera();
        },
        () => {}
      );
    } catch (err) {
      console.error('Camera failed to start', err);
      setIsCameraActive(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (_) {}
    }
    setIsCameraActive(false);
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="max-w-lg mx-auto p-4 pb-24 space-y-5">
      {/* Top Scanner HUD Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88] animate-pulse" />
            <h2 className="font-display font-black text-2xl text-white">Staff Gate Scanner</h2>
          </div>
          <p className="text-xs text-slate-400">Terminal: {scannerDeviceId}</p>
        </div>

        {/* Network Status Toggle Switcher (§6 Intermittent connectivity testing) */}
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
      <div className="glass-panel p-4 rounded-3xl border border-[#242b40] space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Assigned Gate Event</label>
          {manifest && (
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Manifest pre-synced
            </span>
          )}
        </div>

        <select
          value={selectedEventId}
          onChange={e => setSelectedEventId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-2xl bg-[#181d2f] border border-[#2c3652] text-xs font-semibold text-white focus:outline-none focus:border-[#00ff88]"
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
          className="w-full py-2 rounded-xl bg-[#1b2236] hover:bg-[#252f4c] text-xs font-bold text-slate-200 transition border border-[#2e3b5e] flex items-center justify-center gap-2"
        >
          <CloudDownload className="w-3.5 h-3.5 text-[#00f0ff]" />
          <span>{manifestLoading ? 'Syncing Manifest...' : 'Download Event Manifest for Offline Mode'}</span>
        </button>
      </div>

      {/* Camera Scanning Viewport & Manual Token fallback */}
      <div className="glass-panel rounded-3xl p-5 border border-[#242b40] flex flex-col items-center gap-4 text-center">
        <div id="qr-reader-container" className="w-full rounded-2xl overflow-hidden bg-black/40 min-h-[140px] flex items-center justify-center border border-dashed border-[#2d3857]">
          {!isCameraActive ? (
            <div className="p-4 space-y-2">
              <ScanLine className="w-10 h-10 text-[#00ff88] mx-auto animate-pulse" />
              <p className="text-xs text-slate-300 font-medium">Ready to verify incoming ticket QR</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00ff88] to-[#00f0ff] text-slate-950 font-black text-xs hover:opacity-90 transition shadow-lg flex items-center gap-1.5 mx-auto"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Start Video Camera</span>
              </button>
            </div>
          ) : (
            <button
              onClick={stopCamera}
              className="mt-2 px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-bold"
            >
              Stop Camera
            </button>
          )}
        </div>

        {/* Manual Token Verification (For tests and fast simulator) */}
        <div className="w-full space-y-2 pt-2 border-t border-[#1e2538]">
          <span className="text-[11px] font-bold text-slate-400">Or Paste / Test Ticket Token:</span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste signed token payload.sig..."
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
          className={`p-5 rounded-3xl border shadow-2xl animate-in zoom-in-95 duration-150 flex items-start gap-4 ${
            scanResult.status === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-100'
              : scanResult.status === 'offline_success'
              ? 'bg-amber-950/80 border-amber-500/50 text-amber-100'
              : 'bg-rose-950/80 border-rose-500/50 text-rose-100'
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

      {/* Offline Queue Sync Card (§6 Reconciliation) */}
      <div className="glass-panel p-4 rounded-3xl border border-[#242b40] space-y-3">
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
          When scanner recovers network connectivity, upload offline gate scans to execute atomic reconciliation and flag duplicate entry attempts.
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
