import AgoraRTC from 'agora-rtc-sdk-ng';

const MIC_VOLUME_MUTED = 0;
const MIC_VOLUME_DEFAULT = 100;

/**
 * @param {object} hooks
 * @param {(msg: object) => void} hooks.onStreamMessage
 * @param {(state: string, reason?: string) => void} [hooks.onConnectionState]
 * @param {(speaking: boolean) => void} [hooks.onLocalSpeaking]
 * @param {(speaking: boolean) => void} [hooks.onRemoteSpeaking]
 */
export async function createAgoraVoiceController(data, hooks = {}) {
  const {
    room_name,
    rtc_info: {
      params: { app_id, token },
      user_id: userId
    }
  } = data;

  const localUserId = userId;
  let client = null;
  let localAudioTrack = null;

  const handleStreamMessage = (_uid, raw) => {
    try {
      const messageStr = new TextDecoder().decode(raw);
      const message = JSON.parse(messageStr);
      hooks.onStreamMessage?.(message);
    } catch (e) {
      hooks.onStreamMessage?.({ parseError: true, error: e });
    }
  };

  async function handleUserPublished(user, mediaType) {
    if (mediaType === 'audio') {
      await client.subscribe(user, mediaType);
      user.audioTrack?.play?.();
    }
  }

  AgoraRTC.setLogLevel(0);
  client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  client.on('user-published', handleUserPublished);
  client.on('user-unpublished', () => {});
  client.on('stream-message', handleStreamMessage);
  client.on('connection-state-change', (curState, _prev, reason) => {
    hooks.onConnectionState?.(curState, reason);
  });

  await client.join(app_id, room_name, token, userId);

  localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
    AEC: true,
    ANS: true,
    AGC: true,
    encoderConfig: 'music_standard'
  });
  await client.publish([localAudioTrack]);

  client.enableAudioVolumeIndicator();
  client.on('volume-indicator', volumes => {
    volumes.forEach(({ uid, level }) => {
      if (uid === localUserId || uid === 0) {
        hooks.onLocalSpeaking?.(level > 10);
      } else {
        hooks.onRemoteSpeaking?.(level > 10);
      }
    });
  });

  return {
    async stop() {
      if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack.close();
        localAudioTrack = null;
      }
      if (client) {
        await client.leave();
        client = null;
      }
    },

    toggleMic(enabled) {
      if (!localAudioTrack) return;
      localAudioTrack.setVolume(
        enabled ? MIC_VOLUME_DEFAULT : MIC_VOLUME_MUTED
      );
    },

    sendInterrupt() {
      if (!client) return;
      const encoder = new TextEncoder();
      const payload = encoder.encode(
        JSON.stringify({
          event: 'command',
          command: { action: 'interrupt' }
        })
      );
      client.sendStreamMessage(payload, false);
    }
  };
}
