import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { cryptoService } from './cryptoService.js';
import { notificationsService } from './notificationsService.js';

export interface ResaleRequest {
  ticketId: string;
  sellerId: string;
  buyerId: string;
  resalePrice: number;
}

export interface ResaleResult {
  success: boolean;
  transferId?: string;
  originalTicketId?: string;
  newTicketId?: string;
  newSignedToken?: string;
  error?: string;
}

class ResaleService {
  /**
   * Executes a secure P2P ticket resale transfer.
   * Revokes the original signed ticket token and mints a brand-new signed Ed25519 token
   * bound directly to the buyer's identity.
   */
  transferTicket(req: ResaleRequest): ResaleResult {
    const { ticketId, sellerId, buyerId, resalePrice } = req;

    if (!ticketId || !sellerId || !buyerId) {
      return { success: false, error: 'Missing required transfer parameters' };
    }

    if (sellerId === buyerId) {
      return { success: false, error: 'Cannot resell a ticket to yourself' };
    }

    // 1. Verify seller owns the ticket and it is currently 'valid'
    const ticket = db.prepare(`
      SELECT t.*, e.title as eventTitle, e.price as originalPrice, e.resale_allowed, e.resale_price_cap
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.id = ?
    `).get(ticketId) as any;

    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    if (ticket.owner_user_id !== sellerId) {
      return { success: false, error: 'Unauthorized: You do not own this ticket' };
    }

    if (ticket.status !== 'valid') {
      return { success: false, error: `Cannot resell ticket with status '${ticket.status}'. Only valid tickets can be resold.` };
    }

    // 2. Enforce Organizer Resale Rules (Allowed / Disallowed & Price Cap)
    if (!ticket.resale_allowed) {
      return { success: false, error: 'The event organizer has disabled peer-to-peer resale for this event' };
    }

    const maxAllowedPrice = Number((ticket.originalPrice * ticket.resale_price_cap).toFixed(2));
    if (resalePrice > maxAllowedPrice) {
      return {
        success: false,
        error: `Price exceeds organizer anti-scalping cap. Max allowable price is $${maxAllowedPrice.toFixed(2)} (Cap: ${(ticket.resale_price_cap * 100).toFixed(0)}% of face value $${ticket.originalPrice.toFixed(2)})`,
      };
    }

    const newTicketId = `tkt_${uuidv4()}`;
    const transferId = `rst_${uuidv4()}`;

    // 3. Generate New Asymmetric Ed25519 Token bound to buyer
    const newSignedToken = cryptoService.signTicket(newTicketId, ticket.event_id, buyerId);

    // 4. Atomic Database Transfer Transaction
    const transferTx = db.transaction(() => {
      // A. Revoke original ticket permanently
      db.prepare(`
        UPDATE tickets
        SET status = 'revoked'
        WHERE id = ? AND status = 'valid'
      `).run(ticketId);

      // B. Create brand new ticket for buyer
      db.prepare(`
        INSERT INTO tickets (id, event_id, owner_user_id, order_id, status, signed_token)
        VALUES (?, ?, ?, ?, 'valid', ?)
      `).run(newTicketId, ticket.event_id, buyerId, ticket.order_id, newSignedToken);

      // C. Record audit trail in resale_transfers
      db.prepare(`
        INSERT INTO resale_transfers (id, original_ticket_id, new_ticket_id, seller_id, buyer_id, price, status)
        VALUES (?, ?, ?, ?, ?, ?, 'completed')
      `).run(transferId, ticketId, newTicketId, sellerId, buyerId, resalePrice);
    });

    try {
      transferTx();

      // 5. Send asynchronous notifications to both parties
      const buyer = db.prepare(`SELECT name FROM users WHERE id = ?`).get(buyerId) as any;
      const seller = db.prepare(`SELECT name FROM users WHERE id = ?`).get(sellerId) as any;

      notificationsService.notify(
        sellerId,
        'resale_sold',
        `Ticket Resold: ${ticket.eventTitle}`,
        `Your ticket for ${ticket.eventTitle} was successfully transferred to ${buyer?.name || 'the buyer'} for $${resalePrice.toFixed(2)}.`
      );

      notificationsService.notify(
        buyerId,
        'resale_purchased',
        `New Ticket Received: ${ticket.eventTitle}`,
        `You received a verified cryptographically signed ticket from ${seller?.name || 'the seller'}! Check your wallet.`
      );

      return {
        success: true,
        transferId,
        originalTicketId: ticketId,
        newTicketId,
        newSignedToken,
      };
    } catch (err: any) {
      return { success: false, error: `Transfer failed: ${err.message}` };
    }
  }

  /**
   * Retrieves resale history for analytics
   */
  getResaleHistory(eventId?: string) {
    const query = eventId
      ? `SELECT rt.*, u1.name as sellerName, u2.name as buyerName, e.title as eventTitle
         FROM resale_transfers rt
         JOIN users u1 ON rt.seller_id = u1.id
         JOIN users u2 ON rt.buyer_id = u2.id
         JOIN tickets t ON rt.new_ticket_id = t.id
         JOIN events e ON t.event_id = e.id
         WHERE e.id = ?
         ORDER BY rt.created_at DESC`
      : `SELECT rt.*, u1.name as sellerName, u2.name as buyerName, e.title as eventTitle
         FROM resale_transfers rt
         JOIN users u1 ON rt.seller_id = u1.id
         JOIN users u2 ON rt.buyer_id = u2.id
         JOIN tickets t ON rt.new_ticket_id = t.id
         JOIN events e ON t.event_id = e.id
         ORDER BY rt.created_at DESC`;

    return eventId ? db.prepare(query).all(eventId) : db.prepare(query).all();
  }
}

export const resaleService = new ResaleService();
