import React, { useState, useEffect } from 'react';
import { User, EventItem, FraudAlertLog } from '../types';
import { api } from '../services/api';
import { BarChart3, TrendingUp, Users, DollarSign, AlertOctagon, RotateCcw, Plus, CheckCircle, ShieldAlert, Sparkles, MapPin } from 'lucide-react';

interface OrganizerDashboardProps {
  currentUser: User;
  onRefreshEvents: () => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({
  currentUser,
  onRefreshEvents,
}) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refundTicketId, setRefundTicketId] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  // New Event Form Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventVenue, setNewEventVenue] = useState('');
  const [newEventAddress, setNewEventAddress] = useState('');
  const [newEventLat, setNewEventLat] = useState(40.7128);
  const [newEventLng, setNewEventLng] = useState(-73.9352);
  const [newEventCapacity, setNewEventCapacity] = useState(150);
  const [newEventPrice, setNewEventPrice] = useState(25.00);
  const [newEventCategory, setNewEventCategory] = useState<'club' | 'gig' | 'popup' | 'art' | 'rooftop'>('club');
  const [newEventResaleCap, setNewEventResaleCap] = useState(1.20);
  const [newEventImageUrl, setNewEventImageUrl] = useState('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800');
  const [createLoading, setCreateLoading] = useState(false);

  const fetchAnalytics = async () => {
    try {
      const data = await api.getOrganizerAnalytics(currentUser.id);
      if (data.success) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 3500); // Live telemetry refresh
    return () => clearInterval(interval);
  }, [currentUser.id]);

  const handleRefund = async () => {
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
        capacity: newEventCapacity,
        price: newEventPrice,
        resale_allowed: 1,
        resale_price_cap: newEventResaleCap,
        status: 'published',
        image_url: newEventImageUrl,
        vibe_tags: JSON.stringify(['Live', 'Verified Pass', newEventCategory]),
      });

      setShowCreateModal(false);
      fetchAnalytics();
      onRefreshEvents();
    } catch (err: any) {
      alert(`Failed to create event: ${err.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading || !analytics) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading organizer live telemetry...</div>;
  }

  const { summary, events, recentScans, fraudAlerts } = analytics;

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff2d75] animate-pulse" />
            <h2 className="font-display font-black text-2xl text-white">Organizer Mission Control</h2>
          </div>
          <p className="text-xs text-slate-400">Real-Time Sales & Gate Telemetry</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white text-xs font-bold hover:opacity-90 transition shadow-xl shadow-pink-500/20 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Event</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Gross Revenue</span>
            <DollarSign className="w-4 h-4 text-[#00ff88]" />
          </div>
          <div className="font-display font-black text-2xl text-white">${summary.totalRevenue.toFixed(2)}</div>
          <div className="text-[10px] text-emerald-400 font-semibold mt-1">Instant settlements</div>
        </div>

        <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Tickets Sold</span>
            <TrendingUp className="w-4 h-4 text-[#00f0ff]" />
          </div>
          <div className="font-display font-black text-2xl text-white">{summary.totalTicketsSold}</div>
          <div className="text-[10px] text-slate-400 mt-1">Across {events.length} listings</div>
        </div>

        <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Admitted at Gate</span>
            <Users className="w-4 h-4 text-[#9d4edd]" />
          </div>
          <div className="font-display font-black text-2xl text-white">{summary.totalAdmitted}</div>
          <div className="text-[10px] text-purple-300 font-semibold mt-1">{summary.admissionRatePercent}% check-in rate</div>
        </div>

        <div className="glass-panel p-4 rounded-3xl border border-[#212638]">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Line Speed</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-display font-black text-2xl text-white">{recentScans.length * 4}</div>
          <div className="text-[10px] text-amber-400 font-semibold mt-1">scans / minute</div>
        </div>
      </div>

      {/* Security Alert Feed: Flagged Duplicate / Fraud Scans (§6) */}
      {fraudAlerts && fraudAlerts.length > 0 && (
        <div className="glass-panel-glow p-5 rounded-3xl border border-rose-500/40 space-y-3 bg-rose-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500 animate-bounce" />
              <h3 className="font-display font-black text-base text-white uppercase tracking-wider">
                Flagged Duplicate Scan Alerts ({fraudAlerts.length})
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full">
              Action Required
            </span>
          </div>

          <p className="text-xs text-slate-300">
            The following tickets were scanned more than once across doors/offline handhelds. Review timestamps and notify gate security:
          </p>

          <div className="space-y-2">
            {fraudAlerts.map((fraud: any) => (
              <div key={fraud.id} className="p-3 rounded-2xl bg-[#12141e] border border-rose-500/30 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <AlertOctagon className="w-4 h-4 text-rose-400" />
                    <span>Duplicate Entry: {fraud.eventTitle || 'Event'}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    Pass Holder: <span className="font-semibold text-white">{fraud.ownerName || 'User'}</span>
                  </p>
                  <p className="text-[10px] font-mono text-slate-400">
                    Scanned at {new Date(fraud.scanned_at).toLocaleTimeString()} via Gate Terminal ({fraud.scanner_device_id})
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-rose-500 text-white shadow-sm flex-shrink-0">
                  FLAGGED
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-time Gate Velocity & Line Speed Gauge */}
      <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-black text-base text-white">Live Gate Velocity & Line Flow</h3>
          <span className="text-xs text-slate-400">{recentScans.length} verified door entries</span>
        </div>

        <div className="space-y-2">
          {recentScans.slice(0, 6).map((scan: any) => (
            <div key={scan.id} className="p-2.5 rounded-xl bg-[#141724] border border-[#202538] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#00ff88]" />
                <span className="font-semibold text-white">{scan.attendeeName || 'Attendee'}</span>
                <span className="text-slate-500 text-[10px]">Gate ({scan.scanner_device_id})</span>
              </div>
              <span className="text-slate-400 font-mono text-[10px]">
                {new Date(scan.scanned_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* One-Tap Refund & Ticket Revocation Tool (§10.4) */}
      <div className="glass-panel p-5 rounded-3xl border border-[#212638] space-y-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-[#ff2d75]" />
          <h3 className="font-display font-black text-base text-white">Instant 1-Tap Customer Refund</h3>
        </div>
        <p className="text-xs text-slate-400">
          Instantly revokes ticket cryptographic signature, returns inventory to event, and processes automatic payment refund.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Ticket ID (e.g. tkt_sarah_bushwick_001)..."
            value={refundTicketId}
            onChange={e => setRefundTicketId(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-2xl bg-[#141724] border border-[#212638] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff2d75]"
          />
          <button
            onClick={handleRefund}
            disabled={refundLoading || !refundTicketId.trim()}
            className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-40 shadow-lg shadow-rose-600/20"
          >
            {refundLoading ? 'Revoking...' : 'Refund & Revoke'}
          </button>
        </div>

        {refundMsg && (
          <div className="p-3 rounded-xl bg-[#141724] border border-[#2a3048] text-xs text-slate-200">
            {refundMsg}
          </div>
        )}
      </div>

      {/* Modal: Create Event */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-[#10131e] border border-[#262c42] rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-black text-xl text-white">Create Verified Event</h3>

            <form onSubmit={handleCreateEvent} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-300 font-bold">Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Secret Warehouse Rave"
                  value={newEventTitle}
                  onChange={e => setNewEventTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white focus:outline-none focus:border-[#ff2d75]"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold">Description</label>
                <textarea
                  rows={2}
                  placeholder="Event lineup, vibes, sound system details..."
                  value={newEventDesc}
                  onChange={e => setNewEventDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white focus:outline-none focus:border-[#ff2d75]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-bold">Venue Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Subterranean Loft"
                    value={newEventVenue}
                    onChange={e => setNewEventVenue(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-bold">Venue Address</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 50 Bogart St, Brooklyn"
                    value={newEventAddress}
                    onChange={e => setNewEventAddress(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white focus:outline-none focus:border-[#ff2d75]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-bold">Category</label>
                  <select
                    value={newEventCategory}
                    onChange={e => setNewEventCategory(e.target.value as any)}
                    className="w-full mt-1 px-2 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white"
                  >
                    <option value="club">Club / DJ</option>
                    <option value="gig">Live Gig</option>
                    <option value="rooftop">Rooftop</option>
                    <option value="popup">Pop-up</option>
                    <option value="art">Art / Dome</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-bold">Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={newEventCapacity}
                    onChange={e => setNewEventCapacity(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-bold">Price ($)</label>
                  <input
                    type="number"
                    step="1"
                    value={newEventPrice}
                    onChange={e => setNewEventPrice(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-bold">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newEventLat}
                    onChange={e => setNewEventLat(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-bold">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newEventLng}
                    onChange={e => setNewEventLng(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-2 rounded-xl bg-[#181d2f] border border-[#2c3652] text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-2xl bg-[#181d2f] text-slate-400 font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white font-bold hover:opacity-90 transition shadow-lg shadow-pink-500/25"
                >
                  {createLoading ? 'Publishing...' : 'Publish Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
