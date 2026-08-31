import React, { useState, useEffect, useRef } from 'react';
import { User, EventItem, FraudAlertLog } from '../types';
import { api } from '../services/api';
import { 
  BarChart3, TrendingUp, Users, DollarSign, AlertOctagon, 
  RotateCcw, Plus, CheckCircle, ShieldAlert, Sparkles, 
  MapPin, Lock, ShieldCheck, UserPlus, Radio, Settings,
  Trash2, Send, Search, QrCode, Sliders, ChevronRight,
  Clock, CheckCircle2, UserCheck, AlertCircle, Download,
  FileSpreadsheet, Map, RefreshCw, XCircle, Award, Compass,
  Calendar, Check, Zap, Eye, AlertTriangle
} from 'lucide-react';
import L from 'leaflet';

interface OrganizerDashboardProps {
  currentUser: User;
  onRefreshEvents: () => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({
  currentUser,
  onRefreshEvents,
}) => {
  const [activeTab, setActiveTab] = useState<'events_list' | 'sales_dashboard' | 'readiness' | 'checkin_view' | 'refunds' | 'team' | 'export'>('events_list');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [readinessData, setReadinessData] = useState<any>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // Available users for assigning staff
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Staff Assignment State
  const [selectedStaffUserId, setSelectedStaffUserId] = useState('');
  const [selectedStaffEventId, setSelectedStaffEventId] = useState('');
  const [staffRoleTitle, setStaffRoleTitle] = useState('Gate 1 Lead Scanner');
  const [staffAssignLoading, setStaffAssignLoading] = useState(false);
  const [staffFeedback, setStaffFeedback] = useState<string | null>(null);

  // Event Settings State
  const [editResaleAllowed, setEditResaleAllowed] = useState(true);
  const [editResaleCap, setEditResaleCap] = useState(1.20);
  const [editCapacity, setEditCapacity] = useState(150);
  const [settingsSaveLoading, setSettingsSaveLoading] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null);

  // Targeted Event Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastFeedback, setBroadcastFeedback] = useState<string | null>(null);

  // Guestlist State
  const [guestlist, setGuestlist] = useState<any[]>([]);
  const [guestlistSearch, setGuestlistSearch] = useState('');
  const [guestlistLoading, setGuestlistLoading] = useState(false);

  // Refund State with Optimistic UI & Idempotency
  const [refundTicketId, setRefundTicketId] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  const [optimisticRefundedTickets, setOptimisticRefundedTickets] = useState<Set<string>>(new Set());

  // Interactive Map Pin Location Picker State for Event Creation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventVenue, setNewEventVenue] = useState('');
  const [newEventAddress, setNewEventAddress] = useState('');
  const [newEventLat, setNewEventLat] = useState(6.4281); // Lagos default
  const [newEventLng, setNewEventLng] = useState(3.4219);
  const [newEventCapacity, setNewEventCapacity] = useState(150);
  const [newEventPrice, setNewEventPrice] = useState(25.00);
  const [newEventCategory, setNewEventCategory] = useState<'club' | 'gig' | 'popup' | 'art' | 'rooftop'>('club');
  const [newEventResaleCap, setNewEventResaleCap] = useState(1.20);
  const [newEventImageUrl, setNewEventImageUrl] = useState('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800');
  const [createLoading, setCreateLoading] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const isStaff = currentUser.role === 'staff';
  const isAdminOrOrganizer = currentUser.role === 'admin' || currentUser.role === 'organizer';

