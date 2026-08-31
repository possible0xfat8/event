import React, { useState } from 'react';
import { User, NotificationItem } from '../types';
import { MapPin, Bell, Radio, Navigation, Compass } from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  users: User[];
  onSelectUser: (user: User) => void;
  selectedCity: { name: string; lat: number; lng: number; isLiveGps?: boolean };
  onSelectCity: (city: { name: string; lat: number; lng: number; isLiveGps?: boolean }) => void;
  onDetectLiveLocation: () => void;
  isDetectingLocation: boolean;
  notifications: NotificationItem[];
  onOpenNotifications: () => void;
  networkStatus: 'online' | 'offline' | 'spotty';
}

const REGIONS = [
  { name: 'Lagos (VI / Lekki / Ikeja)', lat: 6.4281, lng: 3.4219 },
  { name: 'Abuja (Wuse / Garki)', lat: 9.0765, lng: 7.4721 },
  { name: 'Port Harcourt / Niger Delta', lat: 4.8156, lng: 7.0498 },
  { name: 'London Soho', lat: 51.5134, lng: -0.1365 },
  { name: 'Brooklyn & NYC', lat: 40.7128, lng: -73.9500 },
];

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  users,
  onSelectUser,
  selectedCity,
  onSelectCity,
  onDetectLiveLocation,
  isDetectingLocation,
  notifications,
  onOpenNotifications,
  networkStatus,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCityMenu, setShowCityMenu] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-[#212638] px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Left: Brand + Live GPS Location Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer select-none">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#ff2d75] to-[#9d4edd] flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Radio className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-100 to-[#ff2d75]">
                EVNT
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[#00f0ff] font-semibold -mt-1 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-[#00f0ff] animate-ping" /> LIVE NEARBY
              </span>
            </div>
          </div>

          {/* Location Selector / GPS Switcher */}
          <div className="relative z-[999]">
            <button
              onClick={() => setShowCityMenu(!showCityMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
                selectedCity.isLiveGps
                  ? 'bg-[#00f0ff]/15 border-[#00f0ff]/40 text-[#00f0ff] shadow-sm'
                  : 'bg-[#181b29] hover:bg-[#22273b] border-[#2a3048] text-slate-200'
              }`}
            >
              {selectedCity.isLiveGps ? (
                <Navigation className="w-3.5 h-3.5 text-[#00f0ff] animate-pulse" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-[#ff2d75]" />
              )}
              <span className="max-w-[140px] sm:max-w-[200px] truncate">{selectedCity.name}</span>
            </button>

            {showCityMenu && (
              <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-[#12141e] border border-[#2a3048] shadow-2xl p-2 z-[9999] animate-in fade-in zoom-in-95 duration-150">
                {/* Live GPS Button */}
                <button
                  onClick={() => {
                    onDetectLiveLocation();
                    setShowCityMenu(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff]/20 to-[#9d4edd]/20 border border-[#00f0ff]/40 text-xs font-bold text-white mb-2 flex items-center gap-2 hover:opacity-90 transition shadow-md"
                >
                  <Compass className={`w-4 h-4 text-[#00f0ff] ${isDetectingLocation ? 'animate-spin' : ''}`} />
                  <div className="flex-1">
                    <div>{isDetectingLocation ? 'Locating GPS...' : 'Use My Live GPS Location'}</div>
                    <span className="text-[10px] text-cyan-300 font-normal">Auto-center on my real location</span>
                  </div>
                </button>

                <div className="text-[10px] uppercase font-bold text-slate-400 px-2.5 py-1">Featured Regions</div>
                {REGIONS.map(r => (
                  <button
                    key={r.name}
                    onClick={() => {
                      onSelectCity(r);
                      setShowCityMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                      selectedCity.name === r.name && !selectedCity.isLiveGps
                        ? 'bg-[#ff2d75]/15 text-[#ff2d75] font-semibold'
                        : 'text-slate-300 hover:bg-[#1c2033]'
                    }`}
                  >
                    <span>{r.name}</span>
                    {selectedCity.name === r.name && !selectedCity.isLiveGps && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff2d75]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Network Status, Notifications, User Persona Switcher */}
        <div className="flex items-center gap-2">
          {/* Network Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#141724] border border-[#212638] text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                networkStatus === 'online'
                  ? 'bg-emerald-400 animate-pulse'
                  : networkStatus === 'spotty'
                  ? 'bg-amber-400'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-300 capitalize font-medium">{networkStatus}</span>
          </div>

          {/* Notification Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-full bg-[#181b29] hover:bg-[#22273b] border border-[#2a3048] text-slate-300 hover:text-white transition"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ff2d75] text-[9px] font-bold text-white flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* User Persona Switcher */}
          <div className="relative z-[999]">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-[#181b29] hover:bg-[#22273b] border border-[#2a3048] transition"
            >
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-7 h-7 rounded-full object-cover border border-[#ff2d75]/50"
              />
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-200 truncate max-w-[100px]">{currentUser.name.split(' ')[0]}</span>
                <span className="text-[9px] uppercase tracking-wider text-[#9d4edd] font-bold">{currentUser.role}</span>
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#12141e] border border-[#2a3048] shadow-2xl p-2 z-[9999] animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-[#212638]">
                  <p className="text-xs font-semibold text-white">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-400">{currentUser.email}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/20 text-purple-300">
                      {currentUser.role} mode
                    </span>
                  </div>
                </div>

                <div className="py-1">
                  <div className="text-[10px] uppercase font-bold text-slate-500 px-3 py-1">Switch Persona</div>
                  {users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        onSelectUser(u);
                        setShowUserMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center gap-2.5 ${
                        currentUser.id === u.id
                          ? 'bg-[#ff2d75]/15 text-[#ff2d75] font-semibold'
                          : 'text-slate-300 hover:bg-[#1a1e30]'
                      }`}
                    >
                      <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{u.name}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{u.role}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
