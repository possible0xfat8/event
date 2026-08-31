import React, { useState } from 'react';
import { EventItem, User, TicketItem } from '../types';
import { api } from '../services/api';
import confetti from 'canvas-confetti';
import { X, CheckCircle2, AlertTriangle, CreditCard, Sparkles, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';

interface CheckoutModalProps {
  event: EventItem;
  quantity: number;
  currentUser: User;
  onClose: () => void;
  onSuccess: (tickets: TicketItem[]) => void;
  onJoinWaitlist: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  event,
  quantity,
  currentUser,
  onClose,
  onSuccess,
  onJoinWaitlist,
}) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'optimistic_success' | 'confirmed' | 'sold_out_error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issuedTickets, setIssuedTickets] = useState<TicketItem[]>([]);

  const totalPrice = Number((event.price * quantity).toFixed(2));

  const handleExecutePurchase = async () => {
    setStatus('processing');
    const idempotencyKey = `idem_${currentUser.id}_${event.id}_${Date.now()}`;

    // Optimistic trigger after 200ms
    setTimeout(() => {
      if (status === 'processing') {
        setStatus('optimistic_success');
      }
    }, 250);

    try {
      const res = await api.purchaseTicket({
        eventId: event.id,
        buyerUserId: currentUser.id,
        quantity,
        idempotencyKey,
      });

      if (res.success && res.tickets) {
        setIssuedTickets(res.tickets);
        setStatus('confirmed');

        // Confetti celebration
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#ff2d75', '#00f0ff', '#9d4edd', '#00ff88'],
          });
        } catch (_) {}
      } else {
        setStatus('sold_out_error');
        setErrorMessage(res.error || 'The event just sold out while processing.');
      }
    } catch (err: any) {
      setStatus('sold_out_error');
      setErrorMessage(err.message || 'Connection interrupted. Your account was not charged.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#10131e] border border-[#262c42] rounded-3xl p-6 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Glow Accent */}
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[#ff2d75]/20 blur-3xl pointer-events-none" />

        {/* State 1: Ready to Purchase */}
        {status === 'idle' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-[#ff2d75] flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <h3 className="font-display font-black text-lg text-white">Instant 1-Tap Checkout</h3>
              </div>
              <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Summary Box */}
            <div className="p-4 rounded-2xl bg-[#161a29] border border-[#23293e] space-y-3">
              <div className="flex items-center gap-3">
                <img src={event.image_url} alt={event.title} className="w-12 h-12 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">{event.title}</h4>
                  <p className="text-[11px] text-slate-400">{event.venue_name}</p>
                </div>
              </div>

              <div className="border-t border-[#23293e] pt-2 space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>General Admission ({quantity}x)</span>
                  <span>${event.price.toFixed(2)} ea</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Anti-Scalper Vault Fee</span>
                  <span className="text-[#00ff88] font-bold">FREE ($0.00)</span>
                </div>
                <div className="flex justify-between text-white font-black text-sm pt-1 border-t border-[#23293e]">
                  <span>Total Due</span>
                  <span className="text-[#ff2d75]">${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment Method Card Simulation */}
            <div className="p-3.5 rounded-2xl bg-[#181d2f] border border-[#2c3550] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-7 rounded-md bg-gradient-to-tr from-slate-900 to-slate-700 border border-white/20 flex items-center justify-center text-[9px] font-bold text-white tracking-widest">
                  APPLE
                </div>
                <div className="text-xs">
                  <p className="font-bold text-white">Apple Pay (•••• 8821)</p>
                  <p className="text-[10px] text-slate-400">Tokenized PCI-Vault</p>
                </div>
              </div>
              <ShieldCheck className="w-4 h-4 text-[#00ff88]" />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleExecutePurchase}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white font-bold text-sm hover:opacity-95 transition shadow-xl shadow-pink-500/25 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Confirm & Pay ${totalPrice.toFixed(2)}</span>
            </button>
          </div>
        )}

        {/* State 2: Optimistic / In-Progress UI (evnt.pdf §7) */}
        {(status === 'processing' || status === 'optimistic_success') && (
          <div className="py-8 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#ff2d75]/30 animate-ping" />
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#ff2d75] to-[#9d4edd] flex items-center justify-center text-white shadow-xl">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
            </div>
            <div>
              <h3 className="font-display font-black text-xl text-white">You're in! Securing Vault Tickets...</h3>
              <p className="text-xs text-slate-400 mt-1">Executing atomic reservation & minting Ed25519 signature...</p>
            </div>
          </div>
        )}

        {/* State 3: Confirmed Success */}
        {status === 'confirmed' && (
          <div className="py-6 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-[#00ff88] mx-auto flex items-center justify-center border border-[#00ff88]/30 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-display font-black text-2xl text-white">Tickets Confirmed!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Your cryptographic passes have been signed and stored in your offline wallet.
              </p>
            </div>

            <button
              onClick={() => {
                onSuccess(issuedTickets);
                onClose();
              }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00ff88] to-[#00f0ff] text-slate-950 font-black text-sm hover:opacity-90 transition shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <span>View Ticket in Wallet</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* State 4: Honest Sold-Out Race Failure (evnt.pdf §7) */}
        {status === 'sold_out_error' && (
          <div className="py-5 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center border border-amber-500/30">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-display font-bold text-xl text-white">Just Missed It!</h3>
              <p className="text-xs text-slate-300 mt-1.5">
                {errorMessage || 'Someone snapped up the last ticket micro-seconds ahead in the race.'}
              </p>
              <p className="text-[11px] text-emerald-400 font-medium mt-1">
                Zero funds were deducted from your account.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  onJoinWaitlist();
                  onClose();
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs hover:opacity-90 transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Join Priority Waitlist</span>
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-2xl bg-[#181d2c] text-slate-400 text-xs font-semibold hover:text-white transition"
              >
                Explore Other Shows
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
