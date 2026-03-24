# @koi-video/voice-realtime-sdk-beta

[中文文档](./README.zh-CN.md)

Browser SDK for real-time voice: **HTTP voice session** (`/start`, `/stop`) with **Robot-Key / Robot-Token** auth, plus **Agora RTC** (mic publish, remote audio, stream messages for transcription and control). **`agora-rtc-sdk-ng` is bundled** as a normal dependency.

---

## Overview

| Layer | Responsibility |
|--------|----------------|
| **REST** | Create/end voice session; returns `room_name`, `rtc_info` (Agora `app_id`, `token`, `user_id`). |
| **RTC** | Join channel, publish microphone, receive remote audio, receive **stream messages** (subtitles, interrupt, etc.). |
| **ChatClient** | Single entry class: `startVoiceChat` → Agora → `on` / events; `stopVoiceChat`, `interrupt`, `setAudioEnabled`. |

- **Session id**: `startVoiceChat` resolves to **`sessionId`**, which equals backend **`room_name`**. Use it for `stopVoiceChat`, `interrupt`, and `setAudioEnabled`.
- **Environment**: Microphone and RTC require a **secure context** (HTTPS or `localhost`).

---

## Installation

```bash
pnpm add @koi-video/voice-realtime-sdk-beta
```

`agora-rtc-sdk-ng` is a **direct dependency** of this package—**you do not install it separately**; your package manager will install it when you add `@koi-video/voice-realtime-sdk-beta` (path, npm registry, or private feed as you publish).

---

## Module exports

```js
import {
  ChatClient,
  VoiceEvents,
  DEFAULT_VOICE_API_BASE,
  RELATIVE_VOICE_API_BASE,
  generateDefaultUserName
} from '@koi-video/voice-realtime-sdk-beta';
```

