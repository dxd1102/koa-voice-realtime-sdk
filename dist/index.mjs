import f from "agora-rtc-sdk-ng";
const A = "https://saibotan-pre2.100credit.cn/openapi/v1/realtime/voice", D = "/openapi/v1/realtime/voice", u = {
  SESSION_CREATED: "SESSION_CREATED",
  SESSION_ENDED: "SESSION_ENDED",
  USER_MESSAGE: "USER_MESSAGE",
  ROBOT_MESSAGE: "ROBOT_MESSAGE",
  AUDIO_START: "AUDIO_START",
  AUDIO_END: "AUDIO_END",
  INTERRUPT: "INTERRUPT",
  ERROR: "ERROR",
  ALL: "ALL"
};
function R(_ = 8) {
  const t = "abcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let e = 0; e < _; e += 1)
    r += t[Math.floor(Math.random() * t.length)];
  return r;
}
function O() {
  return `user_${Date.now()}_${R()}`;
}
const w = 0, y = 100;
async function b(_, t = {}) {
  const {
    room_name: r,
    rtc_info: {
      params: { app_id: e, token: n },
      user_id: E
    }
  } = _, a = E;
  let i = null, o = null;
  const h = (l, d) => {
    var s, c;
    try {
      const m = new TextDecoder().decode(d), g = JSON.parse(m);
      (s = t.onStreamMessage) == null || s.call(t, g);
    } catch (m) {
      (c = t.onStreamMessage) == null || c.call(t, { parseError: !0, error: m });
    }
  };
  async function S(l, d) {
    var s, c;
    d === "audio" && (await i.subscribe(l, d), (c = (s = l.audioTrack) == null ? void 0 : s.play) == null || c.call(s));
  }
  return f.setLogLevel(0), i = f.createClient({ mode: "rtc", codec: "vp8" }), i.on("user-published", S), i.on("user-unpublished", () => {
  }), i.on("stream-message", h), i.on("connection-state-change", (l, d, s) => {
    var c;
    (c = t.onConnectionState) == null || c.call(t, l, s);
  }), await i.join(e, r, n, E), o = await f.createMicrophoneAudioTrack({
    AEC: !0,
    ANS: !0,
    AGC: !0,
    encoderConfig: "music_standard"
  }), await i.publish([o]), i.enableAudioVolumeIndicator(), i.on("volume-indicator", (l) => {
    l.forEach(({ uid: d, level: s }) => {
      var c, m;
      d === a || d === 0 ? (c = t.onLocalSpeaking) == null || c.call(t, s > 10) : (m = t.onRemoteSpeaking) == null || m.call(t, s > 10);
    });
  }), {
    async stop() {
      o && (o.stop(), o.close(), o = null), i && (await i.leave(), i = null);
    },
    toggleMic(l) {
      o && o.setVolume(
        l ? y : w
      );
    },
    sendInterrupt() {
      if (!i) return;
      const d = new TextEncoder().encode(
        JSON.stringify({
          event: "command",
          command: { action: "interrupt" }
        })
      );
      i.sendStreamMessage(d, !1);
    }
  };
}
function C(_) {
  return String(_).replace(/\/+$/, "");
}
function T(_) {
  const t = {};
  for (const [r, e] of Object.entries(_))
    e != null && (t[r] = e);
  return t;
}
function p(_, ...t) {
  try {
    _(...t);
  } catch (r) {
    console.error("[voice-realtime-sdk] handler error", r);
  }
}
class M {
  /**
   * @param {Record<string, string>} auth
   * @param {string} [auth.robot-key]
   * @param {string} [auth.robot-token]
   * @param {string} [auth.robotKey]
   * @param {string} [auth.robotToken]
   * @param {object} [options]
   * @param {string} [options.apiBase] Voice API base URL; default `DEFAULT_VOICE_API_BASE`, or `RELATIVE_VOICE_API_BASE` with a dev proxy.
   */
  constructor(t, r = {}) {
    const e = t["robot-key"] ?? t.robotKey, n = t["robot-token"] ?? t.robotToken;
    if (!e || !n)
      throw new Error(
        "ChatClient: robot-key / robot-token (or robotKey / robotToken) is required"
      );
    this._robotKey = e, this._robotToken = n, this._apiBase = C(r.apiBase ?? A), this._sessions = /* @__PURE__ */ new Map(), this._handlers = /* @__PURE__ */ new Map();
  }
  /**
   * @param {string} eventName
   * @param {(data: any) => void} handler
   */
  on(t, r) {
    this._handlers.has(t) || this._handlers.set(t, []), this._handlers.get(t).push(r);
  }
  /**
   * @param {string} eventName
   * @param {(data: any) => void} handler
   */
  off(t, r) {
    const e = this._handlers.get(t);
    if (!e) return;
    const n = e.indexOf(r);
    n > -1 && e.splice(n, 1);
  }
  /**
   * @param {string} eventName
   * @param {any} data
   */
  _emit(t, r) {
    (this._handlers.get(t) || []).forEach((e) => p(e, r)), (this._handlers.get(u.ALL) || []).forEach(
      (e) => p(e, t, r)
    );
  }
  _emitError(t) {
    this._emit(u.ERROR, t);
  }
  /** Emit only to ALL listeners (e.g. extra stream topics). */
  _emitAllOnly(t, r) {
    (this._handlers.get(u.ALL) || []).forEach(
      (e) => p(e, t, r)
    );
  }
  async _fetchStop(t, r) {
    const e = await fetch(`${this._apiBase}/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Robot-Key": this._robotKey,
        "Robot-Token": this._robotToken
      },
      body: JSON.stringify(
        T({
          user_name: t,
          room_name: r
        })
      )
    }), n = await e.json().catch(() => ({}));
    if (!e.ok)
      throw new Error((n == null ? void 0 : n.message) || e.statusText || `HTTP ${e.status}`);
    if (n.code !== 0)
      throw new Error(n.message || "stop failed");
    return n;
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
  async startVoiceChat(t = {}) {
    const r = t.userName ?? O(), e = T({
      user_name: r,
      welcome: t.welcome,
      max_duration: t.maxDuration,
      client_type: t.clientType ?? "websdk",
      expected_engine_id: t.expectedEngineId,
      segment_code: t.segmentCode
    });
    let n;
    try {
      const o = await fetch(`${this._apiBase}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Robot-Key": this._robotKey,
          "Robot-Token": this._robotToken
        },
        body: JSON.stringify(e)
      });
      if (n = await o.json().catch(() => ({})), !o.ok) {
        const h = {
          code: `HTTP_${o.status}`,
          message: (n == null ? void 0 : n.message) || o.statusText
        };
        throw this._emitError(h), Object.assign(new Error(h.message), {
          __voiceSdkHandled: !0
        });
      }
    } catch (o) {
      throw o.__voiceSdkHandled || this._emitError({
        code: "NETWORK",
        message: (o == null ? void 0 : o.message) || String(o)
      }), o;
    }
    if (n.code !== 0) {
      const o = {
        code: String(n.code ?? "UNKNOWN"),
        message: n.message || "start failed"
      };
      throw this._emitError(o), new Error(o.message);
    }
    const E = n.data, a = E.room_name;
    let i;
    try {
      i = await b(E, {
        onStreamMessage: (o) => this._handleStreamMessage(a, r, o),
        onConnectionState: (o, h) => {
          o === "DISCONNECTED" && this._onRtcDisconnected(a, h);
        }
      });
    } catch (o) {
      try {
        await this._fetchStop(r, E.room_name);
      } catch {
      }
      throw this._emitError({
        code: "RTC_ERROR",
        message: (o == null ? void 0 : o.message) || String(o),
        sessionId: a
      }), o;
    }
    return this._sessions.set(a, {
      userName: r,
      roomName: E.room_name,
      rtc: i
    }), this._emit(u.SESSION_CREATED, { sessionId: a }), a;
  }
  _onRtcDisconnected(t, r) {
    const e = this._sessions.get(t);
    e && (this._sessions.delete(t), this._emit(u.SESSION_ENDED, {
      sessionId: t,
      reason: r || "disconnected"
    }), this._fetchStop(e.userName, e.roomName).catch(() => {
    }));
  }
  /**
   * @param {string} sessionId
   * @param {string} userName
   * @param {object} message
   */
  _handleStreamMessage(t, r, e) {
    var a;
    if (e.parseError) {
      this._emitError({
        code: "STREAM_PARSE",
        message: ((a = e.error) == null ? void 0 : a.message) || "stream message parse error",
        sessionId: t,
        userName: r
      });
      return;
    }
    const n = e.code !== 0 && !!e.errMsg, E = n ? e.errMsg : e.text;
    if (e.topic === "chat") {
      const i = e.role === "llm", o = e.id !== void 0 && e.id !== null ? e.id : void 0, h = e.timestamp !== void 0 ? e.timestamp : void 0, S = { sessionId: t, content: E, segmentId: o, timestamp: h };
      i ? this._emit(u.ROBOT_MESSAGE, S) : this._emit(u.USER_MESSAGE, S), n && this._emitError({
        code: String(e.code ?? "CHAT_ERROR"),
        message: e.errMsg || "chat error",
        sessionId: t,
        userName: r
      });
      return;
    }
    if (e.topic === "interrupt") {
      this._emit(u.INTERRUPT, { sessionId: t });
      return;
    }
    if (e.topic === "flow_debug") {
      this._emitAllOnly("FLOW_DEBUG", {
        sessionId: t,
        text: e.content || e.text
      });
      return;
    }
    if (e.topic === "side_info") {
      this._emitAllOnly("SIDE_INFO", {
        sessionId: t,
        payload: e.payload || e
      });
      return;
    }
    this._emitAllOnly("STREAM_MESSAGE", { sessionId: t, message: e });
  }
  /**
   * @param {{ sessionId: string }} param
   */
  async stopVoiceChat({ sessionId: t }) {
    const r = this._sessions.get(t);
    if (!r)
      throw new Error(`ChatClient: unknown sessionId "${t}"`);
    this._sessions.delete(t);
    try {
      await r.rtc.stop();
    } catch (n) {
      this._emitError({
        code: "RTC_STOP",
        message: (n == null ? void 0 : n.message) || String(n),
        sessionId: t
      });
    }
    let e = null;
    try {
      await this._fetchStop(r.userName, r.roomName);
    } catch (n) {
      e = n, this._emitError({
        code: "STOP_API",
        message: (n == null ? void 0 : n.message) || String(n),
        sessionId: t
      });
    }
    if (this._emit(u.SESSION_ENDED, {
      sessionId: t,
      reason: e ? "user_stop_api_failed" : "user_stop"
    }), e)
      throw e;
  }
  /**
   * @param {{ sessionId: string }} param
   */
  interrupt({ sessionId: t }) {
    const r = this._sessions.get(t);
    if (!r)
      throw new Error(`ChatClient: unknown sessionId "${t}"`);
    r.rtc.sendInterrupt();
  }
  /**
   * @param {{ sessionId: string, bool: boolean }} param
   */
  async setAudioEnabled({ sessionId: t, bool: r }) {
    const e = this._sessions.get(t);
    if (!e)
      throw new Error(`ChatClient: unknown sessionId "${t}"`);
    e.rtc.toggleMic(!!r);
  }
}
export {
  M as ChatClient,
  A as DEFAULT_VOICE_API_BASE,
  D as RELATIVE_VOICE_API_BASE,
  u as VoiceEvents,
  O as generateDefaultUserName
};
//# sourceMappingURL=index.mjs.map
