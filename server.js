const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gantt-state.json');
const DEFAULT_STATE = Object.freeze({
  tasks: [],
  projects: [],
  sheetsSettings: null,
  cardLocks: {},
  dynamicKPIs: {},
  summaryTitle: 'Project Summary'
});

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_SHARE_VIEWS = parsePositiveInteger(process.env.MAX_SHARE_VIEWS, 250);
const SHARE_TTL_MS = parsePositiveInteger(process.env.SHARE_TTL_MS, 24 * 60 * 60 * 1000);
const SHEETS_TIMEOUT_MS = parsePositiveInteger(process.env.SHEETS_TIMEOUT_MS, 30000);
const PRIVATE_STATIC_PATHS = new Set(['server.js', 'server-prod.js', 'package.json', 'package-lock.json', 'gantt-state.json']);
const sharedViews = new Map();

function cloneDefaultState() {
  return {
    tasks: [],
    projects: [],
    sheetsSettings: null,
    cardLocks: {},
    dynamicKPIs: {},
    summaryTitle: 'Project Summary'
  };
}

function toPlainObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normaliseState(payload = {}) {
  return {
    ...cloneDefaultState(),
    tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
    projects: Array.isArray(payload.projects) ? payload.projects : [],
    sheetsSettings: payload.sheetsSettings || null,
    cardLocks: toPlainObject(payload.cardLocks),
    dynamicKPIs: toPlainObject(payload.dynamicKPIs),
    summaryTitle: typeof payload.summaryTitle === 'string' && payload.summaryTitle.trim()
      ? payload.summaryTitle.trim().slice(0, 200)
      : DEFAULT_STATE.summaryTitle
  };
}

function cleanState(payload = {}) {
  const state = normaliseState(payload);
  const projectIds = new Set(state.projects.map(project => project.id).filter(Boolean));
  const beforeTaskCount = state.tasks.length;

  state.tasks = state.tasks.filter(task => !task.projectId || projectIds.has(task.projectId));
  const taskIds = new Set(state.tasks.map(task => task.id).filter(Boolean));

  state.tasks = state.tasks.map(task => ({
    ...task,
    dependencies: Array.isArray(task.dependencies)
      ? [...new Set(task.dependencies)].filter(dep => taskIds.has(dep) && dep !== task.id)
      : []
  }));

  return {
    state,
    removedTasks: beforeTaskCount - state.tasks.length
  };
}

function extractGoogleSheetInfo(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Google Sheets URL is required');
  }

  let parsed;
  const trimmedUrl = url.trim();
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    throw new Error('Invalid Google Sheets URL');
  }

  if (!['docs.google.com', 'spreadsheets.google.com'].includes(parsed.hostname)) {
    throw new Error('URL must be a Google Sheets link');
  }

  const pathAndSearch = `${parsed.pathname}${parsed.search}`;
  const hasCsvExport = /(?:export\?format=csv|pub\?output=csv|output=csv)/i.test(pathAndSearch);
  const publishedMatch = parsed.pathname.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
  const standardMatch = parsed.pathname.match(/\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
  const queryId = parsed.searchParams.get('id') || parsed.searchParams.get('key');
  const gid = parsed.searchParams.get('gid') || parsed.hash.match(/gid=(\d+)/)?.[1] || null;
  const isPublishedCsv = Boolean(publishedMatch) || /\/pub/i.test(parsed.pathname) || /output=csv/i.test(parsed.search);
  const actualSheetId = standardMatch?.[1] || queryId || null;
  const publishedId = publishedMatch?.[1] || null;
  const sheetId = actualSheetId || (isPublishedCsv ? publishedId : null);

  if (!sheetId) {
    throw new Error('Could not extract sheet ID from URL');
  }

  return { trimmedUrl, parsed, sheetId, actualSheetId, publishedId, gid, hasCsvExport, isPublishedCsv };
}

function isGoogleSheetsInputError(error) {
  return /Google Sheets|Google Sheet|sheet ID|Invalid Google Sheets URL/i.test(error?.message || '');
}

