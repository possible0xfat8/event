-- EVNT Database Schema: Verified Ticketing & Geospatial Discovery

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT,
    role TEXT NOT NULL DEFAULT 'attendee', -- attendee | organizer | staff
    notification_preferences TEXT DEFAULT '{"push": true, "email": true}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friends (
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    organizer_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    venue_name TEXT NOT NULL,
    venue_address TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    category TEXT NOT NULL, -- club | gig | popup | art | rooftop | comedy
    capacity INTEGER NOT NULL,
    tickets_remaining INTEGER NOT NULL,
    price REAL NOT NULL,
    resale_allowed INTEGER NOT NULL DEFAULT 1, -- 1 = true, 0 = false
    resale_price_cap REAL NOT NULL DEFAULT 1.20, -- multiplier, e.g. 1.2 = max 120% face value
    status TEXT NOT NULL DEFAULT 'published', -- draft | published | cancelled | ended
    image_url TEXT,
    vibe_tags TEXT DEFAULT '[]', -- JSON array of tags
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_events_geo ON events(lat, lng);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    buyer_user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    payment_intent_id TEXT UNIQUE NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed', -- pending | confirmed | failed | refunded
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buyer_user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'valid', -- valid | used | revoked | refunded
    signed_token TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME,
    used_by_device_id TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (owner_user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS going (
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private', -- private | friends_only | public
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_going_event ON going(event_id);

CREATE TABLE IF NOT EXISTS resale_transfers (
    id TEXT PRIMARY KEY,
    original_ticket_id TEXT NOT NULL,
    new_ticket_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed', -- completed | cancelled
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting', -- waiting | offered | claimed | expired
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS offline_scans_log (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    scanner_device_id TEXT NOT NULL,
    scanned_at DATETIME NOT NULL,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT NOT NULL DEFAULT 'synced', -- synced | duplicate_flagged
    is_flagged_duplicate INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_offline_scans_ticket ON offline_scans_log(ticket_id);

CREATE TABLE IF NOT EXISTS post_event_reviews (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    photo_url TEXT,
    reaction TEXT NOT NULL, -- fire | love | hype | meh
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL, -- ticket_issued | resale_sold | gate_opened | friend_going | waitlist_alert
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
