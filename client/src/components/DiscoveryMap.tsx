import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { EventItem, User } from '../types';
import { Search, Flame, Music, Sparkles, SlidersHorizontal, Users, Clock, Navigation2, Zap, Crosshair } from 'lucide-react';

interface DiscoveryMapProps {
  events: EventItem[];
  selectedEvent: EventItem | null;
  onSelectEvent: (event: EventItem) => void;
  onOpenDetails: (event: EventItem) => void;
  currentUser: User;
  centerCoordinates: [number, number];
  userLocation: [number, number] | null;
  onDetectLiveLocation: () => void;
  onFilterChange: (filters: { category: string; radiusKm: number; searchQuery: string }) => void;
}

// Controller component to smoothly re-center Leaflet map
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 13, { duration: 1.2 });
  }, [center, map]);
  return null;
}

const CATEGORIES = [
  { id: 'all', label: 'All Vibes', icon: Sparkles },
  { id: 'club', label: 'Club / DJ', icon: Flame },
  { id: 'gig', label: 'Live Gig', icon: Music },
  { id: 'rooftop', label: 'Rooftops', icon: Navigation2 },
  { id: 'popup', label: 'Pop-ups', icon: Zap },
  { id: 'art', label: 'Art & Dome', icon: Sparkles },
];

