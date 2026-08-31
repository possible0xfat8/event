import React from 'react';
import { NotificationItem } from '../types';
import { X, Ticket, ArrowRightLeft, Sparkles, Users, Bell } from 'lucide-react';

interface NotificationDrawerProps {
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkRead: (notifId: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  notifications,
  onClose,
  onMarkRead,
}) => {
  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'ticket_issued':
        return <Ticket className="w-4 h-4 text-[#00ff88]" />;
      case 'resale_sold':
      case 'resale_purchased':
        return <ArrowRightLeft className="w-4 h-4 text-[#ff2d75]" />;
      case 'waitlist_alert':
        return <Sparkles className="w-4 h-4 text-amber-400" />;
      case 'friend_going':
        return <Users className="w-4 h-4 text-[#9d4edd]" />;
      default:
        return <Bell className="w-4 h-4 text-[#00f0ff]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm h-full bg-[#10131e] border-l border-[#212638] shadow-2xl p-5 flex flex-col gap-4 animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#212638]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#ff2d75]" />
            <h3 className="font-display font-black text-lg text-white">Event Alerts</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5">
          {notifications.length > 0 ? (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.read && onMarkRead(n.id)}
                className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                  n.read
                    ? 'bg-[#141724]/60 border-[#1e2336] opacity-75'
                    : 'bg-[#181d2f] border-[#2c3754] shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-[#10131e] border border-[#232a3e] mt-0.5">
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-xs text-white">{n.title}</h4>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{n.message}</p>
                    <span className="text-[9px] text-slate-500 mt-1.5 block">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">No alerts yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
