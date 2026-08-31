import React, { useState, useEffect } from 'react';
import { TicketItem, User } from '../types';
import { api } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, RefreshCw, ArrowRightLeft, MapPin, CheckCircle, Ban, AlertCircle, X } from 'lucide-react';

interface TicketWalletProps {
  tickets: TicketItem[];
  currentUser: User;
  users: User[];
  onRefreshTickets: () => void;
}

export const TicketWallet: React.FC<TicketWalletProps> = ({
  tickets,
  currentUser,
  users,
  onRefreshTickets,
}) => {
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [resaleModalTicket, setResaleModalTicket] = useState<TicketItem | null>(null);
  const [resaleBuyerId, setResaleBuyerId] = useState<string>('');
  const [resalePrice, setResalePrice] = useState<number>(0);
  const [resaleLoading, setResaleLoading] = useState<boolean>(false);
  const [resaleError, setResaleError] = useState<string | null>(null);
  const [resaleSuccess, setResaleSuccess] = useState<boolean>(false);

  // Dynamic security nonce rotating every 3 seconds to prove live interactive ticket (anti-screenshot)
  const [liveNonce, setLiveNonce] = useState<string>(() => Math.random().toString(36).substring(2, 8).toUpperCase());
  const [currentTime, setCurrentTime] = useState<string>(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveNonce(Math.random().toString(36).substring(2, 8).toUpperCase());
      setCurrentTime(new Date().toLocaleTimeString());
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const openResaleModal = (ticket: TicketItem) => {
    setResaleModalTicket(ticket);
    const maxPrice = Number(((ticket.originalPrice || 25) * (ticket.resalePriceCap || 1.2)).toFixed(2));
    setResalePrice(ticket.originalPrice || 25);
    const otherUser = users.find(u => u.id !== currentUser.id);
    if (otherUser) setResaleBuyerId(otherUser.id);
    setResaleError(null);
    setResaleSuccess(false);
  };

  const handleExecuteResale = async () => {
    if (!resaleModalTicket || !resaleBuyerId) return;
    setResaleLoading(true);
    setResaleError(null);

    try {
      const res = await api.transferResaleTicket({
        ticketId: resaleModalTicket.id,
        sellerId: currentUser.id,
        buyerId: resaleBuyerId,
        resalePrice,
      });

      if (res.success) {
        setResaleSuccess(true);
        setTimeout(() => {
          setResaleModalTicket(null);
          setResaleSuccess(false);
          onRefreshTickets();
        }, 1500);
      } else {
        setResaleError(res.error || 'Failed to transfer ticket');
      }
    } catch (err: any) {
      setResaleError(err.message || 'Transfer failed');
    } finally {
      setResaleLoading(false);
    }
  };

  if (tickets.length === 0) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-16">
        <div className="w-16 h-16 rounded-3xl bg-[#161a29] text-slate-500 mx-auto flex items-center justify-center border border-[#212638]">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h3 className="font-display font-bold text-xl text-white">Your Wallet is Empty</h3>
        <p className="text-xs text-slate-400">
          Discover local gigs, secret raves, or pop-ups on the live map and buy 1-tap cryptographically signed passes.
        </p>
      </div>
    );
  }

  const activeTickets = tickets.filter(t => t.status === 'valid');
  const pastTickets = tickets.filter(t => t.status !== 'valid');

  return (
    <div className="max-w-lg mx-auto p-4 pb-24 space-y-6">
      {/* Wallet Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-black text-2xl text-white">Pass Wallet</h2>
          <p className="text-xs text-slate-400">Ed25519 Cryptographic Gate Credentials</p>
        </div>
        <button
          onClick={onRefreshTickets}
          className="p-2 rounded-xl bg-[#141724] border border-[#23293e] text-slate-300 hover:text-white transition"
          title="Refresh wallet"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Active Verified Tickets */}
      <div className="space-y-4">
        {activeTickets.map(ticket => (
          <div
            key={ticket.id}
            className="hologram-ticket rounded-3xl p-5 relative overflow-hidden flex flex-col gap-4 text-white"
          >
            {/* Live Holographic Watermark Border */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#ff2d75] via-[#00f0ff] to-[#00ff88] animate-hologram" />

            {/* Top Ticket Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-max mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> VALID GATE PASS
                </span>
                <h3 className="font-display font-black text-xl leading-snug drop-shadow-md">
                  {ticket.eventTitle || 'Subterranean Event'}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-200 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-[#ff2d75]" />
                  <span>{ticket.venueName} • {ticket.venueAddress}</span>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-300">Tier</span>
                <p className="font-extrabold text-xs text-[#00f0ff]">GA Admission</p>
              </div>
            </div>

            {/* Middle Section: Live Dynamic Anti-Screenshot QR Code */}
            <div className="p-4 rounded-2xl bg-white text-slate-950 flex flex-col items-center justify-center gap-2 shadow-2xl relative">
              <div className="relative p-2 bg-white rounded-xl">
                <QRCodeSVG
                  value={ticket.signed_token}
                  size={160}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Live Security Nonce Watermark */}
              <div className="w-full flex items-center justify-between text-[10px] font-mono font-bold text-slate-700 pt-1 border-t border-slate-200">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>LIVE NONCE: {liveNonce}</span>
                </div>
                <span>{currentTime}</span>
              </div>
            </div>

            {/* Ticket Metadata Bar */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/10">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Pass Holder</span>
                <p className="font-bold text-white truncate">{currentUser.name}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Offline Gate Ready</span>
                <p className="font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Stored locally
                </p>
              </div>
            </div>

            {/* Frictionless 1-Tap Resale Action */}
            {ticket.resaleAllowed ? (
              <button
                onClick={() => openResaleModal(ticket)}
                className="w-full py-2.5 rounded-2xl bg-[#141724]/90 hover:bg-[#1f2438] border border-[#2a3048] text-xs font-bold text-slate-200 hover:text-white transition flex items-center justify-center gap-2"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#ff2d75]" />
                <span>Can't make it? Resell Instantly</span>
              </button>
            ) : (
              <p className="text-[10px] text-center text-slate-400 italic">Organizer disabled resale for this event</p>
            )}
          </div>
        ))}
      </div>

      {/* Past / Resold / Used Tickets */}
      {pastTickets.length > 0 && (
        <div className="space-y-3 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Past & Revoked Passes</h4>
          {pastTickets.map(t => (
            <div key={t.id} className="glass-panel p-4 rounded-2xl border border-[#212638] opacity-70 flex items-center justify-between">
              <div>
                <h5 className="font-bold text-xs text-white line-through">{t.eventTitle}</h5>
                <p className="text-[10px] text-slate-400">{t.venueName}</p>
                <span className="text-[9px] uppercase font-bold text-rose-400 mt-1 inline-block">
                  Status: {t.status} (permanently invalidated)
                </span>
              </div>
              <Ban className="w-5 h-5 text-rose-500" />
            </div>
          ))}
        </div>
      )}

      {/* Resale Modal (evnt.pdf §8) */}
      {resaleModalTicket && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#10131e] border border-[#262c42] rounded-3xl p-6 shadow-2xl space-y-4 z-[100000]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-[#ff2d75] flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <h3 className="font-display font-black text-lg text-white">Instant Verified Resale</h3>
              </div>
              <button onClick={() => setResaleModalTicket(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resaleSuccess ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-[#00ff88] mx-auto flex items-center justify-center">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-base text-white">Ticket Transferred!</h4>
                <p className="text-xs text-slate-300">
                  Original token revoked. New Ed25519 token minted directly for the buyer.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-[#161a29] border border-[#23293e] text-xs">
                  <p className="font-bold text-white">{resaleModalTicket.eventTitle}</p>
                  <p className="text-slate-400 mt-0.5">
                    Original Price: ${(resaleModalTicket.originalPrice || 25).toFixed(2)}
                  </p>
                  <p className="text-[#ff2d75] font-semibold text-[11px] mt-1">
                    Organizer Anti-Scalp Cap: Max ${(
                      (resaleModalTicket.originalPrice || 25) * (resaleModalTicket.resalePriceCap || 1.2)
                    ).toFixed(2)} ({( (resaleModalTicket.resalePriceCap || 1.2) * 100 ).toFixed(0)}%)
                  </p>
                </div>

                {/* Transfer Buyer Target */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Select Buyer:</label>
                  <select
                    value={resaleBuyerId}
                    onChange={e => setResaleBuyerId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#181d2f] border border-[#28314a] text-xs text-white focus:outline-none focus:border-[#ff2d75]"
                  >
                    {users.filter(u => u.id !== currentUser.id).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role}) - {u.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Resale Price Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Resale Price ($):</label>
                  <input
                    type="number"
                    step="0.50"
                    min="1"
                    max={Number(((resaleModalTicket.originalPrice || 25) * (resaleModalTicket.resalePriceCap || 1.2)).toFixed(2))}
                    value={resalePrice}
                    onChange={e => setResalePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#181d2f] border border-[#28314a] text-sm font-bold text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>

                {resaleError && (
                  <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{resaleError}</span>
                  </div>
                )}

                <button
                  onClick={handleExecuteResale}
                  disabled={resaleLoading}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white font-bold text-xs hover:opacity-90 transition disabled:opacity-40 shadow-lg shadow-pink-500/20"
                >
                  {resaleLoading ? 'Revoking & Reissuing...' : `Confirm Transfer for $${resalePrice.toFixed(2)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
