# @koi-video/voice-realtime-sdk-beta

浏览器端实时语音 SDK：**HTTP 语音会话**（`/start`、`/stop`），使用 **Robot-Key / Robot-Token** 鉴权；并集成 **Agora RTC**（麦克风推流、远端音频、流消息用于字幕与控制）。`**agora-rtc-sdk-ng` 已作为普通依赖内置**，无需业务侧单独安装。

[English documentation](./README.md)

---

## 概述


| 层级             | 职责                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------ |
| **REST**       | 创建/结束语音会话；返回 `room_name`、`rtc_info`（Agora 的 `app_id`、`token`、`user_id`）。                   |
| **RTC**        | 进房、发布麦克风、订阅远端音频、接收 **stream message**（字幕、打断等）。                                             |
| **ChatClient** | 统一入口：`startVoiceChat` → 进 Agora → `on` 订阅事件；`stopVoiceChat`、`interrupt`、`setAudioEnabled`。 |


- **会话标识**：`startVoiceChat` 返回的 `**sessionId`** 与后端 `**room_name**` 相同，用于 `stopVoiceChat`、`interrupt`、`setAudioEnabled`。
- **运行环境**：麦克风与 RTC 需要**安全上下文**（HTTPS 或 `localhost`）。

---

## 安装

```bash
pnpm add @koi-video/voice-realtime-sdk-beta
```

`agora-rtc-sdk-ng` 已作为本包的**直接依赖**打包进来，**无需在业务项目中再单独安装**；安装本包时由包管理器一并解析安装（具体以 path / 公网 / 私库等发布方式为准）。

---

## 模块导出

```js
import {
  ChatClient,
  VoiceEvents,
  DEFAULT_VOICE_API_BASE,
  RELATIVE_VOICE_API_BASE,
  generateDefaultUserName
} from '@koi-video/voice-realtime-sdk-beta';
```


