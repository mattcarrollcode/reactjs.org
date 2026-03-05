/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import path from 'path';

// --- Sidebar route types ---

export interface RouteItem {
  title?: string;
  path?: string;
  routes?: RouteItem[];
  hasSectionHeader?: boolean;
  sectionHeader?: string;
}

export interface PageEntry {
  title: string;
  path: string;
}

// --- Page collection ---

/**
 * Walk sidebar routes and collect flat page entries.
 * Skips external links and section headers without paths.
 */
export function collectPages(routes: RouteItem[]): PageEntry[] {
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
        // Strip leading slash for consistency
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

// --- Markdown file resolution ---

/**
 * Resolve a page path (e.g. "reference/react/useState") to its markdown
 * content under src/content/. Returns null if no matching file exists.
 *
 * Uses fs.existsSync instead of try/catch for control flow.
 */
export function readContentFile(pagePath: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'src/content', pagePath + '.md'),
    path.join(process.cwd(), 'src/content', pagePath, 'index.md'),
  ];

  for (const fullPath of candidates) {
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  }

  return null;
}
