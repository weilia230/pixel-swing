import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteWsRelayPlugin from './server/viteWsRelayPlugin.js';

// 本地代理免费对话接口，绕开浏览器端的人机校验
const aiProxy = {
  '/api/ai': {
    target: 'https://text.pollinations.ai',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/ai/, ''),
  },
};

// 本地开发把存档请求转发到 wsRelay 的 HTTP 服务
const saveProxy = {
  '/api/saves': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), viteWsRelayPlugin()],
  server: {
    host: true,
    port: 5174,
    proxy: { ...aiProxy, ...saveProxy },
  },
  preview: {
    proxy: { ...aiProxy, ...saveProxy },
  },
});
