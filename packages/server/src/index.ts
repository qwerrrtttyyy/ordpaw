import express from 'express';
import cors from 'cors';
import { createServer, type Server } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDatabase } from './db/index.js';
import { setupApiRoutes } from './api/index.js';
import { setupWebSocket } from './ws/handler.js';
import { loadPlugins } from './plugin/loader.js';
import { scriptMcp } from './core/script-mcp.js';
import { providerService } from './core/provider-service.js';
import { componentServer } from './core/component-server.js';
import { skillRunner } from './core/skill-runner.js';
import { mcpClient } from './core/mcp-client.js';
import { logger } from './core/logger.js';
import { errorHandler, requestLogger, notFoundHandler } from './middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function start() {
  try {
    // 初始化数据库
    await initDatabase();
    scriptMcp.init();
    providerService.init();
    componentServer.loadFromDatabase();
    skillRunner.init();
    mcpClient.init();
    logger.info('✓ 数据库初始化完成');

    const app = express();
    const httpServer = createServer(app);
    const wss = new WebSocketServer({ server: httpServer });

    // 基础中间件
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(requestLogger);

    // 静态文件服务（前端）
    const clientDistPath = join(__dirname, '../../client/dist');
    app.use(
      express.static(clientDistPath, {
        index: false,
        setHeaders: (res, path) => {
          if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );

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
    loadPlugins().catch((err) => {
      logger.error(err, '✗ 插件加载失败:');
    });

    // SPA 回退
    app.get('*', (req, res, next) => {
      // API 路由不匹配时应返回 404 JSON 而不是 SPA
      if (req.path.startsWith('/api/')) {
        return notFoundHandler(req, res);
      }
      res.sendFile(join(clientDistPath, 'index.html'), (err: Error) => {
        if (err) {
          logger.error(err, 'SPA 入口发送失败:');
          next(err);
        }
      });
    });

    // 错误处理（必须放在最后）
    app.use(errorHandler);

    const PORT = parseInt(process.env.PORT || '3000', 10);

    httpServer.listen(PORT, () => {
      logger.info('🚀 OrdPaw AI Agent Studio 已启动');
      logger.info(`📡 HTTP: http://localhost:${PORT}`);
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
      logger.info(`💚 Health: http://localhost:${PORT}/healthz`);
    });

    // 优雅关闭
    setupGracefulShutdown(httpServer, wss);
  } catch (err) {
    logger.error(err, '启动失败:');
    process.exit(1);
  }
}

function setupGracefulShutdown(httpServer: Server, wss: WebSocketServer) {
  const shutdown = (signal: string) => {
    logger.info(`\n收到 ${signal} 信号，开始优雅关闭...`);

    let forced = false;
    const forceTimer = setTimeout(() => {
      forced = true;
      logger.error('关闭超时（10s），强制退出');
      process.exit(1);
    }, 10000);

    // 停止接收新连接
    httpServer.close((err: Error | undefined) => {
      if (err && !forced) {
        logger.error(err, 'HTTP server 关闭出错:');
      }
      clearTimeout(forceTimer);
      logger.info('✓ HTTP server 已关闭');
    });

    // 关闭所有 WebSocket 连接
    wss.clients.forEach((client) => {
      try {
        client.close(1001, 'Server shutting down');
      } catch (e) {
        // 忽略
      }
    });
    wss.close(() => {
      logger.info('✓ WebSocket server 已关闭');
    });

    // 给一点时间完成清理
    setTimeout(() => {
      logger.info('👋 进程退出');
      process.exit(0);
    }, 1500);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    logger.error(err, '未捕获的异常:');
    // 不退出进程，记录日志
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, '未处理的 Promise 拒绝:');
  });
}

start();
