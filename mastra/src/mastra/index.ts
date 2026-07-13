
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { registerApiRoute } from '@mastra/core/server';
import { bannerAgent } from './agents/banner-agent';
import { bannerWorkflow } from './workflows/banner-workflow';
import { getBanner } from './lib/banner-store';

export const mastra = new Mastra({
  agents: { bannerAgent },
  workflows: { bannerWorkflow },
  server: {
    apiRoutes: [
      registerApiRoute('/banners/:id', {
        method: 'GET',
        handler: async (c) => {
          const png = getBanner(c.req.param('id').replace(/\.png$/, ''));
          if (!png) return c.body('banner not found', 404);
          return c.body(new Uint8Array(png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        },
      }),
    ],
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
