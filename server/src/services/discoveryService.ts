import { db } from '../db/index.js';
import { socialService } from './socialService.js';

export interface DiscoveryQuery {
  lat?: number;
  lng?: number;
  radiusKm?: number; // default e.g. 15 km
  category?: string; // club | gig | popup | art | rooftop
  timeFilter?: 'tonight' | 'tomorrow' | 'weekend' | 'all';
  searchQuery?: string;
  viewerUserId?: string;
}

export interface DiscoveredEvent {
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
  category: string;
  capacity: number;
  tickets_remaining: number;
  price: number;
  resale_allowed: number;
  resale_price_cap: number;
  status: string;
  image_url: string;
  vibe_tags: string[];
  distanceKm?: number;
  isHappeningSoon: boolean;
  friendsGoingCount: number;
  friendsGoingPreview: Array<{ friendId: string; friendName: string; avatar: string }>;
  totalPublicGoingCount: number;
}

class DiscoveryService {
  private cache = new Map<string, { timestamp: number; data: DiscoveredEvent[] }>();
  private readonly CACHE_TTL_MS = 15000; // 15 seconds TTL for hot queries

  /**
   * Calculates Haversine distance in kilometers between two geo-coordinates
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  /**
   * Serves "events near me" discovery queries with radius, category, time, and privacy-aware social signals
   */
  searchEvents(params: DiscoveryQuery): DiscoveredEvent[] {
    const {
      lat = 40.7128,
      lng = -74.006,
      radiusKm = 50,
      category,
      timeFilter = 'all',
      searchQuery,
      viewerUserId,
    } = params;

    const cacheKey = JSON.stringify({ lat: lat.toFixed(3), lng: lng.toFixed(3), radiusKm, category, timeFilter, searchQuery, viewerUserId });
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // Build base query
    let sql = `SELECT * FROM events WHERE status = 'published'`;
    const queryArgs: any[] = [];

    if (category && category !== 'all') {
      sql += ` AND category = ?`;
      queryArgs.push(category);
    }

    if (searchQuery && searchQuery.trim().length > 0) {
      sql += ` AND (title LIKE ? OR description LIKE ? OR venue_name LIKE ?)`;
      const term = `%${searchQuery.trim()}%`;
      queryArgs.push(term, term, term);
    }

    const now = new Date();
    if (timeFilter === 'tonight') {
      // Events starting in next 12 hours
      const in12h = new Date(now.getTime() + 12 * 3600 * 1000).toISOString();
      sql += ` AND start_time <= ? AND end_time >= ?`;
      queryArgs.push(in12h, now.toISOString());
    } else if (timeFilter === 'tomorrow') {
      const in24h = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
      const in48h = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
      sql += ` AND start_time >= ? AND start_time <= ?`;
      queryArgs.push(in24h, in48h);
    }

    sql += ` ORDER BY start_time ASC`;

    const rawEvents = db.prepare(sql).all(...queryArgs) as any[];

    // Calculate distance, filter by radius, check 'happening soon' and inject social signals
    const results: DiscoveredEvent[] = [];

    for (const evt of rawEvents) {
      const dist = this.haversineDistance(lat, lng, evt.lat, evt.lng);
      if (radiusKm && dist > radiusKm) continue;

      const startTime = new Date(evt.start_time).getTime();
      const isHappeningSoon = startTime - now.getTime() < 4 * 3600 * 1000 && startTime - now.getTime() > -2 * 3600 * 1000;

      // Fetch privacy-aware social signals for the viewer
      const socialInfo = socialService.getFriendsAttendingEvent(viewerUserId || null, evt.id);

      let parsedTags: string[] = [];
      try {
        parsedTags = JSON.parse(evt.vibe_tags || '[]');
      } catch (_) {
        parsedTags = [];
      }

      results.push({
        ...evt,
        vibe_tags: parsedTags,
        distanceKm: dist,
        isHappeningSoon,
        friendsGoingCount: socialInfo.friendsGoingCount,
        friendsGoingPreview: socialInfo.friends,
        totalPublicGoingCount: socialInfo.publicCount,
      });
    }

    // Sort primarily by distance if location provided, then by start time
    results.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

    // Save to cache
    this.cache.set(cacheKey, { timestamp: Date.now(), data: results });

    return results;
  }
}

export const discoveryService = new DiscoveryService();
