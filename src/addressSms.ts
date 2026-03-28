import { Request, Response, Router } from 'express';
import twilio from 'twilio';

// ─────────────────────────────────────────────
// Pending address requests  (per phone number)
// ─────────────────────────────────────────────

interface PendingRequest {
    requestedAt: Date;
}

interface StoredAddress {
    address: string;
    receivedAt: Date;
}

/** Numbers that have been asked for their address but haven't replied yet. */
const pendingAddressRequests = new Map<string, PendingRequest>();

/** Latest address collected per phone number. */
const addressStore = new Map<string, StoredAddress>();

// Clean up stale pending requests older than 1 hour
setInterval(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [phone, pending] of pendingAddressRequests.entries()) {
        if (pending.requestedAt < oneHourAgo) {
            pendingAddressRequests.delete(phone);
            console.log(`🗑️ Stale address request expired for ${phone}`);
        }
    }
}, 10 * 60 * 1000); // check every 10 minutes


// ─────────────────────────────────────────────
// Core helpers (exported for use in sms.ts)
// ─────────────────────────────────────────────

/** Returns true if this phone number has a pending address request. */
export function hasPendingAddressRequest(phoneNumber: string): boolean {
    return pendingAddressRequests.has(phoneNumber);
}

/**
 * Handle an inbound SMS that is a reply to an address request.
 * Stores the address, clears the pending flag, and returns an
 * acknowledgement message to send back to the user.
 */
export function handleAddressReply(phoneNumber: string, body: string): string {
    addressStore.set(phoneNumber, {
        address: body,
        receivedAt: new Date(),
    });

    pendingAddressRequests.delete(phoneNumber);

    console.log(`📍 Address received from ${phoneNumber}: "${body}"`);

    return 'Thank you! Your address has been saved for location tracking.';
}

/** Retrieve the stored address for a phone number (if any). */
export function getStoredAddress(phoneNumber: string): StoredAddress | undefined {
    return addressStore.get(phoneNumber);
}


// ─────────────────────────────────────────────
// Send the address-request SMS
// ─────────────────────────────────────────────

/**
 * Send an outbound SMS asking the user to reply with their address.
 * Sets the pending flag so the next inbound SMS from this number
 * is treated as an address reply (not an LLM chat message).
 */
export async function requestAddress(to: string): Promise<void> {
    const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );

    const from = process.env.TWILIO_PHONE_NUMBER!;
    const message = 'Please reply with your address for location tracking.';

    // Mark this number as having a pending address request
    pendingAddressRequests.set(to, { requestedAt: new Date() });

    const result = await twilioClient.messages.create({ to, from, body: message });
    console.log(`📤 Address request sent to ${to} (SID: ${result.sid})`);
}


// ─────────────────────────────────────────────
// Express Router
// ─────────────────────────────────────────────

const addressSmsRouter = Router();

/** GET /request-address?to=+917550205578 — trigger an address-request SMS */
addressSmsRouter.get('/request-address', async (req: Request, res: Response) => {
    const to = (req.query.to as string) || process.env.MY_PHONE_NUMBER!;

    try {
        await requestAddress(to);
        res.json({ success: true, to, message: 'Address request sent' });
    } catch (err: any) {
        console.error('❌ Address request error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/** GET /stored-address?phone=+917550205578 — retrieve the stored address */
addressSmsRouter.get('/stored-address', (req: Request, res: Response) => {
    const phone = req.query.phone as string;

    if (!phone) {
        res.status(400).json({ success: false, error: 'Missing ?phone= parameter' });
        return;
    }

    const stored = getStoredAddress(phone);

    if (!stored) {
        res.json({ success: true, phone, address: null, message: 'No address stored for this number' });
        return;
    }

    res.json({ success: true, phone, address: stored.address, receivedAt: stored.receivedAt });
});

export default addressSmsRouter;
