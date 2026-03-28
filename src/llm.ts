import WebSocket from 'ws';


export function connectToElevenLabs(agentId: string, apiKey: string): WebSocket {
    const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;

    const ws = new WebSocket(url, {
        headers: {
            'xi-api-key': apiKey
        }
    });

    ws.on('open', () => {
        console.log('✅ Connected to ElevenLabs');

        // Initialize the conversation
        ws.send(JSON.stringify({
            type: 'conversation_initiation_client_data'
        }));
    });

    ws.on('error', (error) => {
        console.error('❌ ElevenLabs WebSocket error:', error);
    });

    return ws;
}

// ─────────────────────────────────────────────
// Ollama Local LLM Integration
// ─────────────────────────────────────────────

export interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Send a conversation history to a local Ollama model and get a text reply.
 *
 * @param messages - Full conversation history (system + user + assistant turns)
 * @param model    - Ollama model name (defaults to OLLAMA_MODEL env var or qwen2.5:7b)
 * @returns The assistant's reply string
 */
export async function chatWithOllama(
    messages: OllamaMessage[],
    model: string = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b'
): Promise<string> {
    const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';

    const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages,
            stream: false, // wait for full response
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { message: { content: string } };
    return data.message.content.trim();
}