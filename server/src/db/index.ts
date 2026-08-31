import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DBWrapper {
  public rawDb: DatabaseSync;

  constructor(finalPath: string) {
    this.rawDb = new DatabaseSync(finalPath);
    this.rawDb.exec('PRAGMA journal_mode = WAL;');
    this.rawDb.exec('PRAGMA synchronous = NORMAL;');
    this.rawDb.exec('PRAGMA foreign_keys = ON;');
  }

  exec(sql: string) {
    return this.rawDb.exec(sql);
  }

  prepare(sql: string) {
    const stmt = this.rawDb.prepare(sql);
    return {
      all: (...args: any[]) => stmt.all(...args),
      get: (...args: any[]) => stmt.get(...args),
      run: (...args: any[]) => stmt.run(...args),
    };
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      this.rawDb.exec('BEGIN IMMEDIATE;');
      try {
        const result = fn();
        this.rawDb.exec('COMMIT;');
        return result;
      } catch (err) {
        this.rawDb.exec('ROLLBACK;');
        throw err;
      }
    };
  }
}

export function initDatabase(dbPath?: string): DBWrapper {
  const finalPath = dbPath || path.join(__dirname, '../../data.db');
  const db = new DBWrapper(finalPath);

  // Load schema
  db.exec(SCHEMA_SQL);

  // Seed explore events if DB is empty (so the map isn't barren)
  seedExploreEvents(db);

  return db;
}

