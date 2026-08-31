import crypto from 'node:crypto';

export interface TicketPayload {
  ticketId: string;
  eventId: string;
  ownerUserId: string;
  issuedAt: number; // Unix epoch seconds
  expiresAt: number; // Unix epoch seconds
  nonce: string;
}

export interface VerificationResult {
  valid: boolean;
  payload?: TicketPayload;
  error?: string;
}

class CryptoService {
  private privateKey: crypto.KeyObject;
  private publicKey: crypto.KeyObject;
  private publicKeyPem: string;
  private publicKeyRawBase64: string;

  constructor() {
    // Generate an asymmetric Ed25519 KeyPair for ticket minting and signature verification
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    this.privateKey = privateKey;
    this.publicKey = publicKey;

    this.publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const exportedDer = publicKey.export({ type: 'spki', format: 'der' });
    this.publicKeyRawBase64 = Buffer.from(exportedDer).toString('base64');
  }

  /**
   * Returns the SPKI PEM and raw Base64 representation of the public key for client/offline scanners
   */
  getPublicKeyInfo() {
    return {
      pem: this.publicKeyPem,
      rawBase64: this.publicKeyRawBase64,
      algorithm: 'Ed25519'
    };
  }

  /**
   * Signs a ticket payload with the server's private Ed25519 key
   * Returns token formatted as `<base64url(payload)>.<base64url(signature)>`
   */
  signTicket(ticketId: string, eventId: string, ownerUserId: string, validitySeconds = 86400 * 7): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: TicketPayload = {
      ticketId,
      eventId,
      ownerUserId,
      issuedAt: now,
      expiresAt: now + validitySeconds,
      nonce: crypto.randomBytes(12).toString('hex')
    };

    const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
    const signatureBuffer = crypto.sign(null, payloadBuffer, this.privateKey);

    const base64UrlPayload = payloadBuffer.toString('base64url');
    const base64UrlSignature = signatureBuffer.toString('base64url');

    return `${base64UrlPayload}.${base64UrlSignature}`;
  }

  /**
   * Verifies a signed ticket token using the Ed25519 public key.
   * Can be executed with an optional custom public key (for offline scanner testing)
   */
  verifyTicketToken(token: string, customPublicKeyPem?: string): VerificationResult {
    try {
      if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Empty or invalid token format' };
      }

      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, error: 'Malformed token structure (must be payload.signature)' };
      }

      const [encodedPayload, encodedSignature] = parts;
      const payloadBuffer = Buffer.from(encodedPayload, 'base64url');
      const signatureBuffer = Buffer.from(encodedSignature, 'base64url');

      const payload: TicketPayload = JSON.parse(payloadBuffer.toString('utf8'));

      // Check temporal validity
      const now = Math.floor(Date.now() / 1000);
      if (payload.expiresAt && payload.expiresAt < now) {
        return { valid: false, payload, error: 'Ticket token has expired' };
      }

      const keyToUse = customPublicKeyPem
        ? crypto.createPublicKey(customPublicKeyPem)
        : this.publicKey;

      const isSignatureValid = crypto.verify(null, payloadBuffer, keyToUse, signatureBuffer);

      if (!isSignatureValid) {
        return { valid: false, payload, error: 'Cryptographic signature verification failed (forged or tampered token)' };
      }

      return { valid: true, payload };
    } catch (err: any) {
      return { valid: false, error: `Verification error: ${err.message}` };
    }
  }
}

export const cryptoService = new CryptoService();
