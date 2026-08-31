export type UserRole = 'attendee' | 'staff' | 'organizer' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: UserRole;
}

export interface EventItem {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  venue_name: string;
  venue_address: string;
  start_time: string;
  end_time: string;
  category: 'club' | 'gig' | 'popup' | 'art' | 'rooftop' | 'comedy';
  capacity: number;
  tickets_remaining: number;
  price: number;
  resale_allowed: number;
  resale_price_cap: number;
  status: 'published' | 'cancelled' | 'ended';
  image_url: string;
  vibe_tags: string[];
  distanceKm?: number;
  isHappeningSoon: boolean;
  friendsGoingCount: number;
  friendsGoingPreview: Array<{ friendId: string; friendName: string; avatar: string }>;
  totalPublicGoingCount: number;
  reviews?: PostEventReview[];
}

export interface TicketItem {
  id: string;
  event_id: string;
  owner_user_id: string;
  order_id: string;
  status: 'valid' | 'used' | 'revoked' | 'refunded';
  signed_token: string;
  created_at: string;
  used_at?: string;
  used_by_device_id?: string;
  eventTitle?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  venueName?: string;
  venueAddress?: string;
  originalPrice?: number;
  imageUrl?: string;
  category?: string;
  resaleAllowed?: number;
  resalePriceCap?: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'ticket_issued' | 'resale_sold' | 'resale_purchased' | 'waitlist_alert' | 'gate_update' | 'friend_going';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface PostEventReview {
  id: string;
  event_id: string;
  user_id: string;
  userName?: string;
  userAvatar?: string;
  photo_url?: string;
  reaction: 'fire' | 'love' | 'hype' | 'meh';
  comment?: string;
  created_at: string;
}

export interface FraudAlertLog {
  id: string;
  ticket_id: string;
  event_id: string;
  eventTitle?: string;
  owner_user_id?: string;
  ownerName?: string;
  scanner_device_id: string;
  scanned_at: string;
  synced_at: string;
  sync_status: string;
  is_flagged_duplicate: number;
}

export interface OfflineManifest {
  eventId: string;
  eventTitle: string;
  publicKeyPem: string;
  validTicketIds: string[];
  syncedAt: string;
}

export interface QueuedOfflineScan {
  ticketId: string;
  token: string;
  scannerDeviceId: string;
  scannedAt: string;
  verifiedLocally: boolean;
}
