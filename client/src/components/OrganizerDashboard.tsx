import React, { useState, useEffect } from 'react';
import { User, EventItem, FraudAlertLog } from '../types';
import { api } from '../services/api';
import { 
  BarChart3, TrendingUp, Users, DollarSign, AlertOctagon, 
  RotateCcw, Plus, CheckCircle, ShieldAlert, Sparkles, 
  MapPin, Lock, ShieldCheck, UserPlus, Radio, Settings,
  Trash2, Send, Search, QrCode, Sliders, ChevronRight,
  Clock, CheckCircle2, UserCheck, AlertCircle
} from 'lucide-react';

interface OrganizerDashboardProps {
  currentUser: User;
  onRefreshEvents: () => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({
  currentUser,
  onRefreshEvents,
}) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'staff' | 'events' | 'broadcast' | 'guestlist'>('analytics');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Available users for assigning staff
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Staff Assignment State
  const [selectedStaffUserId, setSelectedStaffUserId] = useState('');
  const [selectedStaffEventId, setSelectedStaffEventId] = useState('');
  const [staffRoleTitle, setStaffRoleTitle] = useState('Door Gate Scanner');
  const [staffAssignLoading, setStaffAssignLoading] = useState(false);
  const [staffFeedback, setStaffFeedback] = useState<string | null>(null);

