import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDatabase, flushDatabaseSync } from './db/index.js';
import { setupApiRoutes } from './api/index.js';
import { setupWebSocket } from './ws/handler.js';
import { loadPlugins } from './plugin/loader.js';
import { scriptMcp } from './core/script-mcp.js';
import { providerService } from './core/provider-service.js';
import { componentServer } from './core/component-server.js';
import { debugLogger } from './core/debug-logger.js';
import { skillRunner } from './core/skill-runner.js';
import { mcpClient } from './core/mcp-client.js';
import { createLogger } from './core/logger.js';
import {
  errorHandler,
  requestLogger,
  notFoundHandler
} from './middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const startupLogger = createLogger('startup');

let server: any = null;

function configureCors() {
  const raw = process.env.ORDPAW_CORS_ORIGIN;
  if (!raw) {
    // 默认：前端静态资源同源，API 无需跨域
    return cors({ origin: false });
  }
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  return cors({
    origin: (origin, callback) => {
      // 允许无 Origin 的请求（如 curl、移动端 WebView）
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error(`CORS 策略拒绝来源: ${origin}`));
    },
    credentials: true,
  });
}

async function start() {
  try {
    // 初始化数据库
    await initDatabase();
    scriptMcp.init();
    providerService.init();
    componentServer.loadFromDatabase();
    skillRunner.init();
    mcpClient.init();
    startupLogger.info('数据库初始化完成');

    const app = express();
    const httpServer = createServer(app);
    const wss = new WebSocketServer({ server: httpServer });

    // 基础中间件
    app.use(configureCors());
    app.use(express.json({ limit: '10mb' }));
    app.use(requestLogger);

    // 静态文件服务（前端）
    const clientDistPath = join(__dirname, '../../client/dist');
    app.use(express.static(clientDistPath, {
      index: false,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));

    // 健康检查（无需鉴权）
    app.get('/healthz', (_req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // API 路由
    setupApiRoutes(app);

    // 插件前端组件静态资源与清单
    app.use('/components', componentServer.getRouter());

    // WebSocket
    setupWebSocket(wss);

    // 加载插件（异步，不阻塞启动）
    loadPlugins().catch(err => {
      startupLogger.error('插件加载失败:', err);
    });

    // SPA 回退
    app.get('*', (req, res, next) => {
      // API 路由不匹配时应返回 404 JSON 而不是 SPA
      if (req.path.startsWith('/api/')) {
        return notFoundHandler(req, res);
      }
      res.sendFile(join(clientDistPath, 'index.html'), err => {
        if (err) {
          console.error('SPA 入口发送失败:', err);
          next(err);
        }
      });
    });

    // 错误处理（必须放在最后）
    app.use(errorHandler);

    const PORT = parseInt(process.env.PORT || '3000', 10);

    httpServer.listen(PORT, () => {
      startupLogger.info(`OrdPaw AI Agent Studio 已启动`);
      startupLogger.info(`HTTP: http://localhost:${PORT}`);
      startupLogger.info(`WebSocket: ws://localhost:${PORT}`);
      startupLogger.info(`Health: http://localhost:${PORT}/healthz`);
    });

    server = httpServer;

    // 优雅关闭
    setupGracefulShutdown(httpServer, wss);
  } catch (err) {
      startupLogger.error('启动失败:', err);
      process.exit(1);
    }
}

function setupGracefulShutdown(httpServer: any, wss: WebSocketServer) {
  let shuttingDown = false;

  const shutdown = async (signal: string, error?: Error) => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (error) {
      console.error(`\n未捕获异常，触发优雅关闭:`, error);
    } else {
      console.log(`\n收到 ${signal} 信号，开始优雅关闭...`);
    }

    const forceTimer = setTimeout(() => {
      console.error('关闭超时（10s），强制退出');
      process.exit(1);
    }, 10000);

    try {
      // 关闭所有 WebSocket 客户端连接
      for (const client of wss.clients) {
        try {
          client.close(1001, 'Server shutting down');
        } catch {
          // ignore
        }
      }

      // 等待 HTTP/WebSocket server 关闭
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          httpServer.close((err: any) => (err ? reject(err) : resolve()));
        }),
        new Promise<void>((resolve) => wss.close(() => resolve()))
      ]);

      // 强制落库
      flushDatabaseSync();

      clearTimeout(forceTimer);
      console.log('✓ 优雅关闭完成');
      process.exit(error ? 1 : 0);
    } catch (err) {
      clearTimeout(forceTimer);
      console.error('优雅关闭失败:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    shutdown('uncaughtException', err).catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', promise, '原因:', reason);
  });
}

start();