// ---------------------------------------------------------------------------
// Seed Events — keep the explore map populated with real venues
// These events are owned by a system organizer that's auto-created
// ---------------------------------------------------------------------------
function seedExploreEvents(db: DBWrapper) {
  const eventCount = (db.prepare('SELECT COUNT(*) as count FROM events').get() as any).count;
  if (eventCount > 0) return; // Already seeded

  // Create a system organizer to own seed events
  const systemUser = db.prepare('SELECT id FROM users WHERE id = ?').get('usr_system') as any;
  if (!systemUser) {
    db.prepare(`
      INSERT INTO users (id, email, name, avatar, role)
      VALUES ('usr_system', 'system@evnt.live', 'EVNT Platform', 'https://ui-avatars.com/api/?name=EV&background=ff2d75&color=fff&size=150&bold=true&format=svg', 'organizer')
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO organizer_profiles (user_id, organization_name, verification_status, payout_account_id, trust_tier, completed_events_count, verified_at)
      VALUES ('usr_system', 'EVNT Official Showcases', 'verified', 'acct_system_platform', 3, 50, datetime('now', '-90 days'))
    `).run();
  }

  const insertEvent = db.prepare(`
    INSERT INTO events (
      id, organizer_id, title, description, lat, lng, venue_name, venue_address,
      start_time, end_time, category, capacity, tickets_remaining, price,
      resale_allowed, resale_price_cap, status, image_url, vibe_tags
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const now = new Date();
  const tonight = new Date(now.getTime() + 2 * 3600 * 1000).toISOString();
  const tonightEnd = new Date(now.getTime() + 7 * 3600 * 1000).toISOString();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const tomorrowEnd = new Date(now.getTime() + 29 * 3600 * 1000).toISOString();
  const thisWeekend = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
  const thisWeekendEnd = new Date(now.getTime() + 54 * 3600 * 1000).toISOString();

  const events = [
    // 🇳🇬 Nigeria (Lagos & Abuja) Events
    {
      id: 'evt_obis_house_lagos',
      organizer_id: 'usr_system',
      title: "Obi's House: Underground Afrobeats & Amapiano Live",
      description: 'Lagos most electrifying weekly underground rave. 360 stage, live drums, unreleased Afrobeats dubplates, and non-stop Amapiano energy till dawn.',
      lat: 6.4253, lng: 3.4219,
      venue_name: 'Hard Rock Cafe Stage, Landmark Beach',
      venue_address: 'Water Corporation Dr, Victoria Island, Lagos',
      start_time: tonight, end_time: tonightEnd,
      category: 'club', capacity: 500, tickets_remaining: 32, price: 15.00,
      resale_allowed: 1, resale_price_cap: 1.20, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
      vibe_tags: JSON.stringify(['Amapiano', 'Afrobeats', 'Landmark Beach', 'Obis House', 'Lagos Nightlife']),
    },
    {
      id: 'evt_moist_beach_rave_lagos',
      organizer_id: 'usr_system',
      title: 'Moist Beach Club: Sunset Afro-House & Cocktails',
      description: 'Oceanfront sunset sessions with panoramic Atlantic views. Deep afro-house, crafted tropical cocktails, and secret guest DJ sets right on the sand.',
      lat: 6.4281, lng: 3.4358,
      venue_name: 'Moist Beach Club',
      venue_address: 'Ligali Ayorinde St, Oniru Private Beach, Victoria Island, Lagos',
      start_time: tomorrow, end_time: tomorrowEnd,
      category: 'rooftop', capacity: 350, tickets_remaining: 45, price: 20.00,
      resale_allowed: 1, resale_price_cap: 1.15, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
      vibe_tags: JSON.stringify(['Sunset', 'Beach Rave', 'Afro House', 'Oniru', 'Cocktails']),
    },
    {
      id: 'evt_lekki_secret_suya_popup',
      organizer_id: 'usr_system',
      title: 'Midnight Suya, Alté & UK Drill Warehouse Pop-Up',
      description: 'Gourmet charcoal-smoked suya meet live Alté soundscapes and UK Drill. Ticket includes admission and a platter of prime suya with signature spices.',
      lat: 6.4474, lng: 3.4723,
      venue_name: 'The Greenhouse Warehouse',
      venue_address: 'Admiralty Way, Lekki Phase 1, Lagos',
      start_time: thisWeekend, end_time: thisWeekendEnd,
      category: 'popup', capacity: 120, tickets_remaining: 14, price: 18.00,
      resale_allowed: 1, resale_price_cap: 1.10, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
      vibe_tags: JSON.stringify(['Alté', 'Suya', 'Lekki Phase 1', 'Secret Pop-up', 'Drill']),
    },
    {
      id: 'evt_fela_shrine_experience',
      organizer_id: 'usr_system',
      title: 'Afrika Shrine Live: Afrobeat Heritage & Brass Session',
      description: 'Legendary live Afrobeat celebration with massive horn sections, hypnotic brass rhythms, and conscious music in the heart of Ikeja.',
      lat: 6.5956, lng: 3.3558,
      venue_name: 'New Afrika Shrine',
      venue_address: 'NERDC Rd, Agidingbi, Ikeja, Lagos',
      start_time: thisWeekend, end_time: thisWeekendEnd,
      category: 'gig', capacity: 800, tickets_remaining: 65, price: 12.00,
      resale_allowed: 1, resale_price_cap: 1.10, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
      vibe_tags: JSON.stringify(['Afrobeat', 'Afrika Shrine', 'Ikeja', 'Live Band', 'Brass']),
    },
    {
      id: 'evt_abuja_play_lounge',
      organizer_id: 'usr_system',
      title: 'Capital Pulse: Wuse 2 Rooftop Afro-Fusion',
      description: 'Exclusive skyline view in the heart of Abuja. Melodic Afrobeats, Amapiano, fine wines, and luxury lounge atmosphere.',
      lat: 9.0765, lng: 7.4721,
      venue_name: 'Play Imperial Lounge',
      venue_address: '167 Aminu Kano Crescent, Wuse 2, Abuja',
      start_time: tomorrow, end_time: tomorrowEnd,
      category: 'club', capacity: 250, tickets_remaining: 28, price: 25.00,
      resale_allowed: 1, resale_price_cap: 1.20, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800',
      vibe_tags: JSON.stringify(['Abuja Nightlife', 'Wuse 2', 'Rooftop', 'Afro Fusion', 'Luxury']),
    },

    // Global / NYC Events
    {
      id: 'evt_boiler_room_bushwick',
      organizer_id: 'usr_system',
      title: 'Subterranean: Industrial Techno & Modular Live',
      description: 'Raw analog synthesis, 4-point Funktion-One sound, secret warehouse location in Bushwick. Unreleased dubplates and live visual mapping.',
      lat: 40.7061, lng: -73.9248,
      venue_name: 'The Foundry Warehouse',
      venue_address: '28 Meadow St, Brooklyn, NY 11206',
      start_time: tonight, end_time: tonightEnd,
      category: 'club', capacity: 350, tickets_remaining: 18, price: 25.00,
      resale_allowed: 1, resale_price_cap: 1.20, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
      vibe_tags: JSON.stringify(['Techno', 'Funktion-One', 'Secret Venue', 'Late Night', 'Visuals']),
    },
    {
      id: 'evt_rooftop_sunset_sessions',
      organizer_id: 'usr_system',
      title: 'Neon Horizon: Sunset House & Disco',
      description: 'Open-air panoramic Manhattan skyline view, craft spritzes, melodic deep house, and cosmic disco. 21+ only.',
      lat: 40.7193, lng: -73.9613,
      venue_name: 'Skyline Overlook Roof',
      venue_address: '74 Wythe Ave, Brooklyn, NY 11249',
      start_time: tomorrow, end_time: tomorrowEnd,
      category: 'rooftop', capacity: 200, tickets_remaining: 42, price: 30.00,
      resale_allowed: 1, resale_price_cap: 1.15, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
      vibe_tags: JSON.stringify(['Sunset', 'Deep House', 'Rooftop', 'Cocktails', 'Disco']),
    },
    {
      id: 'evt_les_indie_psych',
      organizer_id: 'usr_system',
      title: 'Velvet Echoes: Psychedelic Post-Punk Live',
      description: 'Intimate basement show featuring three underground breakout post-punk bands. Limited capacity, vinyl DJs between sets.',
      lat: 40.7188, lng: -73.9877,
      venue_name: 'Cellar 142',
      venue_address: '142 Orchard St, New York, NY 10002',
      start_time: tonight, end_time: tonightEnd,
      category: 'gig', capacity: 90, tickets_remaining: 6, price: 18.00,
      resale_allowed: 1, resale_price_cap: 1.10, status: 'published',
      image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
      vibe_tags: JSON.stringify(['Post-Punk', 'Live Gig', 'Basement', 'Indie', 'Vinyl']),
    },
  ];

  for (const evt of events) {
    insertEvent.run(
      evt.id, evt.organizer_id, evt.title, evt.description, evt.lat, evt.lng,
      evt.venue_name, evt.venue_address, evt.start_time, evt.end_time,
      evt.category, evt.capacity, evt.tickets_remaining, evt.price,
      evt.resale_allowed, evt.resale_price_cap, evt.status, evt.image_url, evt.vibe_tags
    );
  }
}

export const db = initDatabase();