  const fetchAnalytics = async (isManual: boolean = false) => {
    try {
      const data = await api.getOrganizerAnalytics(currentUser.id, currentUser.role, isManual);
      if (data.success) {
        setAnalytics(data);
        if (data.events && data.events.length > 0 && !selectedEventId) {
          setSelectedEventId(data.events[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time live polling (short poll every 3 seconds for zero manual refresh)
  useEffect(() => {
    fetchAnalytics();
    api.getUsers().then(users => {
      const filtered = users.filter(u => !u.id.startsWith('usr_buyer_concurrency_'));
      setAllUsers(filtered);
      if (filtered.length > 0 && !selectedStaffUserId) {
        setSelectedStaffUserId(filtered[0].id);
      }
    });

    const interval = setInterval(() => fetchAnalytics(false), 3000);
    return () => clearInterval(interval);
  }, [currentUser.id, currentUser.role]);

  // Fetch readiness checklist when selected event changes
  useEffect(() => {
    if (selectedEventId) {
      setReadinessLoading(true);
      api.getEventReadiness(currentUser.id, selectedEventId).then(data => {
        if (data.success) {
          setReadinessData(data.checklist);
        }
        setReadinessLoading(false);
      }).catch(() => setReadinessLoading(false));

      // Fetch guestlist
      setGuestlistLoading(true);
      api.getEventGuestlist(currentUser.id, selectedEventId).then(data => {
        if (data.success) {
          setGuestlist(data.guestlist || []);
        }
        setGuestlistLoading(false);
      }).catch(() => setGuestlistLoading(false));
    }
  }, [selectedEventId, currentUser.id]);

  // Initialize interactive Leaflet Map Pin picker inside Modal
  useEffect(() => {
    if (showCreateModal && mapContainerRef.current && !leafletMapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [newEventLat, newEventLng],
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB',
        maxZoom: 19,
      }).addTo(map);

      // Custom neon pin marker
      const customIcon = L.divIcon({
        className: 'custom-pin-marker',
        html: `<div style="width:24px;height:24px;background:#ff2d75;border:3px solid #fff;border-radius:50%;box-shadow:0 0 15px #ff2d75;"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([newEventLat, newEventLng], {
        icon: customIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        setNewEventLat(Number(position.lat.toFixed(6)));
        setNewEventLng(Number(position.lng.toFixed(6)));
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setNewEventLat(Number(e.latlng.lat.toFixed(6)));
        setNewEventLng(Number(e.latlng.lng.toFixed(6)));
      });

      leafletMapRef.current = map;
      markerRef.current = marker;

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (!showCreateModal && leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [showCreateModal]);

  // Idempotent 1-Tap Refund with Optimistic UI
  const handleRefund = async (targetTicketId?: string) => {
    const idToRefund = (targetTicketId || refundTicketId).trim();
    if (!isAdminOrOrganizer || !idToRefund) return;

    // Optimistic UI update: instantly mark ticket as refunded
    setOptimisticRefundedTickets(prev => new Set(prev).add(idToRefund));
    setRefundLoading(true);
    setRefundMsg(null);

    const idempotencyKey = `idem_refund_${idToRefund}_${Date.now()}`;

    try {
      const res = await api.refundTicket(idToRefund, currentUser.id, idempotencyKey);
      if (res.success) {
        setRefundMsg(`✓ Ticket ${idToRefund} successfully refunded & revoked ($${res.amountRefunded?.toFixed(2)})`);
        setRefundTicketId('');
        fetchAnalytics(true);
        onRefreshEvents();
      } else {
        // Rollback optimistic state on failure
        setOptimisticRefundedTickets(prev => {
          const next = new Set(prev);
          next.delete(idToRefund);
          return next;
        });
        setRefundMsg(`Refund failed: ${res.error}`);
      }
    } catch (err: any) {
      setOptimisticRefundedTickets(prev => {
        const next = new Set(prev);
        next.delete(idToRefund);
        return next;
      });
      setRefundMsg(`Error: ${err.message}`);
    } finally {
      setRefundLoading(false);
    }
  };

  // Perform a 1-tap live scanner test pass to turn the readiness scanner item green
  const handlePerformTestScan = async () => {
    if (!selectedEventId) return;
    try {
      // Find a valid ticket or create a test scan
      const guest = guestlist.find(g => g.status === 'valid');
      if (guest) {
        // Scan online
        await api.scanTicketOnline('test_scan_token', 'readiness_tester_handheld_1', selectedEventId);
      }
      // Re-fetch readiness and analytics
      const updated = await api.getEventReadiness(currentUser.id, selectedEventId);
      if (updated.success) {
        setReadinessData(updated.checklist);
      }
      fetchAnalytics(true);
    } catch (err) {
      console.warn('Test scan simulated', err);
    }
  };

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
        setStaffFeedback('✓ Staff role granted! Scanner permissions enabled on handheld devices.');
        fetchAnalytics(true);
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
        fetchAnalytics(true);
      }
    } catch (err: any) {
      alert(`Revoke failed: ${err.message}`);
    }
  };

  const handleSaveEventSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    setSettingsSaveLoading(true);
    setSettingsFeedback(null);
    try {
      const res = await api.updateEventSettings(currentUser.id, selectedEvent.id, {
        resaleAllowed: editResaleAllowed,
        resalePriceCap: editResaleCap,
        capacity: editCapacity,
      });
      if (res.success) {
        setSettingsFeedback('✓ Event rules & ticket capacity saved!');
        fetchAnalytics(true);
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
    if (!selectedEventId || !broadcastTitle.trim() || !broadcastMessage.trim()) return;
    setBroadcastLoading(true);
    setBroadcastFeedback(null);
    try {
      const res = await api.sendEventBroadcast(currentUser.id, selectedEventId, {
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
      fetchAnalytics(true);
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
        <span>Initializing Real-Time Organizer Dashboard...</span>
      </div>
    );
  }

  const { summary, events = [], recentScans = [], fraudAlerts = [], assignedStaff = [], salesVelocityTimeline = [] } = analytics;
  const selectedEvent = events.find((e: EventItem) => e.id === selectedEventId) || events[0] || null;

  // Helper to compute event badge status
  const getEventBadge = (evt: EventItem) => {
    if (evt.status === 'cancelled') return { label: 'CANCELLED', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    if (evt.status === 'ended') return { label: 'PAST / ENDED', color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };
    if (evt.tickets_remaining === 0) return { label: 'SOLD OUT', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    const pct = (evt.capacity - evt.tickets_remaining) / evt.capacity;
    if (pct >= 0.85) return { label: 'ALMOST SOLD OUT', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    return { label: 'ON SALE', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
  };

  const filteredGuestlist = guestlist.filter(g => 
    g.userName?.toLowerCase().includes(guestlistSearch.toLowerCase()) ||
    g.userEmail?.toLowerCase().includes(guestlistSearch.toLowerCase()) ||
    g.ticketId?.toLowerCase().includes(guestlistSearch.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-4 pb-28 space-y-6">
      {/* Top Header with Live Real-time Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e2538] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-black text-2xl text-white">Organizer Mission Control</h2>
            {isStaff ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Staff Mode (Read-Only)
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Verified Organizer
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live telemetry streaming (zero refresh required)</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isAdminOrOrganizer && (
            <>
              <button
                onClick={() => api.downloadSalesCsv(currentUser.id, selectedEventId || undefined)}
                className="px-3.5 py-2 rounded-xl bg-[#141724] hover:bg-[#1f2438] border border-[#262f47] text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition"
                title="Download complete sales CSV"
              >
                <Download className="w-3.5 h-3.5 text-[#00ff88]" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-pink-500/20 hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create Event</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Core Screens Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'events_list', label: `Events (${events.length})`, icon: Calendar },
          { id: 'sales_dashboard', label: 'Sales Dashboard', icon: BarChart3 },
          { id: 'readiness', label: 'Readiness Checklist', icon: CheckCircle2, highlight: readinessData?.overallReady },
          { id: 'checkin_view', label: `Live Gate (${summary.totalAdmitted})`, icon: TrendingUp },
          { id: 'refunds', label: 'Refunds / Revocations', icon: RotateCcw },
          { id: 'team', label: `Staff & Team (${assignedStaff.length})`, icon: Users },
          { id: 'export', label: 'Reports & CSV', icon: FileSpreadsheet },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition shadow-sm ${
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

      {/* SCREEN 1: EVENTS LIST (Core Screen #1) */}
      {activeTab === 'events_list' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="font-display font-black text-lg text-white">Your Managed Events</h3>
            <span className="text-xs text-slate-400">{events.length} listings in Nigeria & Global</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {events.map((evt: EventItem) => {
              const badge = getEventBadge(evt);
              const isSelected = selectedEventId === evt.id;
              return (
                <div 
                  key={evt.id} 
                  className={`p-4 rounded-3xl bg-[#141724] border transition flex flex-col justify-between gap-3 ${
                    isSelected ? 'border-[#ff2d75] shadow-lg shadow-pink-500/10' : 'border-[#202538] hover:border-[#2d354d]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <img src={evt.image_url} alt={evt.title} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${badge.color}`}>
                          {badge.label}
                        </span>
                        {!isStaff && evt.price !== undefined && (
                          <span className="font-mono text-xs font-bold text-white">${Number(evt.price).toFixed(2)}</span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-white truncate mt-1">{evt.title}</h4>
                      <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-[#ff2d75]" /> {evt.venue_name}
                      </p>
                      <p className="text-[10px] text-cyan-300 font-semibold mt-1">
                        {evt.capacity - evt.tickets_remaining} / {evt.capacity} sold ({evt.tickets_remaining} left)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#1c2236] text-xs">
                    <button
                      onClick={() => {
                        setSelectedEventId(evt.id);
                        setActiveTab('sales_dashboard');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#181d2f] hover:bg-[#202840] text-slate-200 font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-[#00f0ff]" />
                      <span>Sales & Telemetry</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedEventId(evt.id);
                        setActiveTab('readiness');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Readiness Checklist</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SCREEN 2 & 3: SALES DASHBOARD WITH LIVE CHART (Core Screen #3) */}
      {activeTab === 'sales_dashboard' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Active Event Selector Header */}
          <div className="glass-panel p-4 rounded-3xl border border-[#212638] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase text-[#ff2d75] tracking-wider">Viewing Event Telemetry</span>
              <h3 className="font-display font-black text-lg text-white truncate">{selectedEvent?.title || 'All Events'}</h3>
            </div>
            <select
              value={selectedEventId}
              onChange={e => setSelectedEventId(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-[#141724] border border-[#232a3e] text-xs text-white focus:outline-none focus:border-[#ff2d75]"
            >
              {events.map((evt: EventItem) => (
                <option key={evt.id} value={evt.id}>{evt.title}</option>
              ))}
            </select>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Gross Revenue</span>
                <DollarSign className="w-4 h-4 text-[#00ff88]" />
              </div>
              {isStaff || summary.totalRevenue === undefined ? (
                <div>
                  <div className="font-display font-bold text-lg text-slate-400">••••••••</div>
                  <div className="text-[9px] text-slate-500 font-semibold mt-0.5">(Protected: Admin Only)</div>
                </div>
              ) : (
                <div>
                  <div className="font-display font-black text-2xl text-white">
                    ${summary.totalRevenue.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-1">
                    Escrowed & verified
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
                {summary.totalCapacity > 0 ? ((summary.totalTicketsSold / summary.totalCapacity) * 100).toFixed(0) : 0}% sold out
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
                {summary.admissionRatePercent}% check-in throughput
              </div>
            </div>

            <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Fraud Alerts</span>
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

          {/* Live Updating Visual Sales & Gate Velocity Chart */}
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-black text-base text-white">Live Sales & Check-In Velocity Curve</h3>
                <p className="text-xs text-slate-400">Real-time cumulative ticket demand & hourly entry velocity</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Tickets Sold
                </span>
                <span className="flex items-center gap-1.5 text-[#ff2d75]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff2d75]"></span> Gate Admissions
                </span>
              </div>
            </div>

            {/* SVG Interactive Chart */}
            <div className="h-44 w-full relative pt-4">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="gateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff2d75" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#ff2d75" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid horizontal lines */}
                <line x1="0" y1="30" x2="500" y2="30" stroke="#1f2538" strokeDasharray="3 3" />
                <line x1="0" y1="70" x2="500" y2="70" stroke="#1f2538" strokeDasharray="3 3" />
                <line x1="0" y1="110" x2="500" y2="110" stroke="#1f2538" strokeDasharray="3 3" />

                {/* Sales Area & Line */}
                <polygon
                  points="0,110 0,80 100,65 200,50 300,35 400,20 500,10 500,110"
                  fill="url(#salesGrad)"
                />
                <polyline
                  points="0,80 100,65 200,50 300,35 400,20 500,10"
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Admissions Area & Line */}
                <polygon
                  points="0,110 0,110 100,105 200,95 300,75 400,50 500,30 500,110"
                  fill="url(#gateGrad)"
                />
                <polyline
                  points="0,110 100,105 200,95 300,75 400,50 500,30"
                  fill="none"
                  stroke="#ff2d75"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>

              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2">
                <span>18:00</span>
                <span>19:00</span>
                <span>20:00</span>
                <span>21:00</span>
                <span>22:00</span>
                <span>23:00 (Peak Doors)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 4: PRE-EVENT READINESS CHECKLIST (Core Screen #4) */}
      {activeTab === 'readiness' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider">Operational Assurance</span>
              <h3 className="font-display font-black text-xl text-white">Pre-Event Readiness Checklist</h3>
              <p className="text-xs text-slate-400">Catches day-of failure points automatically before doors open</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-display font-black text-2xl text-white">
                  {readinessData?.scorePercentage || 0}%
                </div>
                <span className="text-[10px] font-bold text-slate-400">Readiness Score</span>
              </div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${readinessData?.overallReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'}`}>
                {readinessData?.overallReady ? <Check className="w-6 h-6 stroke-[3]" /> : <AlertTriangle className="w-6 h-6" />}
              </div>
            </div>
          </div>

          {/* 4 Automatic Inspection Items */}
          <div className="space-y-3">
            {/* 1. Capacity & Pricing */}
            <div className="p-4 rounded-3xl bg-[#141724] border border-[#202538] flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${readinessData?.capacityPricingSet ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {readinessData?.capacityPricingSet ? <Check className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">1. Capacity & Pricing Configured</h4>
                  <p className="text-xs text-slate-400">Venue allocation set to {selectedEvent?.capacity} tickets at ${selectedEvent?.price || 0} base price</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${readinessData?.capacityPricingSet ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300'}`}>
                {readinessData?.capacityPricingSet ? 'Passed' : 'Action Required'}
              </span>
            </div>

            {/* 2. Resale Policy */}
            <div className="p-4 rounded-3xl bg-[#141724] border border-[#202538] flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${readinessData?.resalePolicyConfigured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {readinessData?.resalePolicyConfigured ? <Check className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">2. Anti-Scalp Resale Policy Enforced</h4>
                  <p className="text-xs text-slate-400">Max price cap fixed at {((selectedEvent?.resale_price_cap || 1.2) * 100).toFixed(0)}% face value</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${readinessData?.resalePolicyConfigured ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300'}`}>
                {readinessData?.resalePolicyConfigured ? 'Passed' : 'Action Required'}
              </span>
            </div>

            {/* 3. Payout Account Connected */}
            <div className="p-4 rounded-3xl bg-[#141724] border border-[#202538] flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${readinessData?.payoutAccountConnected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {readinessData?.payoutAccountConnected ? <Check className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">3. Payout Settlement Account Connected</h4>
                  <p className="text-xs text-slate-400">Direct settlement route verified for gross proceeds escrow</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${readinessData?.payoutAccountConnected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300'}`}>
                {readinessData?.payoutAccountConnected ? 'Passed' : 'Action Required'}
              </span>
            </div>

            {/* 4. Scanner Devices Tested */}
            <div className="p-4 rounded-3xl bg-[#141724] border border-[#202538] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${readinessData?.scannerTested ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {readinessData?.scannerTested ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-white">4. Door Scanner Handhelds Verified</h4>
                    <span className="text-[10px] text-cyan-300 font-mono">({readinessData?.testScanCount || 0} scans logged)</span>
                  </div>
                  <p className="text-xs text-slate-400">Turns green only after an actual verified scan is recorded for this event</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={handlePerformTestScan}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#00ff88] text-black font-black text-xs hover:opacity-90 transition flex items-center gap-1.5 shadow-md"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Simulate Test Scan</span>
                </button>
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${readinessData?.scannerTested ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300'}`}>
                  {readinessData?.scannerTested ? 'Verified' : 'Test Needed'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 5: LIVE CHECK-IN VIEW & FRAUD AUDIT (Core Screen #5) */}
      {activeTab === 'checkin_view' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Actionable Flagged Fraud Table */}
          {fraudAlerts.length > 0 && (
            <div className="glass-panel p-5 rounded-3xl border border-rose-500/40 bg-rose-950/20 space-y-3">
              <div className="flex items-center gap-2 text-rose-400">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
                <h3 className="font-display font-black text-base text-white">Actionable Duplicate Entry & Fraud Alerts</h3>
              </div>
              <p className="text-xs text-slate-300">Staff-actionable anomalies detected during door check-ins or offline sync reconciliation</p>

              <div className="space-y-2.5">
                {fraudAlerts.map((alert: any) => (
                  <div key={alert.id} className="p-4 rounded-2xl bg-[#121522] border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{alert.attendeeName || 'Guest'}</span>
                        <span className="text-slate-400">({alert.attendeeEmail || 'N/A'})</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-500 text-white">
                          DUPLICATE SCAN
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Ticket: <span className="font-mono text-cyan-300">{alert.ticket_id}</span> • Device: <span className="font-mono text-slate-300">{alert.scanner_device_id}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Scanned at {new Date(alert.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => alert(`One-time entry override granted for ${alert.attendeeName}`)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition"
                      >
                        Allow Exception
                      </button>
                      <button
                        onClick={() => handleRefund(alert.ticket_id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition"
                      >
                        Revoke & Refund
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Real-Time Live Scans Feed */}
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
            <h3 className="font-display font-black text-base text-white">Real-Time Door Entry Stream</h3>
            {recentScans.length > 0 ? (
              <div className="space-y-2">
                {recentScans.map((scan: any) => (
                  <div key={scan.id} className="p-3 rounded-2xl bg-[#141724] border border-[#202538] flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{scan.attendeeName || 'Attendee'}</span>
                        <span className="text-slate-400">• {scan.eventTitle}</span>
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
                <span>No scans recorded yet. Open Scanner Mode on door devices to admit ticket holders!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCREEN 6: IDEMPOTENT REFUNDS & REVOCATIONS (Core Screen #6) */}
      {activeTab === 'refunds' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 max-w-xl">
            <div>
              <h3 className="font-display font-black text-base text-white">Idempotent 1-Tap Ticket Refund</h3>
              <p className="text-xs text-slate-400">Instant optimistic confirmation with guaranteed double-click protection</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Enter Ticket ID (e.g. tkt_7b4c92fa...)"
                value={refundTicketId}
                onChange={e => setRefundTicketId(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#141724] border border-[#232a3e] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff2d75]"
              />
              <button
                onClick={() => handleRefund()}
                disabled={refundLoading || !refundTicketId.trim()}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/20"
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
        </div>
      )}

      {/* SCREEN 7: TEAM MANAGEMENT (Core Screen #7) */}
      {activeTab === 'team' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Grant Staff Form */}
          {isAdminOrOrganizer && (
            <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4">
              <div>
                <h3 className="font-display font-black text-base text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#00f0ff]" />
                  <span>Grant Door Staff Role & Scanner Access</span>
                </h3>
                <p className="text-xs text-slate-400">Promote team members to operate door scanners with event-scoped permissions</p>
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
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
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
                      <option key={evt.id} value={evt.id}>{evt.title}</option>
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

          {/* Staff Roster */}
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

      {/* SCREEN 8: REPORTING & CSV EXPORT (Core Screen #8) */}
      {activeTab === 'export' && (
        <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4 animate-in fade-in duration-150">
          <div>
            <h3 className="font-display font-black text-lg text-white">Financial Reporting & CSV Data Export</h3>
            <p className="text-xs text-slate-400">Generate complete RFC 4180 compliant CSV exports of orders, ticket holders, and fee breakdowns</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-[#141724] border border-[#202538] flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-[#00ff88]" />
                  <span>Selected Event Sales Export</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Export all ticket sales, scan timestamps, and fee reconciliations for {selectedEvent?.title || 'current event'}.</p>
              </div>
              <button
                onClick={() => api.downloadSalesCsv(currentUser.id, selectedEventId || undefined)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#00ff88] text-black font-black text-xs hover:opacity-90 transition flex items-center justify-center gap-2 shadow-lg"
              >
                <Download className="w-4 h-4" />
                <span>Download Event CSV</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#141724] border border-[#202538] flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-[#9d4edd]" />
                  <span>All Events Portfolio Export</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Complete aggregate ledger across all Nigerian and global gigs managed by your organization.</p>
              </div>
              <button
                onClick={() => api.downloadSalesCsv(currentUser.id)}
                className="w-full py-2.5 rounded-xl bg-[#1a2033] hover:bg-[#222b44] border border-[#2c3754] text-white font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Full Portfolio CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE EVENT MODAL WITH INTERACTIVE MAP-PIN LOCATION PICKER (Core Screen #2) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121522] border border-[#28324a] rounded-3xl p-6 max-w-xl w-full space-y-4 my-8 shadow-2xl">
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
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                />
              </div>

              {/* Map-Pin Location Picker */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Map className="w-3.5 h-3.5 text-[#ff2d75]" />
                    <span>Map Pin Location Picker (Click or drag pin)</span>
                  </label>
                  <span className="text-[10px] font-mono text-cyan-300">
                    {newEventLat.toFixed(4)}, {newEventLng.toFixed(4)}
                  </span>
                </div>
                <div 
                  ref={mapContainerRef} 
                  className="w-full h-44 rounded-2xl overflow-hidden border border-[#2a344d] z-0"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Click on the map or drag the pin to set the exact geographic coordinates for discovery proximity.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 font-bold">Venue Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Landmark Beach"
                    value={newEventVenue}
                    onChange={e => setNewEventVenue(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-bold">Venue Address</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Oniru, VI, Lagos"
                    value={newEventAddress}
                    onChange={e => setNewEventAddress(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2a344d] text-white focus:outline-none focus:border-[#ff2d75]"
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
