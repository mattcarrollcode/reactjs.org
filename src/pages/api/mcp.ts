/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {NextApiRequest, NextApiResponse} from 'next';
import fs from 'fs';
import path from 'path';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';

import sidebarLearn from '../../sidebarLearn.json';
import sidebarReference from '../../sidebarReference.json';
import sidebarBlog from '../../sidebarBlog.json';
import sidebarCommunity from '../../sidebarCommunity.json';

// --- Sidebar types and page collection ---

interface RouteItem {
  title?: string;
  path?: string;
  routes?: RouteItem[];
  hasSectionHeader?: boolean;
  sectionHeader?: string;
}

interface Sidebar {
  title: string;
  path: string;
  routes: RouteItem[];
}

interface PageEntry {
  title: string;
  path: string;
}

interface Section {
  section: string;
  pages: PageEntry[];
}

function collectPages(routes: RouteItem[]): PageEntry[] {
  const pages: PageEntry[] = [];
  for (const route of routes) {
    // Skip section headers without paths
    if (route.hasSectionHeader && !route.path) {
      continue;
    }
    // Skip external links
    if (route.path?.startsWith('http')) {
      continue;
    }
    // Collect this page if it has a title and path
    if (route.title && route.path) {
      pages.push({
        title: route.title,
        // Strip leading slash for consistency with get_page
        path: route.path.replace(/^\//, ''),
      });
    }
    // Recurse into children
    if (route.routes) {
      pages.push(...collectPages(route.routes));
    }
  }
  return pages;
}

// Build page index at module load time (static data)
const PAGE_INDEX: Section[] = (
  [sidebarLearn, sidebarReference, sidebarBlog, sidebarCommunity] as Sidebar[]
).map((sidebar) => ({
  section: sidebar.title,
  pages: collectPages(sidebar.routes),
}));

// --- Markdown file resolution ---

const contentCache = new Map<string, string>();

function readMarkdownFile(filePath: string): string | null {
  const cached = contentCache.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  const candidates = [
    path.join(process.cwd(), 'src/content', filePath + '.md'),
    path.join(process.cwd(), 'src/content', filePath, 'index.md'),
  ];

  for (const fullPath of candidates) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      contentCache.set(filePath, content);
      return content;
    } catch {
      // Try next candidate
    }
  }

  return null;
}

// --- Next.js API config ---

export const config = {
  api: {
    // The MCP SDK reads the raw body itself
    bodyParser: false,
  },
};

// --- Request handler ---

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: 'Method not allowed. Use POST for MCP.'});
    return;
  }

  const server = new McpServer(
    {
      name: 'react-docs',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.registerTool(
    'list_pages',
    {
      description:
        'List all available React documentation pages, grouped by section (Learn, Reference, Blog, Community). Returns JSON with titles and paths.',
    },
    async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(PAGE_INDEX, null, 2),
          },
        ],
      };
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK generic types cause TS2589
  (server.registerTool as any)(
    'get_page',
    {
      description:
        'Get the full markdown content of a React documentation page by its path. Use list_pages to discover available paths.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'Page path without leading slash, e.g. "reference/react/useState" or "blog/2024/12/05/react-19"'
          ),
      },
    },
    async ({path: pagePath}: {path: string}) => {
      const content = readMarkdownFile(pagePath);
      if (content === null) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Page not found: ${pagePath}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: content,
          },
        ],
      };
    }
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  await transport.handleRequest(req, res);
}
