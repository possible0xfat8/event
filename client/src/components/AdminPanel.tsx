import React, { useState, useEffect } from 'react';
import { User, EventItem, FraudAlertLog } from '../types';
import { api } from '../services/api';
import { 
  ShieldAlert, Users, Calendar, DollarSign, Key, Radio, 
  Search, CheckCircle2, AlertOctagon, RefreshCw, Send, 
  Lock, Settings, Sparkles, Filter, ChevronRight, Activity, Ban
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  onRefreshEvents: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onRefreshEvents,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'events' | 'security' | 'broadcast'>('overview');
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [searchEventQuery, setSearchEventQuery] = useState('');

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      const data = await api.getAdminOverview();
      if (data.success) {
        setAdminData(data);
      }
    } catch (err) {
      console.error('Failed to load admin overview', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.updateUserRole(userId, newRole);
      fetchOverview();
    } catch (err) {
      alert('Failed to update role');
    }
  };

  const handleEventStatusChange = async (eventId: string, newStatus: string) => {
    try {
      await api.updateEventStatus(eventId, newStatus);
      fetchOverview();
      onRefreshEvents();
    } catch (err) {
      alert('Failed to update event status');
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) return;
    setBroadcastLoading(true);
    setBroadcastSuccess(null);
    try {
      const res = await api.broadcastNotification(broadcastTitle.trim(), broadcastMsg.trim());
      if (res.success) {
        setBroadcastSuccess(`✓ Broadcast dispatched to ${res.broadcastCount} registered accounts!`);
        setBroadcastTitle('');
        setBroadcastMsg('');
        setTimeout(() => setBroadcastSuccess(null), 4000);
      }
    } catch (err: any) {
      alert(`Broadcast failed: ${err.message}`);
    } finally {
      setBroadcastLoading(false);
    }
  };

  if (loading || !adminData) {
    return (
      <div className="max-w-md mx-auto p-12 text-center text-xs text-slate-400">
        <Activity className="w-8 h-8 text-[#ff2d75] animate-spin mx-auto mb-3" />
        <span>Initializing Super Admin Command Center...</span>
      </div>
    );
  }

  const { platformMetrics, users, events, recentOrders, fraudAuditLogs } = adminData;

  const filteredUsers = users.filter((u: User) => 
    u.name.toLowerCase().includes(searchUserQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchUserQuery.toLowerCase())
  );

  const filteredEvents = events.filter((e: EventItem) => 
    e.title.toLowerCase().includes(searchEventQuery.toLowerCase()) || 
    e.venue_name.toLowerCase().includes(searchEventQuery.toLowerCase()) ||
    e.category.toLowerCase().includes(searchEventQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-4 pb-28 space-y-6">
      {/* Top Super Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e2538] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ff2d75] to-[#00f0ff] flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Lock className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-display font-black text-2xl text-white">Super Admin Command Center</h2>
              <p className="text-xs text-slate-400">Master Governance, Security & Platform Oversight</p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchOverview}
          className="px-3.5 py-2 rounded-xl bg-[#141724] hover:bg-[#1f2438] border border-[#262f47] text-xs font-semibold text-slate-300 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#00f0ff]" />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* Admin Sub-Navigation Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'overview', label: 'Platform Telemetry', icon: Activity },
          { id: 'users', label: `Users & Roles (${users.length})`, icon: Users },
          { id: 'events', label: `Global Events (${events.length})`, icon: Calendar },
          { id: 'security', label: `Security & Fraud (${platformMetrics.totalFraudAlerts})`, icon: ShieldAlert },
          { id: 'broadcast', label: 'System Broadcast', icon: Radio },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition shadow-sm ${
                isActive
                  ? 'bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white shadow-pink-500/20'
                  : 'bg-[#121522] text-slate-400 border border-[#212638] hover:text-white hover:bg-[#181d2f]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW TELEMETRY */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Main KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Gross Volume</span>
                <DollarSign className="w-4 h-4 text-[#00ff88]" />
              </div>
              <div className="font-display font-black text-2xl text-white">
                ${platformMetrics.grossVolume.toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold mt-1">
                Across {platformMetrics.totalOrders} paid orders
              </div>
            </div>

            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Total Passes Minted</span>
                <Key className="w-4 h-4 text-[#00f0ff]" />
              </div>
              <div className="font-display font-black text-2xl text-white">
                {platformMetrics.totalTickets}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {platformMetrics.totalUsedTickets} gate admitted
              </div>
            </div>

            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Active Listings</span>
                <Calendar className="w-4 h-4 text-[#9d4edd]" />
              </div>
              <div className="font-display font-black text-2xl text-white">
                {platformMetrics.totalEvents}
              </div>
              <div className="text-[10px] text-purple-300 font-semibold mt-1">
                Nigeria & Global Gigs
              </div>
            </div>

            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Fraud Flags</span>
                <ShieldAlert className="w-4 h-4 text-rose-500" />
              </div>
              <div className="font-display font-black text-2xl text-rose-400">
                {platformMetrics.totalFraudAlerts}
              </div>
              <div className="text-[10px] text-rose-400 font-semibold mt-1">
                Duplicate gate scans
              </div>
            </div>
          </div>

          {/* Cryptographic Engine Health Banner */}
          <div className="glass-panel-glow p-5 rounded-3xl border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-cyan-950/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-[#00f0ff] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Key className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-black text-base text-white">Ed25519 Cryptographic Verification Engine</h3>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {platformMetrics.cryptoStatus.status}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Curve: <span className="font-mono text-cyan-300">{platformMetrics.cryptoStatus.algorithm}</span> • Key Identifier: <span className="font-mono text-slate-400">{platformMetrics.cryptoStatus.keyId}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Offline manifest signature verifications active across all door handhelds.
                </p>
              </div>
            </div>

            <div className="px-4 py-2 rounded-2xl bg-[#10131e] border border-cyan-500/30 text-center sm:text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400">Anti-Scalper Resale Cap</span>
              <p className="font-display font-black text-sm text-[#ff2d75]">120% Max Price Rule</p>
            </div>
          </div>

          {/* Recent Orders Stream */}
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-base text-white">Live Platform Order Stream</h3>
              <span className="text-xs text-slate-400">{recentOrders.length} recent settlements</span>
            </div>

            <div className="space-y-2">
              {recentOrders.map((ord: any) => (
                <div key={ord.id} className="p-3 rounded-2xl bg-[#141724] border border-[#20263a] flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{ord.eventTitle}</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Buyer: <span className="text-slate-200">{ord.buyerName}</span> • Qty: {ord.quantity}x
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-black text-sm text-[#00ff88]">${ord.total_amount.toFixed(2)}</span>
                    <p className="text-[9px] font-mono text-slate-500 mt-0.5">
                      {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USERS & ROLE MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-black text-lg text-white">Registered Users & Role Assignment</h3>
              <p className="text-xs text-slate-400">Modify access permissions across Attendee, Staff, Organizer, and Admin</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search user name or role..."
                value={searchUserQuery}
                onChange={e => setSearchUserQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#141724] border border-[#232a3e] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff2d75]"
              />
            </div>
          </div>

          <div className="space-y-2.5 overflow-x-auto">
            {filteredUsers.map((u: User) => (
              <div key={u.id} className="p-3.5 rounded-2xl bg-[#141724] border border-[#202538] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} alt={u.name} className="w-10 h-10 rounded-full object-cover border border-[#2c3650]" />
                  <div>
                    <h4 className="font-bold text-xs text-white">{u.name}</h4>
                    <p className="text-[11px] text-slate-400">{u.email}</p>
                    <span className="text-[9px] font-mono text-slate-500">ID: {u.id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-semibold">Assigned Role:</span>
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      u.role === 'admin'
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                        : u.role === 'organizer'
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        : u.role === 'staff'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-[#181d2f] border-[#2c3752] text-slate-200'
                    }`}
                  >
                    <option value="attendee">Attendee (Default)</option>
                    <option value="staff">Staff (Gate Scanner)</option>
                    <option value="organizer">Organizer</option>
                    <option value="admin">Super Admin</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: GLOBAL EVENT OVERSIGHT */}
      {activeTab === 'events' && (
        <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-black text-lg text-white">Global Event Listings & Moderation</h3>
              <p className="text-xs text-slate-400">Oversee published inventory, status, and gate capacities</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search event title or venue..."
                value={searchEventQuery}
                onChange={e => setSearchEventQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#141724] border border-[#232a3e] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff2d75]"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredEvents.map((evt: EventItem) => (
              <div key={evt.id} className="p-4 rounded-2xl bg-[#141724] border border-[#202538] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <img src={evt.image_url} alt={evt.title} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-black text-[#ff2d75] tracking-wider">{evt.category}</span>
                      <span className="text-[10px] text-slate-400">• ${evt.price.toFixed(2)}</span>
                    </div>
                    <h4 className="font-bold text-sm text-white truncate mt-0.5">{evt.title}</h4>
                    <p className="text-xs text-slate-400 truncate">{evt.venue_name} • {evt.venue_address}</p>
                    <p className="text-[10px] text-emerald-400 font-bold mt-1">
                      {evt.capacity - evt.tickets_remaining}/{evt.capacity} tickets sold ({evt.tickets_remaining} remaining)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <select
                    value={evt.status}
                    onChange={e => handleEventStatusChange(evt.id, e.target.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      evt.status === 'published'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : evt.status === 'cancelled'
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                        : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    }`}
                  >
                    <option value="published">Status: Published</option>
                    <option value="cancelled">Status: Cancelled</option>
                    <option value="ended">Status: Ended</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY & FRAUD AUDIT */}
      {activeTab === 'security' && (
        <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 animate-in fade-in duration-150">
          <div>
            <h3 className="font-display font-black text-lg text-white">Cryptographic Security & Duplicate Scan Audit</h3>
            <p className="text-xs text-slate-400">All offline reconciliation anomalies and unauthorized duplicate entries</p>
          </div>

          {fraudAuditLogs.length > 0 ? (
            <div className="space-y-2.5">
              {fraudAuditLogs.map((log: any) => (
                <div key={log.id} className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <AlertOctagon className="w-4 h-4 text-rose-400" />
                      <span>DUPLICATE SCAN ATTEMPT: {log.eventTitle || 'Event'}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Ticket ID: <span className="font-mono text-cyan-300">{log.ticket_id}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Scanned at <span className="text-white">{new Date(log.scanned_at).toLocaleString()}</span> via Device <span className="font-mono text-slate-300">{log.scanner_device_id}</span>
                    </p>
                  </div>

                  <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-rose-500 text-white shadow-md">
                    FLAGGED FRAUD
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl bg-[#141724] border border-[#202538]">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-white">No Flagged Fraud / Duplicate Scans</p>
              <p className="text-[11px] text-slate-400 mt-0.5">All door gates operating with clean cryptographic validation.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SYSTEM BROADCAST & NOTIFICATIONS */}
      {activeTab === 'broadcast' && (
        <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 animate-in fade-in duration-150">
          <div>
            <h3 className="font-display font-black text-lg text-white">Platform System-Wide Broadcast</h3>
            <p className="text-xs text-slate-400">Push high-priority gate, safety, or lineup alerts to all registered user wallets</p>
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-3.5 text-xs max-w-xl">
            <div>
              <label className="text-slate-300 font-bold">Alert Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Gate 2 Express Lanes Now Open!"
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
              />
            </div>

            <div>
              <label className="text-slate-300 font-bold">Message Content</label>
              <textarea
                rows={3}
                required
                placeholder="Details on gate entry, stage timings, or severe weather precautions..."
                value={broadcastMsg}
                onChange={e => setBroadcastMsg(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
              />
            </div>

            {broadcastSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                {broadcastSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={broadcastLoading}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white font-bold text-xs hover:opacity-90 transition disabled:opacity-40 shadow-xl shadow-pink-500/25 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{broadcastLoading ? 'Dispatching...' : 'Dispatch Push Broadcast'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