| Export | Description |
|--------|-------------|
| `ChatClient` | Main client class. |
| `VoiceEvents` | String constants for event names (see [Events](#events)). |
| `DEFAULT_VOICE_API_BASE` | Default REST base URL (direct to gateway). |
| `RELATIVE_VOICE_API_BASE` | Same-origin path for dev proxy, e.g. `/openapi/v1/realtime/voice`. |
| `generateDefaultUserName` | Returns `user_${Date.now()}_${random}` when `userName` is omitted. |

---

## REST API (used internally)

Requests use **`fetch`**, JSON body, headers:

- `Robot-Key`, `Robot-Token` (values from your backend / console)
- `Content-Type`: `application/json`

| Method | Path (relative to `apiBase`) | Purpose |
|--------|------------------------------|--------|
| `POST` | `{apiBase}/start` | Start session; body uses snake_case fields below. |
| `POST` | `{apiBase}/stop` | Stop session; `user_name`, `room_name`. |

`apiBase` is normalized (trailing slashes stripped). Default is `DEFAULT_VOICE_API_BASE`.  
**Do not** append an extra `/voice` segment before `/start` / `/stop` if `apiBase` already ends with the voice module path.

Typical successful start response includes `data.room_name`, `data.user_name`, `data.rtc_info` (`vendor`, `user_id`, `params.app_id`, `params.token`).

---

## ChatClient

### Constructor

```ts
new ChatClient(auth, options?)
```

**`auth`** (one of):

- `robot-key` / `robot-token`, or
- `robotKey` / `robotToken`

**`options`**

| Field | Type | Description |
|-------|------|-------------|
| `apiBase` | `string` | Optional. Defaults to `DEFAULT_VOICE_API_BASE`. Use `RELATIVE_VOICE_API_BASE` when the app is served behind a reverse proxy to the same gateway. |

### Methods

| Method | Description |
|--------|-------------|
| `on(eventName, handler)` | Subscribe to an event. |
| `off(eventName, handler)` | Unsubscribe. |
| `startVoiceChat(options?)` | `POST .../start`, then join Agora and publish mic. Resolves to **`sessionId`** (`room_name`). |
| `stopVoiceChat({ sessionId })` | Leaves channel, calls `POST .../stop`. Emits `SESSION_ENDED`. May throw if stop API fails after RTC teardown. |
| `interrupt({ sessionId })` | Sends interrupt command over Agora stream message. |
| `setAudioEnabled({ sessionId, bool })` | Mute/unmute local track via volume (`bool === false` → mute). |

### `startVoiceChat(options?)`

| Field | Type | Description |
|-------|------|-------------|
| `userName` | `string` | Optional; default from `generateDefaultUserName()`. |
| `welcome` | `string` | Optional welcome prompt. |
| `maxDuration` | `number` | Max call length (seconds), maps to `max_duration`. |
| `clientType` | `string` | Default `"websdk"`. |
| `expectedEngineId` | `string` | Maps to `expected_engine_id`. |
| `segmentCode` | `string` | Maps to `segment_code`. |

---

## Events

Subscribe with `client.on(VoiceEvents.XXX, handler)` or `client.on('ALL', ...)`.

### `VoiceEvents` constants

| Constant | Value | When emitted |
|----------|--------|----------------|
| `SESSION_CREATED` | `SESSION_CREATED` | After HTTP start succeeds and Agora is up; payload: `{ sessionId }`. |
| `SESSION_ENDED` | `SESSION_ENDED` | User `stopVoiceChat`, abnormal RTC disconnect, or stop flow after `SESSION_ENDED` emit. Payload: `{ sessionId, reason }`. |
| `USER_MESSAGE` | `USER_MESSAGE` | Stream `topic === 'chat'`, user side. Payload: `{ sessionId, content, segmentId?, timestamp? }`. |
| `ROBOT_MESSAGE` | `ROBOT_MESSAGE` | Stream `topic === 'chat'`, assistant (`role === 'llm'`). Same payload shape. |
| `INTERRUPT` | `INTERRUPT` | Stream `topic === 'interrupt'`. Payload: `{ sessionId }`. |
| `ERROR` | `ERROR` | API/RTC/parse errors. Payload shape varies (`code`, `message`, `sessionId?`, …). |
| `ALL` | `ALL` | Every emitted event: **`handler(eventName, data)`**. |

Reserved names (no stream binding in current protocol): `AUDIO_START`, `AUDIO_END` — listed in `VoiceEvents` for alignment with product docs; **do not rely on them firing**.

### `ALL` and extra topics

Listeners on `ALL` also receive:

| `eventName` (first arg) | Meaning |
|-------------------------|--------|
| `FLOW_DEBUG` | `topic === 'flow_debug'` — `{ sessionId, text }`. |
| `SIDE_INFO` | `topic === 'side_info'` — `{ sessionId, payload }`. |
| `STREAM_MESSAGE` | Any other stream JSON. |

### Typical `ERROR` `code` values

| Code | Meaning |
|------|--------|
| `HTTP_*` | Non-2xx start response. |
| `NETWORK` | Fetch failure on start. |
| `RTC_ERROR` | Agora join/publish failed. |
| `STREAM_PARSE` | Invalid stream payload. |
| `CHAT_ERROR` | Chat message with `errMsg`. |
| `RTC_STOP` | Error while stopping tracks/client. |
| `STOP_API` | Stop HTTP failed (session may still be torn down locally). |

---

## Code examples

### Minimal flow

```js
import { ChatClient, VoiceEvents } from '@koi-video/voice-realtime-sdk-beta';

// Auth: Robot-Key / Robot-Token (example uses env vars; inject as needed)
const client = new ChatClient({
  robotKey: process.env.ROBOT_KEY,
  robotToken: process.env.ROBOT_TOKEN
});

// Errors: HTTP, RTC, stream parse, etc.
client.on(VoiceEvents.ERROR, err => {
  console.error(err.code, err.message);
});

// Assistant captions; segmentId merges streaming chunks into one bubble
client.on(VoiceEvents.ROBOT_MESSAGE, ({ sessionId, content, segmentId }) => {
  console.log('bot:', content, segmentId);
});

// User ASR text
client.on(VoiceEvents.USER_MESSAGE, ({ content, segmentId }) => {
  console.log('user:', content, segmentId);
});

// Start session, join Agora, publish mic; returned sessionId equals backend room_name
const sessionId = await client.startVoiceChat({
  expectedEngineId: 'your-agent-id'
});

// Interrupt → mute → unmute → leave channel and call stop API
client.interrupt({ sessionId });
await client.setAudioEnabled({ sessionId, bool: false });
await client.setAudioEnabled({ sessionId, bool: true });
await client.stopVoiceChat({ sessionId });
```

### Catch-all listener

```js
client.on(VoiceEvents.ALL, (eventName, data) => {
  console.log(eventName, data);
});
```

### Dev proxy (`vite` / similar)

Point `apiBase` at the proxied path so the browser stays same-origin:

```js
import {
  ChatClient,
  RELATIVE_VOICE_API_BASE
} from '@koi-video/voice-realtime-sdk-beta';

const client = new ChatClient(
  { robotKey: '...', robotToken: '...' },
  import.meta.env.DEV ? { apiBase: RELATIVE_VOICE_API_BASE } : {}
);
```

Configure the dev server to proxy `/openapi` (or your chosen prefix) to the real gateway.

---

## Demo (this repo)

```bash
cd packages/voice-realtime-sdk
pnpm install
pnpm demo
```

See `demo/` for a full HTML + Vite sample (HTTPS optional via `@vitejs/plugin-basic-ssl` in `demo/vite.config.js`).

---

## License

UNLICENSED (internal / as published by your team).
