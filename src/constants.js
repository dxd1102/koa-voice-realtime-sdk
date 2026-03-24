/** Default voice API base (direct). */
export const DEFAULT_VOICE_API_BASE =
  'https://saibotan-pre2.100credit.cn/openapi/v1/realtime/voice';

/**
 * Same-origin path for dev proxy (`/openapi` → pre2). Requests: `{apiBase}/start`, `{apiBase}/stop`.
 */
export const RELATIVE_VOICE_API_BASE = '/openapi/v1/realtime/voice';

/**
 * Subscribable event names. AUDIO_START / AUDIO_END are reserved; stream may not emit them.
 */
export const VoiceEvents = {
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_ENDED: 'SESSION_ENDED',
  USER_MESSAGE: 'USER_MESSAGE',
  ROBOT_MESSAGE: 'ROBOT_MESSAGE',
  AUDIO_START: 'AUDIO_START',
  AUDIO_END: 'AUDIO_END',
  INTERRUPT: 'INTERRUPT',
  ERROR: 'ERROR',
  ALL: 'ALL'
};
