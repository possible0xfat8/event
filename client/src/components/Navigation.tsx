import React from 'react';
import { Compass, Ticket, Users, BarChart3, ScanLine } from 'lucide-react';

export type ActiveTab = 'explore' | 'wallet' | 'social' | 'organizer' | 'scanner';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  ticketCount: number;
  userRole: 'attendee' | 'organizer' | 'staff';
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  ticketCount,
  userRole,
}) => {
  const navItems = [
    { id: 'explore' as ActiveTab, label: 'Explore', icon: Compass },
    { id: 'wallet' as ActiveTab, label: 'Wallet', icon: Ticket, badge: ticketCount > 0 ? ticketCount : undefined },
    { id: 'social' as ActiveTab, label: 'Social', icon: Users },
    { id: 'organizer' as ActiveTab, label: 'Organizer', icon: BarChart3, highlight: userRole === 'organizer' },
    { id: 'scanner' as ActiveTab, label: 'Scanner', icon: ScanLine, highlight: userRole === 'staff' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0e17]/90 backdrop-blur-xl border-t border-[#1e2336] px-2 py-1.5 sm:py-2">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all duration-200 ${
                isActive
                  ? 'text-[#ff2d75] scale-105'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[16px] h-4 rounded-full bg-[#ff2d75] text-white text-[9px] font-bold flex items-center justify-center shadow-lg shadow-pink-500/50">
                    {item.badge}
                  </span>
                )}
                {item.highlight && !isActive && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#9d4edd] animate-pulse" />
                )}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${isActive ? 'font-bold text-white' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -bottom-1 w-6 h-0.5 rounded-full bg-[#ff2d75] shadow-[0_0_8px_#ff2d75]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