export const DiscoveryMap: React.FC<DiscoveryMapProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  onOpenDetails,
  currentUser,
  centerCoordinates,
  userLocation,
  onDetectLiveLocation,
  onFilterChange,
}) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState(40);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  const handleCategorySelect = (catId: string) => {
    setActiveCategory(catId);
    onFilterChange({ category: catId, radiusKm, searchQuery });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ category: activeCategory, radiusKm, searchQuery });
  };

  const handleRadiusChange = (newRadius: number) => {
    setRadiusKm(newRadius);
    onFilterChange({ category: activeCategory, radiusKm: newRadius, searchQuery });
  };

  // User's Live GPS Location Marker Icon (Pulsing Cyan Beacon)
  const createUserLocationMarker = () => {
    const html = `
      <div class="relative flex items-center justify-center">
        <div class="absolute -inset-3 rounded-full bg-[#00f0ff]/30 animate-ping"></div>
        <div class="w-6 h-6 rounded-full bg-[#00f0ff] border-2 border-white shadow-xl shadow-cyan-500/50 flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-slate-950"></div>
        </div>
      </div>
    `;
    return L.divIcon({
      html,
      className: 'user-gps-pin',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  // Custom Neon HTML Markers
  const createCustomMarker = (evt: EventItem, isSelected: boolean) => {
    const isHappening = evt.isHappeningSoon;
    const hasFriends = evt.friendsGoingCount > 0;

    const bgGradient = isHappening
      ? 'from-[#ff2d75] to-[#ff8c00]'
      : hasFriends
      ? 'from-[#9d4edd] to-[#ff2d75]'
      : 'from-[#00f0ff] to-[#3a86ff]';

    const pulseRing = isHappening
      ? '<div class="absolute -inset-2 rounded-full bg-[#ff2d75]/40 animate-ping"></div>'
      : '';

    const friendsBadge = hasFriends
      ? `<div class="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded-full bg-[#9d4edd] text-[8px] font-black text-white border border-white/40 shadow-sm">${evt.friendsGoingCount}f</div>`
      : '';

    const html = `
      <div class="relative flex items-center justify-center cursor-pointer transform transition-transform duration-200 ${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}">
        ${pulseRing}
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr ${bgGradient} p-0.5 shadow-xl shadow-black/80 flex items-center justify-center border border-white/60">
          <div class="w-full h-full rounded-full bg-[#0d101a] flex items-center justify-center text-white font-bold text-[10px]">
            ${evt.category === 'club' ? '🔥' : evt.category === 'rooftop' ? '🍸' : evt.category === 'gig' ? '🎸' : evt.category === 'popup' ? '⚡' : '✨'}
          </div>
        </div>
        ${friendsBadge}
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-map-pin',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  };

  return (
    <div className="relative w-full h-[calc(100vh-125px)] flex flex-col overflow-hidden bg-[#090a0f]">
      {/* Top Floating Search & Category Filter Bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-col gap-2 max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search raves, beach clubs, secret pop-ups..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-[#12141e]/90 backdrop-blur-xl border border-[#262c42] text-xs text-white placeholder-slate-400 shadow-2xl focus:outline-none focus:border-[#ff2d75] transition"
            />
          </form>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 rounded-2xl border backdrop-blur-xl transition ${
              showFilters
                ? 'bg-[#ff2d75] text-white border-[#ff2d75]'
                : 'bg-[#12141e]/90 text-slate-300 border-[#262c42] hover:bg-[#1a1f30]'
            }`}
            title="Filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
            className="px-3.5 py-2.5 rounded-2xl bg-[#12141e]/90 text-slate-200 border border-[#262c42] text-xs font-semibold backdrop-blur-xl hover:bg-[#1a1f30] transition flex items-center gap-1.5"
          >
            {viewMode === 'map' ? 'List View' : 'Map View'}
          </button>
        </div>

        {/* Expandable Radius Slider */}
        {showFilters && (
          <div className="glass-panel rounded-2xl p-3.5 shadow-2xl border border-[#2a3048] flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Search Distance Radius:</span>
              <span className="text-[#ff2d75] font-bold">{radiusKm} km</span>
            </div>
            <input
              type="range"
              min="2"
              max="100"
              step="1"
              value={radiusKm}
              onChange={e => handleRadiusChange(Number(e.target.value))}
              className="w-full accent-[#ff2d75] cursor-pointer"
            />
          </div>
        )}

        {/* Horizontal Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all shadow-md ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white shadow-pink-500/25 scale-105'
                    : 'bg-[#12141e]/90 text-slate-300 border border-[#212638] hover:bg-[#1c2033]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating GPS Re-Center Button */}
      <button
        onClick={onDetectLiveLocation}
        className="absolute bottom-28 right-4 z-[1000] p-3 rounded-full bg-[#12141e]/90 backdrop-blur-xl border border-[#00f0ff]/50 text-[#00f0ff] hover:scale-110 shadow-2xl shadow-cyan-500/30 transition-all"
        title="Center on My Location (GPS)"
      >
        <Crosshair className="w-5 h-5 animate-pulse" />
      </button>

      {/* Main Map View */}
      {viewMode === 'map' ? (
        <div className="w-full h-full relative">
          <MapContainer
            center={centerCoordinates}
            zoom={13}
            zoomControl={false}
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController center={centerCoordinates} />

            {/* Live User Location Beacon */}
            {userLocation && (
              <Marker position={userLocation} icon={createUserLocationMarker()}>
                <Popup className="custom-popup" closeButton={false}>
                  <div className="p-1 text-center">
                    <span className="text-xs font-bold text-[#00f0ff]">📍 You are here</span>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Event Markers */}
            {events.map(evt => (
              <Marker
                key={evt.id}
                position={[evt.lat, evt.lng]}
                icon={createCustomMarker(evt, selectedEvent?.id === evt.id)}
                eventHandlers={{
                  click: () => onSelectEvent(evt),
                }}
              >
                <Popup className="custom-popup" closeButton={false}>
                  <div className="p-1 min-w-[200px] text-slate-100">
                    <div className="relative h-20 w-full rounded-lg overflow-hidden mb-2">
                      <img src={evt.image_url} alt={evt.title} className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-black/70 text-white backdrop-blur-md">
                        {evt.category}
                      </div>
                      <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#ff2d75] text-white shadow-md">
                        ${evt.price.toFixed(2)}
                      </div>
                    </div>

                    <h4 className="font-bold text-xs text-white line-clamp-1">{evt.title}</h4>
                    <p className="text-[10px] text-slate-400 mb-2">{evt.venue_name}</p>

                    {evt.friendsGoingCount > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-[#9d4edd] font-semibold mb-2">
                        <Users className="w-3 h-3" />
                        <span>{evt.friendsGoingCount} friend{evt.friendsGoingCount > 1 ? 's' : ''} going</span>
                      </div>
                    )}

                    <button
                      onClick={() => onOpenDetails(evt)}
                      className="w-full py-1.5 rounded-lg bg-gradient-to-r from-[#ff2d75] to-[#9d4edd] text-white text-xs font-bold text-center hover:opacity-90 transition"
                    >
                      View & Buy Tickets
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Bottom Floating Event Preview Card on Map */}
          {selectedEvent && (
            <div className="absolute bottom-4 left-3 right-3 z-[1000] max-w-md mx-auto">
              <div
                onClick={() => onOpenDetails(selectedEvent)}
                className="glass-panel-glow rounded-3xl p-3.5 flex items-center gap-3.5 shadow-2xl cursor-pointer hover:scale-[1.02] transition-transform animate-in slide-in-from-bottom-6 duration-200"
              >
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                  <img src={selectedEvent.image_url} alt={selectedEvent.title} className="w-full h-full object-cover" />
                  {selectedEvent.isHappeningSoon && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-red-600 text-[8px] font-black text-white uppercase animate-pulse">
                      Live
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#ff2d75] truncate">
                      {selectedEvent.category} • {selectedEvent.venue_name}
                    </span>
                    <span className="text-xs font-black text-white">${selectedEvent.price.toFixed(2)}</span>
                  </div>

                  <h3 className="font-display font-bold text-sm text-white truncate">{selectedEvent.title}</h3>

                  {/* Social Proof Indicator */}
                  {selectedEvent.friendsGoingCount > 0 ? (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#9d4edd] font-semibold">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {selectedEvent.friendsGoingPreview.slice(0, 3).map(f => (
                          <img key={f.friendId} src={f.avatar} alt={f.friendName} className="w-4 h-4 rounded-full border border-[#12141e] object-cover" />
                        ))}
                      </div>
                      <span>
                        {selectedEvent.friendsGoingPreview[0]?.friendName.split(' ')[0]}
                        {selectedEvent.friendsGoingCount > 1 ? ` +${selectedEvent.friendsGoingCount - 1} going` : ' is going'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{new Date(selectedEvent.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span className={selectedEvent.tickets_remaining <= 5 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                        {selectedEvent.tickets_remaining > 0 ? `${selectedEvent.tickets_remaining} tix left` : 'Sold out'}
                      </span>
                      {selectedEvent.distanceKm !== undefined && (
                        <>
                          <span>•</span>
                          <span className="text-[#00f0ff] font-bold">{selectedEvent.distanceKm} km away</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List Mode View */
        <div className="flex-1 overflow-y-auto pt-24 px-4 pb-20 max-w-3xl mx-auto w-full space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Showing {events.length} nearby events</span>
            <span>Sorted by distance</span>
          </div>

          {events.map(evt => (
            <div
              key={evt.id}
              onClick={() => onOpenDetails(evt)}
              className="glass-panel rounded-3xl p-3.5 flex items-center gap-4 hover:border-[#ff2d75]/40 transition cursor-pointer shadow-lg"
            >
              <img src={evt.image_url} alt={evt.title} className="w-24 h-24 rounded-2xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-[#ff2d75] tracking-wider">{evt.category}</span>
                  <span className="text-sm font-black text-white">${evt.price.toFixed(2)}</span>
                </div>
                <h3 className="font-bold text-sm text-white truncate mt-0.5">{evt.title}</h3>
                <p className="text-xs text-slate-400 truncate">{evt.venue_name} • {evt.venue_address}</p>

                <div className="mt-2 flex items-center justify-between text-xs">
                  {evt.distanceKm !== undefined ? (
                    <span className="text-[11px] text-[#00f0ff] font-bold">📍 {evt.distanceKm} km away</span>
                  ) : (
                    <span className="text-[10px] text-slate-500">
                      {new Date(evt.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  )}

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    evt.tickets_remaining === 0
                      ? 'bg-red-500/20 text-red-300'
                      : evt.tickets_remaining <= 5
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {evt.tickets_remaining > 0 ? `${evt.tickets_remaining} left` : 'Waitlist only'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
