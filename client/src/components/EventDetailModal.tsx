import React, { useState, useEffect } from 'react';
import { EventItem, User } from '../types';
import { api } from '../services/api';
import { X, MapPin, Clock, ShieldCheck, Users, Eye, Sparkles, AlertCircle, Heart, Flame, ThumbsUp, Send } from 'lucide-react';

interface EventDetailModalProps {
  event: EventItem;
  onClose: () => void;
  onBuyTickets: (event: EventItem, quantity: number) => void;
  currentUser: User;
  onRefreshEvent: () => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  onClose,
  onBuyTickets,
  currentUser,
  onRefreshEvent,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [goingVisibility, setGoingVisibility] = useState<'private' | 'friends_only' | 'public'>('private');
  const [isUpdatingGoing, setIsUpdatingGoing] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [newReviewReaction, setNewReviewReaction] = useState<'fire' | 'love' | 'hype' | 'meh'>('fire');
  const [newReviewComment, setNewReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    // Fetch current user's going status
    api.getGoingStatus(event.id, currentUser.id).then(res => {
      if (res.userGoing) {
        setGoingVisibility(res.userGoing.visibility);
      }
    });
  }, [event.id, currentUser.id]);

  const handleGoingChange = async (newVis: 'private' | 'friends_only' | 'public') => {
    setIsUpdatingGoing(true);
    setGoingVisibility(newVis);
    try {
      await api.setGoingStatus(currentUser.id, event.id, newVis);
      onRefreshEvent();
    } catch (err) {
      console.error('Failed to update going status', err);
    } finally {
      setIsUpdatingGoing(false);
    }
  };

  const handleJoinWaitlist = async () => {
    setWaitlistLoading(true);
    try {
      const res = await api.joinWaitlist(event.id, currentUser.id);
      if (res.success) {
        setWaitlistPosition(res.position);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewComment.trim()) return;
    setSubmittingReview(true);
    try {
      await api.submitEventReview(event.id, currentUser.id, newReviewReaction, newReviewComment);
      setNewReviewComment('');
      onRefreshEvent();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const isSoldOut = event.tickets_remaining <= 0;
  const capacityPercent = Math.min(100, Math.round(((event.capacity - event.tickets_remaining) / event.capacity) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0e111a] border border-[#212638] sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-200">
        {/* Cover Photo & Floating Close */}
        <div className="relative h-56 w-full flex-shrink-0">
          <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e111a] via-[#0e111a]/40 to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition border border-white/10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="absolute top-3.5 left-3.5 px-3 py-1 rounded-full bg-black/60 text-white text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-white/10 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ff2d75] animate-pulse" />
            {event.category}
          </div>

          <div className="absolute bottom-3 left-4 right-4">
            <h2 className="font-display font-black text-2xl text-white leading-tight drop-shadow-md">
              {event.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-300 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#ff2d75]" />
              <span className="font-semibold">{event.venue_name}</span>
              <span>•</span>
              <span>{event.venue_address}</span>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Vibe Tags */}
          <div className="flex flex-wrap gap-1.5">
            {event.vibe_tags.map(tag => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-lg bg-[#181d2c] border border-[#262f47] text-[11px] font-medium text-slate-300"
              >
                #{tag}
              </span>
            ))}
          </div>

          {/* Date & Time and Inventory Bar */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-panel p-3 rounded-2xl">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span>Doors Open</span>
              </div>
              <p className="text-xs font-bold text-white">
                {new Date(event.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              <p className="text-[11px] text-[#00f0ff] font-semibold">
                {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            <div className="glass-panel p-3 rounded-2xl">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Gate Capacity</span>
                <span className={isSoldOut ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {isSoldOut ? 'Sold Out' : `${event.tickets_remaining} left`}
                </span>
              </div>
              <div className="w-full h-2 bg-[#1c2233] rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all duration-500 ${
                    capacityPercent > 85 ? 'bg-gradient-to-r from-amber-500 to-red-500' : 'bg-gradient-to-r from-[#00f0ff] to-[#00ff88]'
                  }`}
                  style={{ width: `${capacityPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{capacityPercent}% full ({event.capacity - event.tickets_remaining}/{event.capacity})</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Experience</h4>
            <p className="text-xs text-slate-300 leading-relaxed">{event.description}</p>
          </div>

          {/* Social Proof & Privacy-First "Going" Control (evnt.pdf §9) */}
          <div className="glass-panel p-4 rounded-2xl border border-[#2a3048] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#9d4edd]" />
                <h4 className="text-xs font-bold text-white">Social Layer (Privacy First)</h4>
              </div>
              <span className="text-[10px] text-slate-400">Opt-in attendance</span>
            </div>

            {/* Friends Attending List */}
            {event.friendsGoingCount > 0 ? (
              <div className="p-2.5 rounded-xl bg-[#141724] border border-[#212638] flex items-center gap-3">
                <div className="flex -space-x-2">
                  {event.friendsGoingPreview.map(f => (
                    <img key={f.friendId} src={f.avatar} alt={f.friendName} className="w-7 h-7 rounded-full border-2 border-[#12141e] object-cover" />
                  ))}
                </div>
                <div className="text-xs text-slate-200">
                  <span className="font-semibold text-white">{event.friendsGoingPreview.map(f => f.friendName.split(' ')[0]).join(', ')}</span>
                  <span className="text-slate-400"> {event.friendsGoingCount > 1 ? 'are going' : 'is going'}</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">No mutual friends have opted into sharing attendance for this event yet.</p>
            )}

            {/* Going Visibility Selector */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#ff2d75]" />
                <span>Your Attendance Privacy:</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['private', 'friends_only', 'public'] as const).map(vis => (
                  <button
                    key={vis}
                    onClick={() => handleGoingChange(vis)}
                    disabled={isUpdatingGoing}
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-bold capitalize transition border ${
                      goingVisibility === vis
                        ? 'bg-[#9d4edd]/20 border-[#9d4edd] text-white shadow-sm'
                        : 'bg-[#141724] border-[#212638] text-slate-400 hover:bg-[#1a1f30]'
                    }`}
                  >
                    {vis === 'friends_only' ? 'Friends Only' : vis}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-slate-500">
                {goingVisibility === 'private'
                  ? '🔒 Private by default: Zero attendance data is shared or returned to anyone.'
                  : goingVisibility === 'friends_only'
                  ? '👥 Visible strictly to mutual friends who also browse this event.'
                  : '🌐 Public: Visible on the event public counter.'}
              </p>
            </div>
          </div>

          {/* Cryptographic Gate Verification Guarantees (§6, §11) */}
          <div className="p-3 rounded-2xl bg-[#121624] border border-[#212b45] flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#00ff88] flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-slate-300">
              <span className="font-bold text-white">Ed25519 Cryptographic Guarantee:</span> Anti-scalper ticket.
              Dynamic rotating watermark prevents screenshots. Verifiable by staff offline at door gates.
            </div>
          </div>

          {/* Post-Event Photo Loop & Reviews (§10.6) */}
          {event.reviews && event.reviews.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Post-Event Reactions</h4>
              <div className="space-y-2">
                {event.reviews.map(rev => (
                  <div key={rev.id} className="p-3 rounded-xl bg-[#141724] border border-[#212638] text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white">{rev.userName || 'Attendee'}</span>
                      <span className="text-base">
                        {rev.reaction === 'fire' ? '🔥' : rev.reaction === 'love' ? '❤️' : rev.reaction === 'hype' ? '⚡' : '👍'}
                      </span>
                    </div>
                    {rev.comment && <p className="text-slate-300 text-[11px]">{rev.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leave a review/reaction */}
          <form onSubmit={handleReviewSubmit} className="space-y-2 pt-1 border-t border-[#1e2438]">
            <span className="text-[11px] font-semibold text-slate-400">Add Live Reaction:</span>
            <div className="flex items-center gap-2">
              {(['fire', 'love', 'hype', 'meh'] as const).map(react => (
                <button
                  key={react}
                  type="button"
                  onClick={() => setNewReviewReaction(react)}
                  className={`p-2 rounded-xl text-base transition border ${
                    newReviewReaction === react
                      ? 'bg-[#ff2d75]/20 border-[#ff2d75] scale-110'
                      : 'bg-[#141724] border-[#212638] opacity-60 hover:opacity-100'
                  }`}
                >
                  {react === 'fire' ? '🔥' : react === 'love' ? '❤️' : react === 'hype' ? '⚡' : '👍'}
                </button>
              ))}

              <input
                type="text"
                placeholder="Drop a note (e.g. insane sound!)..."
                value={newReviewComment}
                onChange={e => setNewReviewComment(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-[#141724] border border-[#212638] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff2d75]"
              />

              <button
                type="submit"
                disabled={submittingReview || !newReviewComment.trim()}
                className="p-2 rounded-xl bg-[#ff2d75] text-white hover:opacity-90 disabled:opacity-40 transition"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>

        {/* Bottom Sticky Action Bar */}
        <div className="p-4 glass-panel border-t border-[#212638] flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Price</div>
            <div className="font-display font-black text-xl text-white">
              ${(event.price * quantity).toFixed(2)}
            </div>
          </div>

          {isSoldOut ? (
            <div className="flex-1 flex justify-end">
              {waitlistPosition !== null ? (
                <div className="px-4 py-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>On Waitlist (# {waitlistPosition})</span>
                </div>
              ) : (
                <button
                  onClick={handleJoinWaitlist}
                  disabled={waitlistLoading}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold hover:opacity-90 transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{waitlistLoading ? 'Joining...' : 'Join Waitlist Queue'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Quantity Stepper */}
              <div className="flex items-center rounded-2xl bg-[#181d2c] border border-[#28324a] p-1">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-7 h-7 rounded-xl bg-[#121624] text-white font-bold flex items-center justify-center hover:bg-[#20273c] transition"
                >
                  -
                </button>
                <span className="w-8 text-center text-xs font-bold text-white">{quantity}</span>
                <button
                  onClick={() => setQuantity(Math.min(event.tickets_remaining, quantity + 1))}
                  className="w-7 h-7 rounded-xl bg-[#121624] text-white font-bold flex items-center justify-center hover:bg-[#20273c] transition"
                >
                  +
                </button>
              </div>

              {/* 1-Tap Purchase Button */}
              <button
                onClick={() => onBuyTickets(event, quantity)}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white text-xs font-bold hover:opacity-90 transition shadow-xl shadow-pink-500/25 flex items-center gap-2"
              >
                <span>Instant 1-Tap Buy</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