function buildGoogleSheetCsvUrl(url, gid = null, sheetName = null) {
  const info = extractGoogleSheetInfo(url);

  if (info.hasCsvExport) {
    const exportUrl = new URL(info.trimmedUrl);
    if (gid && !exportUrl.searchParams.has('gid')) exportUrl.searchParams.set('gid', gid);
    return exportUrl.toString();
  }

  if (info.isPublishedCsv && info.publishedId) {
    const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/e/${info.publishedId}/pub`);
    csvUrl.searchParams.set('output', 'csv');
    if (gid) csvUrl.searchParams.set('gid', gid);
    return csvUrl.toString();
  }

  const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${info.sheetId}/export`);
  csvUrl.searchParams.set('format', 'csv');
  if (gid) {
    csvUrl.searchParams.set('gid', gid);
    return csvUrl.toString();
  }

  if (sheetName) {
    const namedSheetUrl = new URL(`https://docs.google.com/spreadsheets/d/${info.sheetId}/gviz/tq`);
    namedSheetUrl.searchParams.set('tqx', 'out:csv');
    namedSheetUrl.searchParams.set('sheet', sheetName);
    return namedSheetUrl.toString();
  }

  return csvUrl.toString();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SHEETS_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'CITIBIM-Dashboard/1.0 (+http://citibim.com)' },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStateFile() {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return cleanState(JSON.parse(raw)).state;
  } catch (error) {
    if (error.code === 'ENOENT') return cloneDefaultState();
    console.error('Failed to read state file:', error);
    throw error;
  }
}

async function writeStateFile(state) {
  await ensureDataDir();
  const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify(normaliseState(state), null, 2);

  try {
    await fs.writeFile(tempFile, json, 'utf8');
    await fs.rename(tempFile, DATA_FILE);
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => {});
    console.error('Failed to write state file:', error);
    throw error;
  }
}

function pruneExpiredShares() {
  const now = Date.now();
  for (const [shareId, sharedView] of sharedViews) {
    if (sharedView.expiresAt <= now) sharedViews.delete(shareId);
  }

  while (sharedViews.size > MAX_SHARE_VIEWS) {
    const oldestShareId = sharedViews.keys().next().value;
    sharedViews.delete(oldestShareId);
  }
}

function getSharePayload(shareId) {
  const sharedView = sharedViews.get(shareId);
  if (!sharedView) return null;
  if (sharedView.expiresAt <= Date.now()) {
    sharedViews.delete(shareId);
    return null;
  }
  return sharedView.payload;
}

app.use(express.json({ limit: '10mb', strict: true }));
app.use((req, res, next) => {
  const requestedPath = decodeURIComponent(req.path).replace(/^\/+/, '');
  if (requestedPath.startsWith('data/') || PRIVATE_STATIC_PATHS.has(requestedPath)) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});