| 导出                        | 说明                                         |
| ------------------------- | ------------------------------------------ |
| `ChatClient`              | 主客户端类。                                     |
| `VoiceEvents`             | 事件名字符串常量（见 [事件](#事件)）。                     |
| `DEFAULT_VOICE_API_BASE`  | 默认 REST 根地址（直连网关）。                         |
| `RELATIVE_VOICE_API_BASE` | 开发代理用的同源路径，如 `/openapi/v1/realtime/voice`。 |
| `generateDefaultUserName` | 未传 `userName` 时生成 `user_${时间戳}_${随机串}`。    |


---

## REST 接口（SDK 内部调用）

使用 `**fetch**`、JSON 请求体，请求头：

- `Robot-Key`、`Robot-Token`（由业务后台或控制台下发）
- `Content-Type`: `application/json`


| 方法     | 路径（相对 `apiBase`）  | 说明                            |
| ------ | ----------------- | ----------------------------- |
| `POST` | `{apiBase}/start` | 发起会话；body 字段为下述 snake_case。   |
| `POST` | `{apiBase}/stop`  | 结束会话；`user_name`、`room_name`。 |


`apiBase` 会做规范化（去掉末尾多余 `/`）。默认值为 `DEFAULT_VOICE_API_BASE`。  
若 `apiBase` 已包含语音模块路径，**不要再**在 `/start`、`/stop` 前多拼一层 `/voice`，避免出现 `.../voice/voice/start` 这类重复路径。

成功启动时，响应通常包含 `data.room_name`、`data.user_name`、`data.rtc_info`（含 `vendor`、`user_id`、`params.app_id`、`params.token`）。

---

## ChatClient

### 构造函数

```ts
new ChatClient(auth, options?)
```

`**auth**`（任选一种写法）：

- `robot-key` / `robot-token`，或
- `robotKey` / `robotToken`

`**options**`


| 字段        | 类型       | 说明                                                                                 |
| --------- | -------- | ---------------------------------------------------------------------------------- |
| `apiBase` | `string` | 可选。默认 `DEFAULT_VOICE_API_BASE`。前端经反向代理访问同一网关时，可设为 `RELATIVE_VOICE_API_BASE` 等同源路径。 |


### 方法


| 方法                                     | 说明                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `on(eventName, handler)`               | 订阅事件。                                                                       |
| `off(eventName, handler)`              | 取消订阅。                                                                       |
| `startVoiceChat(options?)`             | 请求 `POST .../start`，再进 Agora 并发麦克。返回 `**sessionId**`（即 `room_name`）。        |
| `stopVoiceChat({ sessionId })`         | 离房并请求 `POST .../stop`。会触发 `SESSION_ENDED`。若 RTC 已释放但 stop 接口失败，仍可能 `throw`。 |
| `interrupt({ sessionId })`             | 通过 Agora 流消息发送打断指令。                                                         |
| `setAudioEnabled({ sessionId, bool })` | 通过音量控制本地采集开关（`bool === false` 为静音）。                                         |


### `startVoiceChat(options?)`


| 字段                 | 类型       | 说明                                   |
| ------------------ | -------- | ------------------------------------ |
| `userName`         | `string` | 可选；不传则用 `generateDefaultUserName()`。 |
| `welcome`          | `string` | 可选欢迎语。                               |
| `maxDuration`      | `number` | 最大通话时长（秒），对应 `max_duration`。         |
| `clientType`       | `string` | 默认 `"websdk"`。                       |
| `expectedEngineId` | `string` | 对应 `expected_engine_id`（Agent 等）。    |
| `segmentCode`      | `string` | 对应 `segment_code`。                   |


---

## 事件

使用 `client.on(VoiceEvents.XXX, handler)` 或 `client.on('ALL', ...)` 订阅。

### `VoiceEvents` 常量


| 常量                | 值                 | 触发时机                                                                              |
| ----------------- | ----------------- | --------------------------------------------------------------------------------- |
| `SESSION_CREATED` | `SESSION_CREATED` | HTTP 启动成功且 Agora 就绪；载荷：`{ sessionId }`。                                           |
| `SESSION_ENDED`   | `SESSION_ENDED`   | 用户 `stopVoiceChat`、RTC 异常断开、或结束流程中已发出 `SESSION_ENDED`；载荷：`{ sessionId, reason }`。 |
| `USER_MESSAGE`    | `USER_MESSAGE`    | 流消息 `topic === 'chat'`，用户侧；载荷：`{ sessionId, content, segmentId?, timestamp? }`。   |
| `ROBOT_MESSAGE`   | `ROBOT_MESSAGE`   | 流消息 `topic === 'chat'`，助手（`role === 'llm'`）；载荷同上。                                 |
| `INTERRUPT`       | `INTERRUPT`       | 流消息 `topic === 'interrupt'`；载荷：`{ sessionId }`。                                   |
| `ERROR`           | `ERROR`           | 接口/RTC/解析等错误；载荷含 `code`、`message`、`sessionId?` 等。                                 |
| `ALL`             | `ALL`             | 所有事件：`**handler(eventName, data)**`。                                              |


协议中暂未与流绑定的预留名：`AUDIO_START`、`AUDIO_END` — 为与产品文档对齐写在 `VoiceEvents` 中，**请勿依赖其实际触发**。

### `ALL` 与扩展 topic

订阅 `ALL` 时，还可能收到：


| 第一个参数 `eventName` | 含义                                                   |
| ----------------- | ---------------------------------------------------- |
| `FLOW_DEBUG`      | `topic === 'flow_debug'` — 载荷含 `sessionId`、`text`。   |
| `SIDE_INFO`       | `topic === 'side_info'` — 载荷含 `sessionId`、`payload`。 |
| `STREAM_MESSAGE`  | 其余未单独映射的流 JSON。                                      |


### 常见 `ERROR.code`


| Code           | 含义                      |
| -------------- | ----------------------- |
| `HTTP_`*       | 启动接口非 2xx。              |
| `NETWORK`      | 启动阶段 `fetch` 失败。        |
| `RTC_ERROR`    | Agora 进房/推流失败。          |
| `STREAM_PARSE` | 流消息解析失败。                |
| `CHAT_ERROR`   | 聊天消息带 `errMsg`。         |
| `RTC_STOP`     | 停止轨道/客户端异常。             |
| `STOP_API`     | 结束会话 HTTP 失败（本地可能已拆会话）。 |


---

## 代码示例

### 最小流程

```js
import { ChatClient, VoiceEvents } from '@koi-video/voice-realtime-sdk-beta';

// 鉴权：Robot-Key / Robot-Token（示例从环境变量读取，实际可按业务注入）
const client = new ChatClient({
  robotKey: process.env.ROBOT_KEY,
  robotToken: process.env.ROBOT_TOKEN
});

// 错误：HTTP / RTC / 流解析等
client.on(VoiceEvents.ERROR, err => {
  console.error(err.code, err.message);
});

// 助手字幕；segmentId 用于多条流式片段合并为同一气泡
client.on(VoiceEvents.ROBOT_MESSAGE, ({ sessionId, content, segmentId }) => {
  console.log('bot:', content, segmentId);
});

// 用户侧语音识别文本
client.on(VoiceEvents.USER_MESSAGE, ({ content, segmentId }) => {
  console.log('user:', content, segmentId);
});

// 发起会话并进房、推麦；返回值 sessionId 与后端 room_name 相同
const sessionId = await client.startVoiceChat({
  expectedEngineId: 'your-agent-id'
});

// 发送打断 → 静音 → 开麦 → 离房并调用结束会话接口
client.interrupt({ sessionId });
await client.setAudioEnabled({ sessionId, bool: false });
await client.setAudioEnabled({ sessionId, bool: true });
await client.stopVoiceChat({ sessionId });
```

### 全局监听

```js
client.on(VoiceEvents.ALL, (eventName, data) => {或结束流程中已发出
  console.log(eventName, data);
});
```

### 开发环境代理（Vite 等）

将 `apiBase` 指到经代理的同源路径，避免浏览器跨域直连网关：

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

在开发服务器中将 `/openapi`（或你们使用的前缀）代理到真实网关。

---

## 本仓库 Demo

```bash
cd packages/voice-realtime-sdk
pnpm install
pnpm demo
```

完整示例见 `demo/`（HTML + Vite；可选 HTTPS，见 `demo/vite.config.js` 中的 `@vitejs/plugin-basic-ssl`）。

---

## 许可证

UNLICENSED（内部使用 / 由团队发布策略决定）。