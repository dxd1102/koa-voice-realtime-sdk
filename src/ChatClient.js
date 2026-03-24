import { DEFAULT_VOICE_API_BASE, VoiceEvents } from './constants';
import { generateDefaultUserName } from './userName';
import { createAgoraVoiceController } from './agoraController';

function normalizeApiBase(base) {
  return String(base).replace(/\/+$/, '');
}

function buildJsonBody(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

function safeCall(fn, ...args) {
  try {
    fn(...args);
  } catch (e) {
    console.error('[voice-realtime-sdk] handler error', e);
  }
}

export class ChatClient {
  /**
   * @param {Record<string, string>} auth
   * @param {string} [auth.robot-key]
   * @param {string} [auth.robot-token]
   * @param {string} [auth.robotKey]
   * @param {string} [auth.robotToken]
   * @param {object} [options]
   * @param {string} [options.apiBase] Voice API base URL; default `DEFAULT_VOICE_API_BASE`, or `RELATIVE_VOICE_API_BASE` with a dev proxy.
   */
  constructor(auth, options = {}) {
    const key = auth['robot-key'] ?? auth.robotKey;
    const token = auth['robot-token'] ?? auth.robotToken;
    if (!key || !token) {
      throw new Error(
        'ChatClient: robot-key / robot-token (or robotKey / robotToken) is required'
      );
    }
    this._robotKey = key;
    this._robotToken = token;
    this._apiBase = normalizeApiBase(options.apiBase ?? DEFAULT_VOICE_API_BASE);
    /** @type {Map<string, { userName: string, roomName: string, rtc: { stop: Function, toggleMic: Function, sendInterrupt: Function } }>} */
    this._sessions = new Map();
    /** @type {Map<string, Function[]>} */
    this._handlers = new Map();
  }

  /**
   * @param {string} eventName
   * @param {(data: any) => void} handler
   */
  on(eventName, handler) {
    if (!this._handlers.has(eventName)) {
      this._handlers.set(eventName, []);
    }
    this._handlers.get(eventName).push(handler);
  }

  /**
   * @param {string} eventName
   * @param {(data: any) => void} handler
   */
  off(eventName, handler) {
    const list = this._handlers.get(eventName);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i > -1) list.splice(i, 1);
  }

  /**
   * @param {string} eventName
   * @param {any} data
   */
  _emit(eventName, data) {
    (this._handlers.get(eventName) || []).forEach(fn => safeCall(fn, data));
    (this._handlers.get(VoiceEvents.ALL) || []).forEach(fn =>
      safeCall(fn, eventName, data)
    );
  }

  _emitError(payload) {
    this._emit(VoiceEvents.ERROR, payload);
  }

  /** Emit only to ALL listeners (e.g. extra stream topics). */
  _emitAllOnly(eventName, data) {
    (this._handlers.get(VoiceEvents.ALL) || []).forEach(fn =>
      safeCall(fn, eventName, data)
    );
  }

  async _fetchStop(userName, roomName) {
    const res = await fetch(`${this._apiBase}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Robot-Key': this._robotKey,
        'Robot-Token': this._robotToken
      },
      body: JSON.stringify(
        buildJsonBody({
          user_name: userName,
          room_name: roomName
        })
      )
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || res.statusText || `HTTP ${res.status}`);
    }
    if (json.code !== 0) {
      throw new Error(json.message || 'stop failed');
    }
    return json;
  }

  /**
   * @param {object} [options]
   * @param {string} [options.userName] Defaults to generated `user_${timestamp}_${random}` when omitted.
   * @param {string} [options.welcome]
   * @param {number} [options.maxDuration]
   * @param {string} [options.clientType] Default `websdk`.
   * @param {string} [options.expectedEngineId]
   * @param {string} [options.segmentCode]
   * @returns {Promise<string>} sessionId (same as `room_name` for stop/interrupt)
   */
  async startVoiceChat(options = {}) {
    const userName = options.userName ?? generateDefaultUserName();

    const body = buildJsonBody({
      user_name: userName,
      welcome: options.welcome,
      max_duration: options.maxDuration,
      client_type: options.clientType ?? 'websdk',
      expected_engine_id: options.expectedEngineId,
      segment_code: options.segmentCode
    });

    let json;
    try {
      const res = await fetch(`${this._apiBase}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Robot-Key': this._robotKey,
          'Robot-Token': this._robotToken
        },
        body: JSON.stringify(body)
      });
      json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = {
          code: `HTTP_${res.status}`,
          message: json?.message || res.statusText
        };
        this._emitError(err);
        throw Object.assign(new Error(err.message), {
          __voiceSdkHandled: true
        });
      }
    } catch (e) {
      if (!e.__voiceSdkHandled) {
        this._emitError({
          code: 'NETWORK',
          message: e?.message || String(e)
        });
      }
      throw e;
    }

    if (json.code !== 0) {
      const err = {
        code: String(json.code ?? 'UNKNOWN'),
        message: json.message || 'start failed'
      };
      this._emitError(err);
      throw new Error(err.message);
    }

    const sessionData = json.data;
    const sessionId = sessionData.room_name;

    let rtc;
    try {
      rtc = await createAgoraVoiceController(sessionData, {
        onStreamMessage: msg =>
          this._handleStreamMessage(sessionId, userName, msg),
        onConnectionState: (state, reason) => {
          if (state === 'DISCONNECTED') {
            this._onRtcDisconnected(sessionId, reason);
          }
        }
      });
    } catch (e) {
      try {
        await this._fetchStop(userName, sessionData.room_name);
      } catch (_) {
        /* best effort */
      }
      this._emitError({
        code: 'RTC_ERROR',
        message: e?.message || String(e),
        sessionId
      });
      throw e;
    }

    this._sessions.set(sessionId, {
      userName,
      roomName: sessionData.room_name,
      rtc
    });

    this._emit(VoiceEvents.SESSION_CREATED, { sessionId });
    return sessionId;
  }

  _onRtcDisconnected(sessionId, reason) {
    const rec = this._sessions.get(sessionId);
    if (!rec) return;
    this._sessions.delete(sessionId);
    this._emit(VoiceEvents.SESSION_ENDED, {
      sessionId,
      reason: reason || 'disconnected'
    });
    this._fetchStop(rec.userName, rec.roomName).catch(() => {});
  }

  /**
   * @param {string} sessionId
   * @param {string} userName
   * @param {object} message
   */
  _handleStreamMessage(sessionId, userName, message) {
    if (message.parseError) {
      this._emitError({
        code: 'STREAM_PARSE',
        message: message.error?.message || 'stream message parse error',
        sessionId,
        userName
      });
      return;
    }

    const isError = message.code !== 0 && !!message.errMsg;
    const content = isError ? message.errMsg : message.text;

    if (message.topic === 'chat') {
      const isBot = message.role === 'llm';
      const segmentId =
        message.id !== undefined && message.id !== null
          ? message.id
          : undefined;
      const timestamp =
        message.timestamp !== undefined ? message.timestamp : undefined;
      const payload = { sessionId, content, segmentId, timestamp };
      if (isBot) {
        this._emit(VoiceEvents.ROBOT_MESSAGE, payload);
      } else {
        this._emit(VoiceEvents.USER_MESSAGE, payload);
      }
      if (isError) {
        this._emitError({
          code: String(message.code ?? 'CHAT_ERROR'),
          message: message.errMsg || 'chat error',
          sessionId,
          userName
        });
      }
      return;
    }

    if (message.topic === 'interrupt') {
      this._emit(VoiceEvents.INTERRUPT, { sessionId });
      return;
    }

    if (message.topic === 'flow_debug') {
      this._emitAllOnly('FLOW_DEBUG', {
        sessionId,
        text: message.content || message.text
      });
      return;
    }

    if (message.topic === 'side_info') {
      this._emitAllOnly('SIDE_INFO', {
        sessionId,
        payload: message.payload || message
      });
      return;
    }

    this._emitAllOnly('STREAM_MESSAGE', { sessionId, message });
  }

  /**
   * @param {{ sessionId: string }} param
   */
  async stopVoiceChat({ sessionId }) {
    const rec = this._sessions.get(sessionId);
    if (!rec) {
      throw new Error(`ChatClient: unknown sessionId "${sessionId}"`);
    }
    this._sessions.delete(sessionId);
    try {
      await rec.rtc.stop();
    } catch (e) {
      this._emitError({
        code: 'RTC_STOP',
        message: e?.message || String(e),
        sessionId
      });
    }

    let stopApiError = null;
    try {
      await this._fetchStop(rec.userName, rec.roomName);
    } catch (e) {
      stopApiError = e;
      this._emitError({
        code: 'STOP_API',
        message: e?.message || String(e),
        sessionId
      });
    }

    this._emit(VoiceEvents.SESSION_ENDED, {
      sessionId,
      reason: stopApiError ? 'user_stop_api_failed' : 'user_stop'
    });

    if (stopApiError) {
      throw stopApiError;
    }
  }

  /**
   * @param {{ sessionId: string }} param
   */
  interrupt({ sessionId }) {
    const rec = this._sessions.get(sessionId);
    if (!rec) {
      throw new Error(`ChatClient: unknown sessionId "${sessionId}"`);
    }
    rec.rtc.sendInterrupt();
  }

  /**
   * @param {{ sessionId: string, bool: boolean }} param
   */
  async setAudioEnabled({ sessionId, bool }) {
    const rec = this._sessions.get(sessionId);
    if (!rec) {
      throw new Error(`ChatClient: unknown sessionId "${sessionId}"`);
    }
    rec.rtc.toggleMic(!!bool);
  }
}
