# AI Call Agent

A sophisticated AI voice and text agent built with Twilio, ElevenLabs, and Ollama. This agent handles live voice calls, SMS conversations, and features an advanced network fallback mechanism.

## Features

- **Live Voice AI**: Real-time conversation using ElevenLabs Conversational AI and Twilio Media Streams.
- **SMS Agent**: Context-aware SMS chat powered by local Ollama models (default: `qwen2.5:7b`).
- **Address Collection**: Specialized SMS flow to collect and store user addresses for location-based services.
- **Network Fallback**: A resilient fallback system where the frontend can trigger an outbound SMS or Voice Call to continue a conversation if the user's data network fails.

## Project Structure

- `src/index.ts`: Main Express server and WebSocket handler for Twilio Media Streams.
- `src/llm.ts`: Integration with ElevenLabs (WebSocket) and Ollama (Fetch).
- `src/sms.ts`: SMS conversation logic and outbound messaging.
- `src/addressSms.ts`: Address collection state machine and storage.
- `src/networkFallback.ts`: Logic for resuming sessions via voice/SMS after a network failure.

## Getting Started

### Prerequisites

- Node.js & npm
- [Ollama](https://ollama.com/) running locally
- [Ngrok](https://ngrok.com/) for exposing your local server to Twilio
- Twilio Account SID, Auth Token, and Phone Number
- ElevenLabs API Key and Agent ID

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env`:
   ```env
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_PHONE_NUMBER=your_twilio_number
   MY_PHONE_NUMBER=your_personal_number
   ELEVENLABS_AGENT_ID=your_agent_id
   ELEVENLABS_API_KEY=your_api_key
   NGROK_URL=your_ngrok_url
   OLLAMA_MODEL=qwen2.5:7b
   ```

3. Run the server:
   ```bash
   npm run dev
   ```

### Webhook Configuration

- **Voice**: In Twilio Console, set "A call comes in" to `POST <NGROK_URL>/incoming-call`.
- **SMS**: In Twilio Console, set "A message comes in" to `POST <NGROK_URL>/sms-inbound`.

## Testing Features

Use the provided testing script:
```bash
chmod +x test-features.sh
./test-features.sh
```

## API Reference

- `GET /make-call`: Triggers an outbound voice call to your personal number.
- `GET /sms-outbound?to=<phone>&message=<text>`: Sends an outbound SMS.
- `GET /request-address?to=<phone>`: Initiates the address collection flow.
- `POST /network-fallback`: Frontend-triggered fallback to SMS or Voice.
