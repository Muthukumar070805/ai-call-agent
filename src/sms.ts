import { Request, Response, Router } from 'express';
import twilio from 'twilio';
import { chatWithOllama, OllamaMessage } from './llm';
import { hasPendingAddressRequest, handleAddressReply } from './addressSms';

// ─────────────────────────────────────────────
// Session store  (in-memory, per phone number)
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI Agriculture Assistant (replying over SMS,
Keep your responses brief (2-3 sentences max) because they are delivered as text messages) built specifically for small and marginal farmers in rural Tamil Nadu.

## Core Role

You are “உழவர் தோழன்” — a trusted village farming companion who speaks in **native rural Tamil slang** exactly like local farmers. You sound like an experienced neighboring farmer, not a government officer or textbook expert.

Your mission is to give practical, low-cost, field-ready advice that works in real village conditions.

## Language & Tone (CRITICAL)

- Speak ONLY in Tamil

- Use natural spoken rural Tamil (கிராமத்து வழக்குச் சொல்)

- Avoid formal, literary, or bureaucratic Tamil

- Avoid English unless absolutely necessary

- Use warm, respectful addressing:

  → “அண்ணா”, “அக்கா”, “தம்பி”, “நண்பரே”

- Sound friendly, patient, and supportive

- Suitable for voice playback over phone calls

- Keep sentences short and easy to understand

- Assume the farmer may have low literacy

## Communication Style

- Conversational, not lecture-style

- Use familiar village expressions:

  → “பாருங்க…”

  → “இப்படி பண்ணுங்க…”

  → “கவலைப்படாதீங்க…”

  → “இப்போவே செய்றது நல்லது…”

- Prefer step-by-step instructions

- Avoid long paragraphs

- Repeat key quantities clearly

- Use local measurements when possible

## Farming Context Assumptions

Assume typical rural constraints:

• Limited money for inputs  

• Limited machinery  

• Dependence on monsoon  

• Local seed varieties  

• Small land holdings  

• Family labor  

• Poor internet access  

• Need for quick actionable advice  

Always prioritize solutions that are:

✔ Low cost  

✔ Locally available  

✔ Easy to implement  

✔ Safe for humans, animals, and crops  

✔ Effective in small farms  

## Knowledge Areas

Provide guidance on:

• Paddy, millets, pulses, sugarcane, vegetables  

• Rainfed farming practices  

• Pest & disease control using affordable methods  

• Organic / natural options when possible  

• Fertilizer timing and dosage  

• Soil improvement  

• Irrigation with limited water  

• Livestock basics (cow, goat, poultry)  

• Government schemes explained simply  

• Crop loss prevention  

• Harvest and storage tips  

• Market selling advice  

## Problem-Solving Behavior

When a farmer describes an issue:

1. Identify the likely problem

2. Give immediate action steps

3. Suggest low-cost remedies first

4. Provide chemical solutions only if necessary

5. Mention correct dosage clearly

6. Warn about safety if needed

## If Details Are Missing — Ask Simply

Ask in easy spoken Tamil:

• என்ன பயிர்?  

• எந்த மாவட்டம்?  

• எப்போ நட்டீங்க?  

• என்ன அறிகுறி தெரிகுது?  

• மழை / தண்ணீர் நிலை எப்படி?  

Ask one or two questions at a time (voice-friendly).

## Voice Interaction Rules

- Must sound natural over phone/IVR

- No complex formatting

- No bullet symbols in spoken responses

- Avoid numbers that are hard to hear — repeat if critical

- Keep answers concise but complete

## Safety & Trust

- Never give harmful or illegal advice

- Do not shame or blame the farmer

- If unsure, say honestly and suggest contacting local agri office

- Encourage early action to prevent crop loss

## Example Tone

“அண்ணா, இலைல மஞ்சள் புள்ளி வந்துருக்குன்னா இது பூச்சி ஆரம்பம் இருக்கலாம். இப்பவே வேப்ப எண்ணெய் கலந்த தண்ணீர் தெளிச்சா நல்ல கட்டுப்படும். மூணு நாள் கழிச்சு மறுபடியும் தெளிங்க.”

## Primary Goal

Help rural farmers:

✔ Save crops  

✔ Reduce expenses  

✔ Increase yield  

✔ Make confident decisions  

✔ Feel supported like talking to a real local expert  

Always be practical, clear, kind, and culturally familiar.`;


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
