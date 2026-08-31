import React from 'react';
import { Compass, Ticket, Users, BarChart3, ScanLine, ShieldCheck } from 'lucide-react';
import { UserRole } from '../types';

export type ActiveTab = 'explore' | 'wallet' | 'social' | 'organizer' | 'scanner' | 'admin';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  ticketCount: number;
  userRole: UserRole;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  highlight?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  ticketCount,
  userRole,
}) => {
  // Base navigation items available to all users (including attendees)
  const baseItems: NavItem[] = [
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'wallet', label: 'Wallet', icon: Ticket, badge: ticketCount > 0 ? ticketCount : undefined },
    { id: 'social', label: 'Social', icon: Users },
  ];

  // Role-specific items
  const navItems: NavItem[] = [...baseItems];

  if (userRole === 'staff') {
    // Staff sees Scanner first + Live gate operations
    navItems.push({ id: 'scanner', label: 'Door Scan', icon: ScanLine, highlight: true });
    navItems.push({ id: 'organizer', label: 'Live Gate', icon: BarChart3 });
  } else if (userRole === 'organizer') {
    // Organizers see Organizer mission control + Scanner
    navItems.push({ id: 'organizer', label: 'Organizer', icon: BarChart3, highlight: true });
    navItems.push({ id: 'scanner', label: 'Scanner', icon: ScanLine });
  } else if (userRole === 'admin') {
    // Super Admins see Admin Control + Organizer + Scanner
    navItems.push({ id: 'admin', label: 'Admin', icon: ShieldCheck, highlight: true });
    navItems.push({ id: 'organizer', label: 'Organizer', icon: BarChart3 });
    navItems.push({ id: 'scanner', label: 'Scanner', icon: ScanLine });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0e17]/95 backdrop-blur-2xl border-t border-[#1e2336] px-2 py-2 safe-bottom shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-[#ff2d75] scale-105'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[16px] h-4 rounded-full bg-[#ff2d75] text-white text-[9px] font-bold flex items-center justify-center shadow-lg shadow-pink-500/50 animate-pulse">
                    {item.badge}
                  </span>
                )}
                {item.highlight && !isActive && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#00f0ff] animate-ping" />
                )}
              </div>
              <span className={`text-[10px] mt-1 font-medium tracking-tight ${isActive ? 'font-bold text-white' : ''}`}>
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
