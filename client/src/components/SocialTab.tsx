import React from 'react';
import { User, EventItem } from '../types';
import { Users, Shield, Lock, Eye, Sparkles, MapPin } from 'lucide-react';

interface SocialTabProps {
  currentUser: User;
  users: User[];
  events: EventItem[];
  onOpenEvent: (event: EventItem) => void;
}

export const SocialTab: React.FC<SocialTabProps> = ({
  currentUser,
  users,
  events,
  onOpenEvent,
}) => {
  const friends = users.filter(u => u.id !== currentUser.id && u.role === 'attendee');
  const eventsWithFriends = events.filter(e => e.friendsGoingCount > 0);

  return (
    <div className="max-w-lg mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#9d4edd]" />
          <h2 className="font-display font-black text-2xl text-white">Social "Going" Layer</h2>
        </div>
        <p className="text-xs text-slate-400">Privacy-First Event Coordination & Social Proof</p>
      </div>

      {/* Privacy Notice Card (evnt.pdf §9) */}
      <div className="glass-panel p-4 rounded-3xl border border-[#2a3048] space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Shield className="w-4 h-4 text-[#00f0ff]" />
          <span>Zero Surveillance: Privacy-By-Default</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your attendance is strictly private by default. When you RSVP or buy a ticket, zero attendance signals are published unless you explicitly opt in to share with mutual friends.
        </p>
      </div>

      {/* Events with Friends Going */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-white">Events Your Friends Are Attending</h3>
          <span className="text-xs text-[#9d4edd] font-semibold">{eventsWithFriends.length} Active</span>
        </div>

        {eventsWithFriends.length > 0 ? (
          eventsWithFriends.map(evt => (
            <div
              key={evt.id}
              onClick={() => onOpenEvent(evt)}
              className="glass-panel p-4 rounded-3xl border border-[#23293e] hover:border-[#9d4edd]/50 transition cursor-pointer shadow-lg space-y-3"
            >
              <div className="flex items-center gap-3">
                <img src={evt.image_url} alt={evt.title} className="w-14 h-14 rounded-2xl object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-[#ff2d75]">{evt.category}</span>
                    <span className="text-xs font-black text-white">${evt.price.toFixed(2)}</span>
                  </div>
                  <h4 className="font-bold text-sm text-white truncate">{evt.title}</h4>
                  <p className="text-[11px] text-slate-400 truncate">{evt.venue_name}</p>
                </div>
              </div>

              {/* Friends Facepile & Opt-In Status */}
              <div className="p-2.5 rounded-2xl bg-[#141724] border border-[#212638] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {evt.friendsGoingPreview.map(f => (
                      <img key={f.friendId} src={f.avatar} alt={f.friendName} className="w-6 h-6 rounded-full border-2 border-[#12141e] object-cover" />
                    ))}
                  </div>
                  <span className="text-xs text-white font-semibold">
                    {evt.friendsGoingPreview.map(f => f.friendName.split(' ')[0]).join(', ')}
                  </span>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#9d4edd]/20 text-purple-300 border border-purple-500/30">
                  Opted In
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="p-6 rounded-3xl bg-[#12141e] border border-[#212638] text-center text-xs text-slate-400">
            None of your mutual friends have opted into sharing attendance for upcoming events yet.
          </div>
        )}
      </div>

      {/* Mutual Friends Network */}
      <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
        <h3 className="font-display font-bold text-sm text-white">Your Mutual Circle ({friends.length})</h3>
        <div className="grid grid-cols-1 gap-2.5">
          {friends.map(friend => (
            <div key={friend.id} className="p-3 rounded-2xl bg-[#141724] border border-[#202538] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={friend.avatar} alt={friend.name} className="w-8 h-8 rounded-full object-cover" />
                <div>
                  <h5 className="font-bold text-xs text-white">{friend.name}</h5>
                  <p className="text-[10px] text-slate-400">{friend.email}</p>
                </div>
              </div>
              <span className="px-2 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                Connected
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
