import React, { useState, useEffect } from 'react';
import { User, EventItem, TicketItem, NotificationItem } from './types';
import { api } from './services/api';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { DiscoveryMap } from './components/DiscoveryMap';
import { EventDetailModal } from './components/EventDetailModal';
import { CheckoutModal } from './components/CheckoutModal';
import { TicketWallet } from './components/TicketWallet';
import { ScannerMode } from './components/ScannerMode';
import { OrganizerDashboard } from './components/OrganizerDashboard';
import { AdminPanel } from './components/AdminPanel';
import { SocialTab } from './components/SocialTab';
import { NotificationDrawer } from './components/NotificationDrawer';
import { AuthScreen } from './components/AuthScreen';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('explore');

  // Location State (Defaulting to Nigeria - Lagos VI / Live GPS)
  const [selectedCity, setSelectedCity] = useState<{ name: string; lat: number; lng: number; isLiveGps?: boolean }>({
    name: 'Lagos, Nigeria',
    lat: 6.4281,
    lng: 3.4219,
    isLiveGps: false,
  });
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline' | 'spotty'>('online');

  // Events & Discovery State
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [activeDetailEvent, setActiveDetailEvent] = useState<EventItem | null>(null);
  const [filters, setFilters] = useState({ category: 'all', radiusKm: 60, searchQuery: '' });

  // Tickets & Wallet State
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [checkoutModalData, setCheckoutModalData] = useState<{ event: EventItem; quantity: number } | null>(null);

  // Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Function to detect and lock onto user's live GPS coordinates
  const detectLiveLocation = () => {
    if (!navigator.geolocation) return;
    setIsDetectingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        setSelectedCity({
          name: '📍 Live GPS Location',
          lat: latitude,
          lng: longitude,
          isLiveGps: true,
        });
        setSelectedEvent(null);
        setIsDetectingLocation(false);
      },
      (error) => {
        console.warn('Geolocation access error or denied:', error.message);
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  // On initial mount: check for existing session
  useEffect(() => {
    api.getSession().then(result => {
      if (result.success && result.user) {
        setCurrentUser(result.user);
        detectLiveLocation();
      }
      setIsCheckingSession(false);
    });
  }, []);

  // Handle successful authentication (from AuthScreen)
  const handleAuthenticated = (user: User) => {
    setCurrentUser(user);
    detectLiveLocation();

    // Route to appropriate tab based on role
    if (user.role === 'admin') {
      setActiveTab('admin');
    } else if (user.role === 'organizer') {
      setActiveTab('organizer');
    } else if (user.role === 'staff') {
      setActiveTab('scanner');
    } else {
      setActiveTab('explore');
    }
  };

  // Handle logout
  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setTickets([]);
    setNotifications([]);
    setEvents([]);
    setSelectedEvent(null);
    setActiveDetailEvent(null);
    setActiveTab('explore');
  };

  // Strict RBAC Redirection: If current user is attendee, prevent access to scanner/organizer/admin tabs
  useEffect(() => {
    if (currentUser?.role === 'attendee') {
      if (activeTab === 'scanner' || activeTab === 'organizer' || activeTab === 'admin') {
        setActiveTab('explore');
      }
    } else if (currentUser?.role === 'staff' || currentUser?.role === 'organizer') {
      if (activeTab === 'admin') {
        setActiveTab('explore');
      }
    }
  }, [currentUser, activeTab]);

  // Fetch Events when city, filters, or currentUser changes
  const fetchEvents = () => {
    api.searchEvents({
      lat: selectedCity.lat,
      lng: selectedCity.lng,
      radiusKm: filters.radiusKm,
      category: filters.category,
      q: filters.searchQuery,
      viewerUserId: currentUser?.id,
    }).then(evts => {
      setEvents(evts);
      if (evts.length > 0 && !selectedEvent) {
        setSelectedEvent(evts[0]);
      }
    });
  };

  useEffect(() => {
    if (currentUser) fetchEvents();
  }, [selectedCity, filters, currentUser]);

  // Fetch User Tickets & Notifications
  const fetchUserData = () => {
    if (!currentUser) return;
    api.getUserTickets(currentUser.id).then(setTickets);
    api.getUserNotifications(currentUser.id).then(setNotifications);
  };

  useEffect(() => {
    fetchUserData();
    const interval = setInterval(fetchUserData, 4000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleOpenEventDetails = (event: EventItem) => {
    setActiveDetailEvent(event);
  };

  const handleBuyTicketsTrigger = (event: EventItem, quantity: number) => {
    setActiveDetailEvent(null);
    setCheckoutModalData({ event, quantity });
  };

  const handlePurchaseSuccess = (issuedTickets: TicketItem[]) => {
    fetchUserData();
    fetchEvents();
    setActiveTab('wallet');
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    if (!currentUser) return;
    await api.markNotificationRead(currentUser.id, notifId);
    fetchUserData();
  };

  // Loading state while checking session
  if (isCheckingSession) {
    return (
      <div className="w-full h-screen bg-[#090a0f] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#ff2d75] animate-pulse" />
          <span className="font-display font-bold text-sm tracking-wider">INITIALIZING EVNT PLATFORM...</span>
        </div>
      </div>
    );
  }

  // Not authenticated — show AuthScreen
  if (!currentUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col selection:bg-[#ff2d75] selection:text-white max-w-full overflow-x-hidden">
      {/* Top Application Header */}
      <Header
        currentUser={currentUser}
        selectedCity={selectedCity}
        onSelectCity={city => {
          setSelectedCity(city);
          setSelectedEvent(null);
        }}
        onDetectLiveLocation={detectLiveLocation}
        isDetectingLocation={isDetectingLocation}
        notifications={notifications}
        onOpenNotifications={() => setShowNotifications(true)}
        networkStatus={networkStatus}
        onLogout={handleLogout}
      />

      {/* Main View Body */}
      <main className="flex-1 w-full relative">
        {activeTab === 'explore' && (
          <DiscoveryMap
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            onOpenDetails={handleOpenEventDetails}
            currentUser={currentUser}
            centerCoordinates={[selectedCity.lat, selectedCity.lng]}
            userLocation={userLocation}
            onDetectLiveLocation={detectLiveLocation}
            onFilterChange={setFilters}
          />
        )}

        {activeTab === 'wallet' && (
          <TicketWallet
            tickets={tickets}
            currentUser={currentUser}
            users={[currentUser]}
            onRefreshTickets={fetchUserData}
          />
        )}

        {activeTab === 'social' && (
          <SocialTab
            currentUser={currentUser}
            users={[currentUser]}
            events={events}
            onOpenEvent={handleOpenEventDetails}
          />
        )}

        {activeTab === 'organizer' && (currentUser.role === 'organizer' || currentUser.role === 'admin' || currentUser.role === 'staff') && (
          <OrganizerDashboard
            currentUser={currentUser}
            onRefreshEvents={fetchEvents}
          />
        )}

        {activeTab === 'scanner' && (currentUser.role === 'staff' || currentUser.role === 'organizer' || currentUser.role === 'admin') && (
          <ScannerMode
            events={events}
            scannerDeviceId={currentUser.role === 'staff' ? `gate_scanner_${currentUser.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : 'admin_handheld_gate_1'}
            networkStatus={networkStatus}
            onToggleNetworkStatus={setNetworkStatus}
          />
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <AdminPanel
            currentUser={currentUser}
            onRefreshEvents={fetchEvents}
          />
        )}
      </main>

      {/* Slide-Up Event Detail Drawer */}
      {activeDetailEvent && (
        <EventDetailModal
          event={activeDetailEvent}
          onClose={() => setActiveDetailEvent(null)}
          onBuyTickets={handleBuyTicketsTrigger}
          currentUser={currentUser}
          onRefreshEvent={() => {
            fetchEvents();
            if (activeDetailEvent) {
              api.getEventDetails(activeDetailEvent.id, currentUser.id).then(e => {
                if (e) setActiveDetailEvent(e);
              });
            }
          }}
        />
      )}

      {/* 1-Tap Fast Checkout Modal */}
      {checkoutModalData && (
        <CheckoutModal
          event={checkoutModalData.event}
          quantity={checkoutModalData.quantity}
          currentUser={currentUser}
          onClose={() => setCheckoutModalData(null)}
          onSuccess={handlePurchaseSuccess}
          onJoinWaitlist={() => {
            api.joinWaitlist(checkoutModalData.event.id, currentUser.id);
            fetchEvents();
          }}
        />
      )}

      {/* Notifications Drawer */}
      {showNotifications && (
        <NotificationDrawer
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkRead={handleMarkNotificationRead}
        />
      )}

      {/* Bottom Sticky Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ticketCount={tickets.filter(t => t.status === 'valid').length}
        userRole={currentUser.role}
      />
    </div>
  );
};