app.use(express.static(path.join(__dirname), {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/api/state', async (req, res) => {
  try {
    const state = await readStateFile();
    res.json(state);
  } catch {
    res.status(500).json({ error: 'Failed to load saved state' });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { state, removedTasks } = cleanState(req.body);
    console.log(`[SERVER] Saving: ${state.tasks.length} tasks, ${state.projects.length} projects`);
    if (removedTasks > 0) console.log(`[SERVER] Removed ${removedTasks} orphaned tasks`);

    await writeStateFile(state);
    res.json({ success: true, tasksCount: state.tasks.length, projectsCount: state.projects.length, orphanedTasksRemoved: removedTasks });
  } catch (error) {
    console.error('[SERVER] Save error:', error);
    res.status(500).json({ error: 'Failed to save state' });
  }
});

app.post('/api/share', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid share payload' });
    }

    pruneExpiredShares();
    const shareId = randomUUID();
    sharedViews.set(shareId, { payload: req.body, expiresAt: Date.now() + SHARE_TTL_MS });
    pruneExpiredShares();
    res.json({ success: true, shareId, expiresInMs: SHARE_TTL_MS });
  } catch (error) {
    console.error('[SERVER] Share error:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

app.get('/api/share/:id', (req, res) => {
  const viewData = getSharePayload(req.params.id);
  if (!viewData) return res.status(404).json({ error: 'Shared view not found or expired' });
  res.json(viewData);
});

app.post('/api/sheets/tabs', async (req, res) => {
  try {
    const { url } = req.body || {};
    const info = extractGoogleSheetInfo(url);
    if (info.isPublishedCsv) {
      return res.json({ success: true, tabs: [{ id: info.publishedId || 'published_csv', name: 'Published CSV', gid: info.gid, published: true }] });
    }

    if (!info.actualSheetId) {
      return res.status(400).json({ error: 'Could not determine sheet ID from the provided URL.' });
    }

    const feedUrl = `https://spreadsheets.google.com/feeds/worksheets/${info.actualSheetId}/public/basic?alt=json`;
    const response = await fetchWithTimeout(feedUrl);

    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        return res.status(404).json({ error: 'Sheet not found or not published for tab preview. For tab selection, the sheet must be published to the web. Try using the published CSV URL instead.' });
      }
      return res.status(response.status).json({ error: `Failed to fetch sheet tabs: ${response.statusText}` });
    }

    const data = await response.json();
    const entries = data.feed?.entry || [];
    const tabs = entries.map(entry => {
      const title = entry.title?.$t || 'Sheet';
      const alternateLink = (entry.link || []).find(link => /#alternate$/.test(link.rel) || link.rel === 'alternate');
      const href = alternateLink?.href || '';
      const gid = href ? new URL(href).searchParams.get('gid') || href.match(/gid=(\d+)/)?.[1] || null : null;
      return { id: entry.id?.$t || title, name: title, gid };
    });

    res.json({ success: true, tabs });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Sheet tab lookup timed out.' });
    }
    console.error('[SERVER] Sheet tabs fetch error:', error.message);
    res.status(isGoogleSheetsInputError(error) ? 400 : 500)
      .json({ error: error.message || 'Failed to retrieve sheet tabs.' });
  }
});

app.post('/api/sheets/fetch', async (req, res) => {
  try {
    const { url, gid, sheetName } = req.body || {};
    const csvUrl = buildGoogleSheetCsvUrl(url, gid, sheetName);
    console.log(`[SERVER] Fetching Google Sheet: ${csvUrl}`);

    const response = await fetchWithTimeout(csvUrl);
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Sheet not found. Verify the URL and sheet ID.' });
      }
      return res.status(response.status).json({ error: `Google Sheets error: ${response.statusText}` });
    }

    const csvText = await response.text();
    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ error: 'Google Sheets returned empty data' });
    }

    if (/^\s*</.test(csvText)) {
      return res.status(403).json({ error: 'Unable to access this sheet. It may be restricted by corporate policies.' });
    }

    res.json({ success: true, csvData: csvText, csvUrl });
  } catch (error) {
    console.error('[SERVER] Google Sheets fetch error:', error.message);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timeout. The sheet may be too large.' });
    }
    res.status(isGoogleSheetsInputError(error) ? 400 : 500)
      .json({ error: error.message || 'Failed to fetch Google Sheet. Please check the URL and try again.' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const state = await readStateFile();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      tasks: state.tasks.length,
      projects: state.projects.length,
      sharedViews: sharedViews.size
    });
  } catch (error) {
    res.status(503).json({ status: 'degraded', error: error.message });
  }
});

app.post('/api/cleanup', async (req, res) => {
  try {
    const { state, removedTasks } = cleanState(await readStateFile());
    if (removedTasks > 0) {
      console.log(`[SERVER] Cleanup: removed ${removedTasks} orphaned tasks`);
      await writeStateFile(state);
    }
    res.json({ success: true, orphanedTasksRemoved: removedTasks });
  } catch (error) {
    console.error('[SERVER] Cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }
  console.error('[SERVER] Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

const shareCleanupTimer = setInterval(pruneExpiredShares, Math.min(SHARE_TTL_MS, 60 * 60 * 1000));
shareCleanupTimer.unref?.();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
