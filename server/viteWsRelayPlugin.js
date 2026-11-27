// Vite 插件：在 dev server 启动时顺带拉起零依赖 WebSocket 房间中继，
// 这样 `npm run dev` 一条命令就能同时拿到前端与联机服务器。
// build 时 configureServer 不会执行，不会影响产物。
import { startWsRelay } from './wsRelay.mjs';

let started = false;

export default function viteWsRelayPlugin() {
  return {
    name: 'pixel-swing-ws-relay',
    configureServer() {
      if (started) return;
      started = true;
      startWsRelay({ port: Number(process.env.WS_PORT) || 8787 });
    },
  };
}
