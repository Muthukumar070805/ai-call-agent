import { Request, Response, Router } from 'express';
import twilio from 'twilio';
import { chatWithOllama, OllamaMessage } from './llm';
import { hasPendingAddressRequest, handleAddressReply } from './addressSms';

// ─────────────────────────────────────────────
// Session store  (in-memory, per phone number)
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a helpful AI assistant.
Keep your responses brief (2-3 sentences max) because they are delivered as text messages.
Be friendly, direct, and professional.`;


interface SmsSession {
    messages: OllamaMessage[];
    lastActive: Date;
}

const sessions = new Map<string, SmsSession>();

export function getSession(phoneNumber: string): SmsSession {
    if (!sessions.has(phoneNumber)) {
        sessions.set(phoneNumber, {
            messages: [{ role: 'system', content: SYSTEM_PROMPT }],
            lastActive: new Date(),
        });
    }
    const session = sessions.get(phoneNumber)!;
    session.lastActive = new Date();
    return session;
}

// Clean up sessions older than 1 hour
setInterval(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [key, session] of sessions.entries()) {
        if (session.lastActive < oneHourAgo) {
            sessions.delete(key);
            console.log(`🗑️ SMS session expired for ${key}`);
        }
    }
}, 10 * 60 * 1000); // check every 10 minutes


// ─────────────────────────────────────────────
// Inbound SMS Handler
// POST /sms-inbound  (Twilio webhook)
// ─────────────────────────────────────────────

async function handleInboundSms(req: Request, res: Response) {
    const from: string = req.body?.From ?? 'Unknown';
    const body: string = req.body?.Body ?? '';

    console.log(`📩 Inbound SMS from ${from}: "${body}"`);

    const twiml = new twilio.twiml.MessagingResponse();

    if (!body.trim()) {
        twiml.message('Hi! Send me a message and I\'ll do my best to help.');
        res.type('text/xml').send(twiml.toString());
        return;
    }

    // ── Address reply interception ──────────────
    // If this number has a pending address request, treat the reply
    // as an address — do NOT forward it to the LLM chat session.
    if (hasPendingAddressRequest(from)) {
        const ack = handleAddressReply(from, body.trim());
        twiml.message(ack);
        res.type('text/xml').send(twiml.toString());
        return;
    }

    const session = getSession(from);

    // Append the user's message to history
    session.messages.push({ role: 'user', content: body.trim() });

    try {
        const reply = await chatWithOllama(session.messages);
        console.log(`🤖 Agent reply to ${from}: "${reply}"`);

        // Append the assistant's reply to history
        session.messages.push({ role: 'assistant', content: reply });

        twiml.message(reply);
    } catch (err) {
        console.error('❌ Ollama error during SMS reply:', err);
        twiml.message('Sorry, I\'m having trouble right now. Please try again in a moment.');
    }

    res.type('text/xml').send(twiml.toString());
}


// ─────────────────────────────────────────────
// Outbound SMS  (agent initiates)
// ─────────────────────────────────────────────

/**
 * Send an outbound SMS from the AI agent to a user.
 * Records the message in the user's session so the conversation stays coherent.
 *
 * @param to      - Destination phone number (E.164 format, e.g. +917550205578)
 * @param message - The message the agent wants to send
 */
export async function sendOutboundSms(to: string, message: string): Promise<void> {
    const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );

    const from = process.env.TWILIO_PHONE_NUMBER!;

    // Record the outbound message in session so the next inbound reply has context
    const session = getSession(to);
    session.messages.push({ role: 'assistant', content: message });

    const result = await twilioClient.messages.create({ to, from, body: message });
    console.log(`📤 Outbound SMS sent to ${to}: "${message}" (SID: ${result.sid})`);
}


// ─────────────────────────────────────────────
// Express Router
// ─────────────────────────────────────────────

const smsRouter = Router();

// Twilio hits this when the user texts the Twilio number
smsRouter.post('/sms-inbound', handleInboundSms);

// Convenience endpoint to trigger an outbound SMS (for testing)
// GET /sms-outbound?to=+917550205578&message=Hello+from+AI
smsRouter.get('/sms-outbound', async (req: Request, res: Response) => {
    const to = (req.query.to as string) || process.env.MY_PHONE_NUMBER!;
    const message = (req.query.message as string) || 'வணக்கம்! இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?';

    try {
        await sendOutboundSms(to, message);
        res.json({ success: true, to, message });
    } catch (err: any) {
        console.error('❌ Outbound SMS error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default smsRouter;