  // Event Settings State
  const [selectedEventForSettings, setSelectedEventForSettings] = useState<EventItem | null>(null);
  const [editResaleAllowed, setEditResaleAllowed] = useState(true);
  const [editResaleCap, setEditResaleCap] = useState(1.20);
  const [editCapacity, setEditCapacity] = useState(150);
  const [settingsSaveLoading, setSettingsSaveLoading] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null);

  // Targeted Event Broadcast State
  const [broadcastEventId, setBroadcastEventId] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastFeedback, setBroadcastFeedback] = useState<string | null>(null);

  // Guestlist State
  const [guestlistEventId, setGuestlistEventId] = useState('');
  const [guestlist, setGuestlist] = useState<any[]>([]);
  const [guestlistSearch, setGuestlistSearch] = useState('');
  const [guestlistLoading, setGuestlistLoading] = useState(false);

  // Refund State
  const [refundTicketId, setRefundTicketId] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  // New Event Form Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventVenue, setNewEventVenue] = useState('');
  const [newEventAddress, setNewEventAddress] = useState('');
  const [newEventLat, setNewEventLat] = useState(6.4281);
  const [newEventLng, setNewEventLng] = useState(3.4219);
  const [newEventCapacity, setNewEventCapacity] = useState(150);
  const [newEventPrice, setNewEventPrice] = useState(25.00);
  const [newEventCategory, setNewEventCategory] = useState<'club' | 'gig' | 'popup' | 'art' | 'rooftop'>('club');
  const [newEventResaleCap, setNewEventResaleCap] = useState(1.20);
  const [newEventImageUrl, setNewEventImageUrl] = useState('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800');
  const [createLoading, setCreateLoading] = useState(false);

  const isAdminOrOrganizer = currentUser.role === 'admin' || currentUser.role === 'organizer';
  const isStaff = currentUser.role === 'staff';

  const fetchAnalytics = async () => {
    try {
      const data = await api.getOrganizerAnalytics(currentUser.id);
      if (data.success) {
        setAnalytics(data);
        if (data.events && data.events.length > 0) {
          if (!broadcastEventId) setBroadcastEventId(data.events[0].id);
          if (!guestlistEventId) setGuestlistEventId(data.events[0].id);
          if (!selectedEventForSettings) {
            setSelectedEventForSettings(data.events[0]);
            setEditResaleAllowed(Boolean(data.events[0].resale_allowed));
            setEditResaleCap(data.events[0].resale_price_cap || 1.20);
            setEditCapacity(data.events[0].capacity);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    api.getUsers().then(users => {
      const filtered = users.filter(u => !u.id.startsWith('usr_buyer_concurrency_'));
      setAllUsers(filtered);
      if (filtered.length > 0 && !selectedStaffUserId) {
        setSelectedStaffUserId(filtered[0].id);
      }
    });

    const interval = setInterval(fetchAnalytics, 4000);
    return () => clearInterval(interval);
  }, [currentUser.id]);

  // Load guestlist when guestlistEventId changes
  useEffect(() => {
    if (guestlistEventId) {
      setGuestlistLoading(true);
      api.getEventGuestlist(currentUser.id, guestlistEventId).then(data => {
        if (data.success) {
          setGuestlist(data.guestlist || []);
        }
        setGuestlistLoading(false);
      }).catch(() => setGuestlistLoading(false));
    }
  }, [guestlistEventId, currentUser.id]);

  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffUserId) return;
    setStaffAssignLoading(true);
    setStaffFeedback(null);
    try {
      const res = await api.assignOrganizerStaff(currentUser.id, {
        staffUserId: selectedStaffUserId,
        eventId: selectedStaffEventId || undefined,
        roleTitle: staffRoleTitle.trim(),
      });
      if (res.success) {
        setStaffFeedback('✓ Staff role successfully granted! Scanner permissions enabled.');
        fetchAnalytics();
        setTimeout(() => setStaffFeedback(null), 4000);
      } else {
        setStaffFeedback(`Failed: ${res.error}`);
      }
    } catch (err: any) {
      setStaffFeedback(`Error: ${err.message}`);
    } finally {
      setStaffAssignLoading(false);
    }
  };

  const handleRevokeStaff = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to revoke this staff member\'s door scanner access?')) return;
    try {
      const res = await api.revokeOrganizerStaff(currentUser.id, assignmentId);
      if (res.success) {
        fetchAnalytics();
      }
    } catch (err: any) {
      alert(`Revoke failed: ${err.message}`);
    }
  };

  const handleSaveEventSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventForSettings) return;
    setSettingsSaveLoading(true);
    setSettingsFeedback(null);
    try {
      const res = await api.updateEventSettings(currentUser.id, selectedEventForSettings.id, {
        resaleAllowed: editResaleAllowed,
        resalePriceCap: editResaleCap,
        capacity: editCapacity,
      });
      if (res.success) {
        setSettingsFeedback('✓ Event rules & capacity successfully updated!');
        fetchAnalytics();
        onRefreshEvents();
        setTimeout(() => setSettingsFeedback(null), 4000);
      } else {
        setSettingsFeedback(`Failed: ${res.error}`);
      }
    } catch (err: any) {
      setSettingsFeedback(`Error: ${err.message}`);
    } finally {
      setSettingsSaveLoading(false);
    }
  };

  const handleSendTargetedBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastEventId || !broadcastTitle.trim() || !broadcastMessage.trim()) return;
    setBroadcastLoading(true);
    setBroadcastFeedback(null);
    try {
      const res = await api.sendEventBroadcast(currentUser.id, broadcastEventId, {
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
      });
      if (res.success) {
        setBroadcastFeedback(`✓ Alert dispatched to all ${res.sentCount} confirmed ticket holders!`);
        setBroadcastTitle('');
        setBroadcastMessage('');
        setTimeout(() => setBroadcastFeedback(null), 4000);
      } else {
        setBroadcastFeedback(`Failed: ${res.error}`);
      }
    } catch (err: any) {
      setBroadcastFeedback(`Error: ${err.message}`);
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleRefund = async () => {
    if (!isAdminOrOrganizer) return;
    if (!refundTicketId.trim()) return;
    setRefundLoading(true);
    setRefundMsg(null);
    try {
      const res = await api.refundTicket(refundTicketId.trim(), currentUser.id);
      if (res.success) {
        setRefundMsg('✓ Ticket successfully refunded, revoked, and inventory returned to event!');
        setRefundTicketId('');
        fetchAnalytics();
        onRefreshEvents();
      } else {
        setRefundMsg(`Failed: ${res.error}`);
      }
    } catch (err: any) {
      setRefundMsg(`Error: ${err.message}`);
    } finally {
      setRefundLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrOrganizer) return;
    setCreateLoading(true);
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 9 * 3600 * 1000).toISOString();

      await api.createEvent({
        organizer_id: currentUser.id,
        title: newEventTitle,
        description: newEventDesc,
        lat: newEventLat,
        lng: newEventLng,
        venue_name: newEventVenue,
        venue_address: newEventAddress,
        start_time: startTime,
        end_time: endTime,
        category: newEventCategory,
        capacity: Number(newEventCapacity),
        price: Number(newEventPrice),
        resale_allowed: 1,
        resale_price_cap: Number(newEventResaleCap),
        status: 'published',
        image_url: newEventImageUrl,
        vibe_tags: JSON.stringify(['Nightlife', 'Live', 'Exclusive']),
      });

      setShowCreateModal(false);
      setNewEventTitle('');
      setNewEventDesc('');
      setNewEventVenue('');
      setNewEventAddress('');
      fetchAnalytics();
      onRefreshEvents();
    } catch (err: any) {
      alert(`Error creating event: ${err.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading || !analytics) {
    return (
      <div className="max-w-md mx-auto p-12 text-center text-xs text-slate-400">
        <Sparkles className="w-8 h-8 text-[#ff2d75] animate-spin mx-auto mb-3" />
        <span>Loading Organizer Mission Control...</span>
      </div>
    );
  }

  const { summary, events, recentScans, fraudAlerts, assignedStaff = [] } = analytics;

  const filteredGuestlist = guestlist.filter(g => 
    g.userName?.toLowerCase().includes(guestlistSearch.toLowerCase()) ||
    g.userEmail?.toLowerCase().includes(guestlistSearch.toLowerCase()) ||
    g.ticketId?.toLowerCase().includes(guestlistSearch.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-4 pb-28 space-y-6">
      {/* Header with Role Badge and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e2538] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-black text-2xl text-white">Organizer Mission Control</h2>
            {isStaff ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Staff View (Read-Only)
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Verified Organizer
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Real-time gate telemetry, door staff delegation, and ticket operations</p>
        </div>

        {isAdminOrOrganizer && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-pink-500/20 hover:opacity-90 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Event</span>
          </button>
        )}
      </div>

      {/* Organizer Sub-Navigation Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'analytics', label: 'Gate Telemetry', icon: BarChart3 },
          { id: 'staff', label: `Staff & Team (${assignedStaff.length})`, icon: Users },
          { id: 'events', label: `Event Rules (${events.length})`, icon: Settings },
          { id: 'broadcast', label: 'Attendee Push Alert', icon: Radio },
          { id: 'guestlist', label: 'Guestlist Lookup', icon: QrCode },
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

      {/* TAB 1: GATE TELEMETRY & ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Key Metrics HUD */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Gross Revenue</span>
                <DollarSign className="w-4 h-4 text-[#00ff88]" />
              </div>
              {isStaff ? (
                <div>
                  <div className="font-display font-bold text-lg text-slate-400">••••••••</div>
                  <div className="text-[9px] text-slate-500 font-semibold mt-0.5">(Admin & Organizer Only)</div>
                </div>
              ) : (
                <div>
                  <div className="font-display font-black text-2xl text-white">
                    ${summary.totalRevenue.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-1">
                    Settled & escrowed
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Tickets Sold</span>
                <Users className="w-4 h-4 text-[#00f0ff]" />
              </div>
              <div className="font-display font-black text-2xl text-white">
                {summary.totalTicketsSold} <span className="text-xs text-slate-400 font-normal">/ {summary.totalCapacity}</span>
              </div>
              <div className="text-[10px] text-cyan-300 font-semibold mt-1">
                {summary.totalCapacity > 0 ? ((summary.totalTicketsSold / summary.totalCapacity) * 100).toFixed(0) : 0}% capacity reached
              </div>
            </div>

            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Gate Admissions</span>
                <TrendingUp className="w-4 h-4 text-[#9d4edd]" />
              </div>
              <div className="font-display font-black text-2xl text-white">
                {summary.totalAdmitted}
              </div>
              <div className="text-[10px] text-purple-300 font-semibold mt-1">
                {summary.admissionRatePercent}% check-in velocity
              </div>
            </div>

            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Fraud Flags</span>
                <AlertOctagon className="w-4 h-4 text-rose-500" />
              </div>
              <div className="font-display font-black text-2xl text-rose-400">
                {fraudAlerts.length}
              </div>
              <div className="text-[10px] text-rose-400 font-semibold mt-1">
                Duplicate scans blocked
              </div>
            </div>
          </div>

          {/* Active Events Overview */}
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
            <h3 className="font-display font-black text-base text-white">Your Managed Events</h3>
            <div className="space-y-3">
              {events.map((evt: EventItem) => (
                <div key={evt.id} className="p-4 rounded-2xl bg-[#141724] border border-[#202538] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={evt.image_url} alt={evt.title} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-white truncate">{evt.title}</h4>
                      <p className="text-xs text-slate-400 truncate">{evt.venue_name} • ${evt.price.toFixed(2)}</p>
                      <p className="text-[10px] text-cyan-300 font-semibold mt-0.5">
                        {evt.capacity - evt.tickets_remaining}/{evt.capacity} tickets claimed ({evt.tickets_remaining} remaining)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedEventForSettings(evt);
                        setEditResaleAllowed(Boolean(evt.resale_allowed));
                        setEditResaleCap(evt.resale_price_cap || 1.20);
                        setEditCapacity(evt.capacity);
                        setActiveTab('events');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#181d2f] border border-[#2b354e] text-[11px] font-bold text-slate-200 hover:bg-[#202840] transition"
                    >
                      Configure Rules
                    </button>
                    <button
                      onClick={() => {
                        setBroadcastEventId(evt.id);
                        setActiveTab('broadcast');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-[11px] font-bold text-purple-300 hover:bg-purple-500/30 transition"
                    >
                      Push Alert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 1-Tap Customer Refund & Token Revocation */}
          {isAdminOrOrganizer && (
            <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
              <div>
                <h3 className="font-display font-black text-base text-white">1-Tap Customer Refund & Token Revocation</h3>
                <p className="text-xs text-slate-400">Instantly invalidates customer QR Ed25519 token, credits refund, and restores capacity</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Enter Ticket ID (e.g. tkt_7b4c92fa...)"
                  value={refundTicketId}
                  onChange={e => setRefundTicketId(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#141724] border border-[#232a3e] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff2d75]"
                />
                <button
                  onClick={handleRefund}
                  disabled={refundLoading || !refundTicketId.trim()}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/20"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{refundLoading ? 'Processing...' : 'Issue Refund'}</span>
                </button>
              </div>

              {refundMsg && (
                <div className={`p-3 rounded-xl text-xs font-semibold ${refundMsg.startsWith('✓') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                  {refundMsg}
                </div>
              )}
            </div>
          )}

          {/* Real-time Scans Feed */}
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
            <h3 className="font-display font-black text-base text-white">Live Gate Admission Telemetry</h3>
            {recentScans.length > 0 ? (
              <div className="space-y-2">
                {recentScans.map((scan: any) => (
                  <div key={scan.id} className="p-3 rounded-2xl bg-[#141724] border border-[#202538] flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{scan.attendeeName || 'Attendee'}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Device: <span className="font-mono text-slate-300">{scan.scanner_device_id}</span> • Ticket: <span className="font-mono text-cyan-300">{scan.ticket_id}</span>
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(scan.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                <span>No scans recorded yet for your events. Open Scanner Mode to check in guests!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: STAFF & TEAM MANAGEMENT */}
      {activeTab === 'staff' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Grant Staff Role Card */}
          {isAdminOrOrganizer && (
            <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4">
              <div>
                <h3 className="font-display font-black text-base text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#00f0ff]" />
                  <span>Grant Door Staff Role & Scanner Access</span>
                </h3>
                <p className="text-xs text-slate-400">Promote any user or team member to operate handheld gate scanners for your events</p>
              </div>

              <form onSubmit={handleAssignStaff} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="text-slate-300 font-bold">Select User</label>
                  <select
                    value={selectedStaffUserId}
                    onChange={e => setSelectedStaffUserId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
                  >
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-bold">Assign to Event</label>
                  <select
                    value={selectedStaffEventId}
                    onChange={e => setSelectedStaffEventId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
                  >
                    <option value="">All Organizer Events</option>
                    {events.map((evt: EventItem) => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-bold">Staff Role Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gate 1 Lead Scanner"
                    value={staffRoleTitle}
                    onChange={e => setStaffRoleTitle(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={staffAssignLoading || !selectedStaffUserId}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#00ff88] text-black font-black text-xs hover:opacity-90 transition disabled:opacity-40 flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{staffAssignLoading ? 'Granting...' : 'Grant Staff Role & Access'}</span>
                  </button>
                </div>
              </form>

              {staffFeedback && (
                <div className={`p-3 rounded-xl text-xs font-semibold ${staffFeedback.startsWith('✓') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                  {staffFeedback}
                </div>
              )}
            </div>
          )}

          {/* Active Door Staff Roster */}
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
            <h3 className="font-display font-black text-base text-white">Active Door Staff Team ({assignedStaff.length})</h3>
            
            {assignedStaff.length > 0 ? (
              <div className="space-y-2.5">
                {assignedStaff.map((stf: any) => (
                  <div key={stf.assignmentId} className="p-3.5 rounded-2xl bg-[#141724] border border-[#202538] flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <img src={stf.staffAvatar || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'} alt={stf.staffName} className="w-10 h-10 rounded-full object-cover border border-[#2c3650]" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white">{stf.staffName}</h4>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {stf.role_title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{stf.staffEmail}</p>
                        <p className="text-[10px] text-cyan-300 font-semibold mt-0.5">
                          Assigned to: {stf.eventTitle || 'All Organizer Events'}
                        </p>
                      </div>
                    </div>

                    {isAdminOrOrganizer && (
                      <button
                        onClick={() => handleRevokeStaff(stf.assignmentId)}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center gap-1 text-[11px] font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke Access</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center rounded-2xl bg-[#141724] border border-[#202538] text-xs text-slate-400">
                <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="font-bold text-white">No Staff Members Assigned Yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Use the grant form above to assign gate scanner permissions to door workers.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: EVENT RULES & CAPACITY */}
      {activeTab === 'events' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4">
            <div>
              <h3 className="font-display font-black text-base text-white">Event Rules, Resale Caps & Capacity Controls</h3>
              <p className="text-xs text-slate-400">Configure anti-scalping multipliers and expand ticket allocations in real time</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {events.map((evt: EventItem) => (
                <button
                  key={evt.id}
                  onClick={() => {
                    setSelectedEventForSettings(evt);
                    setEditResaleAllowed(Boolean(evt.resale_allowed));
                    setEditResaleCap(evt.resale_price_cap || 1.20);
                    setEditCapacity(evt.capacity);
                    setSettingsFeedback(null);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                    selectedEventForSettings?.id === evt.id
                      ? 'bg-[#ff2d75] text-white shadow-lg shadow-pink-500/20'
                      : 'bg-[#141724] text-slate-400 border border-[#232a3e] hover:text-white'
                  }`}
                >
                  {evt.title}
                </button>
              ))}
            </div>

            {selectedEventForSettings && (
              <form onSubmit={handleSaveEventSettings} className="space-y-4 pt-2 border-t border-[#1e2538] text-xs max-w-lg">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-[#141724] border border-[#232a3e]">
                  <div>
                    <span className="font-bold text-white">Allow P2P Ticket Resale</span>
                    <p className="text-[10px] text-slate-400">Enable fan-to-fan verified transfers in Ticket Wallet</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editResaleAllowed}
                    onChange={e => setEditResaleAllowed(e.target.checked)}
                    className="w-5 h-5 accent-[#ff2d75] rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-bold flex items-center justify-between">
                    <span>Anti-Scalp Price Cap Multiplier</span>
                    <span className="font-mono text-[#00ff88]">{(editResaleCap * 100).toFixed(0)}% (${(selectedEventForSettings.price * editResaleCap).toFixed(2)} max)</span>
                  </label>
                  <input
                    type="range"
                    min="1.00"
                    max="2.00"
                    step="0.05"
                    value={editResaleCap}
                    onChange={e => setEditResaleCap(parseFloat(e.target.value))}
                    className="w-full mt-2 accent-[#ff2d75] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>100% (Face Value Only)</span>
                    <span>120% (Recommended Cap)</span>
                    <span>200% (High Cap)</span>
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-bold">Total Venue Ticket Capacity</label>
                  <input
                    type="number"
                    min={selectedEventForSettings.capacity}
                    value={editCapacity}
                    onChange={e => setEditCapacity(parseInt(e.target.value) || selectedEventForSettings.capacity)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Current: {selectedEventForSettings.capacity} tickets ({selectedEventForSettings.tickets_remaining} remaining)
                  </p>
                </div>

                {settingsFeedback && (
                  <div className={`p-3 rounded-xl text-xs font-semibold ${settingsFeedback.startsWith('✓') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                    {settingsFeedback}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={settingsSaveLoading}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white font-bold text-xs hover:opacity-90 transition disabled:opacity-40 shadow-xl shadow-pink-500/20"
                >
                  {settingsSaveLoading ? 'Saving...' : 'Save Event Rules'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TARGETED ATTENDEE PUSH BROADCAST */}
      {activeTab === 'broadcast' && (
        <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 animate-in fade-in duration-150">
          <div>
            <h3 className="font-display font-black text-base text-white">Targeted Attendee Push Broadcast</h3>
            <p className="text-xs text-slate-400">Send high-priority notifications exclusively to ticket holders of a specific event</p>
          </div>

          <form onSubmit={handleSendTargetedBroadcast} className="space-y-3.5 text-xs max-w-xl">
            <div>
              <label className="text-slate-300 font-bold">Select Target Event</label>
              <select
                value={broadcastEventId}
                onChange={e => setBroadcastEventId(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
              >
                {events.map((evt: EventItem) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.title} ({evt.capacity - evt.tickets_remaining} ticket holders)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-300 font-bold">Alert Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Doors Opening at 10:00 PM!"
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
              />
            </div>

            <div>
              <label className="text-slate-300 font-bold">Message Details</label>
              <textarea
                rows={3}
                required
                placeholder="Please have your cryptographic offline QR codes ready in your wallet before reaching the gate..."
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 rounded-xl bg-[#141724] border border-[#242c40] text-white focus:outline-none focus:border-[#ff2d75]"
              />
            </div>

            {broadcastFeedback && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${broadcastFeedback.startsWith('✓') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                {broadcastFeedback}
              </div>
            )}

            <button
              type="submit"
              disabled={broadcastLoading}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white font-bold text-xs hover:opacity-90 transition disabled:opacity-40 shadow-xl shadow-pink-500/20 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{broadcastLoading ? 'Dispatching...' : 'Send Event Push Alert'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: GUESTLIST LOOKUP */}
      {activeTab === 'guestlist' && (
        <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-black text-base text-white">Event Guestlist & Check-In Verification</h3>
              <p className="text-xs text-slate-400">Search confirmed ticket holders for door lookup and manual verification</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={guestlistEventId}
                onChange={e => setGuestlistEventId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#141724] border border-[#232a3e] text-xs text-white"
              >
                {events.map((evt: EventItem) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search guest name, email, or Ticket ID..."
              value={guestlistSearch}
              onChange={e => setGuestlistSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#141724] border border-[#232a3e] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff2d75]"
            />
          </div>

          {guestlistLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading guestlist...</div>
          ) : filteredGuestlist.length > 0 ? (
            <div className="space-y-2.5">
              {filteredGuestlist.map((g: any) => (
                <div key={g.ticketId} className="p-3.5 rounded-2xl bg-[#141724] border border-[#202538] flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <img src={g.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} alt={g.userName} className="w-10 h-10 rounded-full object-cover border border-[#2c3650]" />
                    <div>
                      <div className="font-bold text-white">{g.userName}</div>
                      <p className="text-[11px] text-slate-400">{g.userEmail}</p>
                      <p className="text-[9px] font-mono text-cyan-300 mt-0.5">ID: {g.ticketId}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase ${
                      g.status === 'used'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : g.status === 'valid'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {g.status === 'used' ? '✓ Admitted' : g.status}
                    </span>
                    {g.used_at && (
                      <p className="text-[9px] text-slate-500 font-mono mt-1">
                        Checked in: {new Date(g.used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              <span>No attendees found matching search query.</span>
            </div>
          )}
        </div>
      )}

      {/* Create New Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121522] border border-[#28324a] rounded-3xl p-6 max-w-lg w-full space-y-4 my-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#20273c] pb-3">
              <h3 className="font-display font-black text-lg text-white">Create New Verified Event</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white text-xs">✕ Close</button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-300 font-bold">Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Obi's House Landmark Beach Rave"
                  value={newEventTitle}
                  onChange={e => setNewEventTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold">Venue Name & Address</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input
                    type="text"
                    required
                    placeholder="Venue Name (e.g. Landmark Beach)"
                    value={newEventVenue}
                    onChange={e => setNewEventVenue(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Address (e.g. Oniru, VI, Lagos)"
                    value={newEventAddress}
                    onChange={e => setNewEventAddress(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-300 font-bold">Category</label>
                  <select
                    value={newEventCategory}
                    onChange={e => setNewEventCategory(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                  >
                    <option value="club">Club / Rave</option>
                    <option value="gig">Live Gig</option>
                    <option value="popup">Pop-up / Food</option>
                    <option value="rooftop">Rooftop Vibe</option>
                    <option value="art">Art / Gallery</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-bold">Capacity</label>
                  <input
                    type="number"
                    min="5"
                    max="10000"
                    value={newEventCapacity}
                    onChange={e => setNewEventCapacity(parseInt(e.target.value))}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-bold">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newEventPrice}
                    onChange={e => setNewEventPrice(parseFloat(e.target.value))}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold">Banner Image URL</label>
                <input
                  type="url"
                  value={newEventImageUrl}
                  onChange={e => setNewEventImageUrl(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#1c2236] text-slate-300 hover:bg-[#252d47] transition font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white font-bold hover:opacity-90 transition disabled:opacity-40 shadow-lg shadow-pink-500/20"
                >
                  {createLoading ? 'Publishing...' : 'Publish Verified Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
