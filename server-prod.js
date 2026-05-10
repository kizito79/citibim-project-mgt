/**
 * CITIBIM Gantt Dashboard - Production Server
 * Phase 1: Production-Grade Security & Error Handling
 * 
 * Features:
 * - Request logging & audit trail
 * - Rate limiting per IP
 * - Input validation
 * - CORS & security headers
 * - Error boundaries
 * - Health monitoring
 * - Backup mechanism
 * - Graceful error recovery
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gantt-state.json');
const LOG_FILE = path.join(DATA_DIR, 'server.log');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Configuration
const CONFIG = {
  MAX_PAYLOAD_SIZE: '10mb',
  RATE_LIMIT: { window: 60000, max: 100 }, // 100 requests per minute per IP
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  BACKUP_ENABLED: true,
  BACKUP_RETENTION: 7 // days
};

const DEFAULT_STATE = {
  tasks: [],
  projects: [],
  sheetsSettings: null,
  cardLocks: {},
  dynamicKPIs: {},
  summaryTitle: 'Project Summary'
};

const sharedViews = new Map();

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_SHARE_VIEWS = parsePositiveInteger(process.env.MAX_SHARE_VIEWS, 250);
const SHARE_TTL_MS = parsePositiveInteger(process.env.SHARE_TTL_MS, 24 * 60 * 60 * 1000);
const PRIVATE_STATIC_PATHS = new Set(['server.js', 'server-prod.js', 'package.json', 'package-lock.json', 'gantt-state.json']);

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

function pruneExpiredShares() {
  const now = Date.now();
  for (const [shareId, sharedView] of sharedViews) {
    if (sharedView.expiresAt <= now) sharedViews.delete(shareId);
  }
  while (sharedViews.size > MAX_SHARE_VIEWS) {
    sharedViews.delete(sharedViews.keys().next().value);
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

// ============================================
// LOGGING INFRASTRUCTURE
// ============================================

class Logger {
  static levels = { debug: 0, info: 1, warn: 2, error: 3 };
  static currentLevel = this.levels[CONFIG.LOG_LEVEL];
  
  static async write(level, message, metadata = {}) {
    if (this.levels[level] < this.currentLevel) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...metadata,
      processId: process.pid,
      uptime: Math.round(process.uptime())
    };
    
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, metadata);
    
    try {
      await fs.appendFile(LOG_FILE, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      console.error('Failed to write log:', err.message);
    }
  }
  
  static debug(msg, meta) { this.write('debug', msg, meta); }
  static info(msg, meta) { this.write('info', msg, meta); }
  static warn(msg, meta) { this.write('warn', msg, meta); }
  static error(msg, meta) { this.write('error', msg, meta); }
}

// ============================================
// RATE LIMITING
// ============================================

class RateLimiter {
  static requests = new Map();
  
  static check(ip) {
    const now = Date.now();
    if (!this.requests.has(ip)) {
      this.requests.set(ip, []);
    }
    
    const ips = this.requests.get(ip).filter(time => now - time < CONFIG.RATE_LIMIT.window);
    
    if (ips.length >= CONFIG.RATE_LIMIT.max) {
      return false;
    }
    
    ips.push(now);
    this.requests.set(ip, ips);
    return true;
  }
}

// ============================================
// INPUT VALIDATION
// ============================================

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload format' };
  }
  
  // Validate tasks
  if (!Array.isArray(payload.tasks)) {
    return { valid: false, error: 'Tasks must be an array' };
  }
  
  for (const task of payload.tasks) {
    if (!task.id || !task.name) {
      return { valid: false, error: 'Invalid task: missing id or name' };
    }
    if (typeof task.progress !== 'number' || task.progress < 0 || task.progress > 100) {
      return { valid: false, error: 'Invalid task: progress must be 0-100' };
    }
    if (!Array.isArray(task.dependencies)) {
      return { valid: false, error: 'Invalid task: dependencies must be array' };
    }
  }
  
  // Validate projects
  if (!Array.isArray(payload.projects)) {
    return { valid: false, error: 'Projects must be an array' };
  }
  
  for (const project of payload.projects) {
    if (!project.id || !project.name) {
      return { valid: false, error: 'Invalid project: missing id or name' };
    }
  }
  
  // Size check
  const size = JSON.stringify(payload).length;
  if (size > 10 * 1024 * 1024) {
    return { valid: false, error: 'Payload too large (max 10MB)' };
  }
  
  return { valid: true };
}

// ============================================
// BACKUP MANAGEMENT
// ============================================

async function createBackup(state) {
  if (!CONFIG.BACKUP_ENABLED) return;
  
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
    await fs.writeFile(backupFile, JSON.stringify(state, null, 2));
    Logger.info(`Backup created: ${backupFile}`);
    
    // Clean old backups
    cleanOldBackups();
  } catch (error) {
    Logger.error('Backup creation failed', { error: error.message });
  }
}

async function cleanOldBackups() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const now = Date.now();
    const maxAge = CONFIG.BACKUP_RETENTION * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      const filepath = path.join(BACKUP_DIR, file);
      const stat = await fs.stat(filepath);
      if (now - stat.mtime.getTime() > maxAge) {
        await fs.unlink(filepath);
        Logger.info(`Deleted old backup: ${file}`);
      }
    }
  } catch (error) {
    Logger.error('Backup cleanup failed', { error: error.message });
  }
}

// ============================================
// FILE OPERATIONS
// ============================================

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    Logger.error('Failed to create data directory', { error: error.message });
    throw error;
  }
}

async function readStateFile() {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const state = JSON.parse(raw);
    Logger.debug('State file read successfully', { taskCount: state.tasks?.length || 0 });
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') {
      Logger.info('State file not found, using defaults');
      return DEFAULT_STATE;
    }
    Logger.error('Failed to read state file', { error: error.message });
    throw error;
  }
}

async function writeStateFile(state) {
  try {
    await ensureDataDir();
    // Validate before writing
    const validation = validatePayload(state);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }
    
    // Create backup before overwriting
    await createBackup(state);
    
    const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');
      await fs.rename(tempFile, DATA_FILE);
    } catch (writeError) {
      await fs.rm(tempFile, { force: true }).catch(() => {});
      throw writeError;
    }
    Logger.info('State file written successfully', { taskCount: state.tasks?.length || 0 });
  } catch (error) {
    Logger.error('Failed to write state file', { error: error.message });
    throw error;
  }
}

// ============================================
// DATA INTEGRITY
// ============================================

async function cleanOrphanedData(state) {
  if (!state.tasks || !state.projects) return state;
  
  const projectIds = new Set(state.projects.map(p => p.id));
  const beforeCount = state.tasks.length;
  
  state.tasks = state.tasks.filter(t => !t.projectId || projectIds.has(t.projectId));
  
  const taskIds = new Set(state.tasks.map(task => task.id).filter(Boolean));
  state.tasks.forEach(task => {
    task.dependencies = Array.isArray(task.dependencies)
      ? [...new Set(task.dependencies)].filter(dep => taskIds.has(dep) && dep !== task.id)
      : [];
  });
  
  const afterCount = state.tasks.length;
  if (beforeCount !== afterCount) {
    Logger.warn('Orphaned data cleaned', { removed: beforeCount - afterCount });
  }
  
  return state;
}

// ============================================
// MIDDLEWARE
// ============================================

// Request logging
app.use((req, res, next) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    Logger.debug(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration,
      ip: clientIp
    });
  });
  
  next();
});

// Rate limiting
app.use((req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  if (!RateLimiter.check(clientIp)) {
    Logger.warn('Rate limit exceeded', { ip: clientIp, path: req.path });
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Body parser with strict validation
app.use(express.json({ limit: CONFIG.MAX_PAYLOAD_SIZE, strict: true }));
app.use((req, res, next) => {
  const requestedPath = decodeURIComponent(req.path).replace(/^\/+/, '');
  if (requestedPath.startsWith('data/') || PRIVATE_STATIC_PATHS.has(requestedPath)) {
    return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  }
  next();
});
app.use(express.static(path.join(__dirname)));

// ============================================
// API ROUTES
// ============================================

app.get('/api/state', async (req, res) => {
  try {
    let state = await readStateFile();
    state = await cleanOrphanedData(state);
    res.json(state);
  } catch (error) {
    Logger.error('GET /api/state failed', { error: error.message });
    res.status(500).json({ error: 'Failed to load state', code: 'LOAD_FAILED' });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    const validation = validatePayload(req.body);
    if (!validation.valid) {
      Logger.warn('Invalid payload received', { error: validation.error });
      return res.status(400).json({ error: validation.error, code: 'INVALID_PAYLOAD' });
    }
    
    const payload = req.body;
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    const projectIds = new Set(projects.map(p => p.id));
    
    let tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const beforeCount = tasks.length;
    tasks = tasks.filter(t => !t.projectId || projectIds.has(t.projectId));
    
    const taskIds = new Set(tasks.map(task => task.id).filter(Boolean));
    tasks.forEach(task => {
      task.dependencies = Array.isArray(task.dependencies)
        ? [...new Set(task.dependencies)].filter(dep => taskIds.has(dep) && dep !== task.id)
        : [];
    });
    
    const state = {
      tasks,
      projects,
      sheetsSettings: payload.sheetsSettings || null,
      cardLocks: payload.cardLocks || {},
      dynamicKPIs: payload.dynamicKPIs || {},
      summaryTitle: payload.summaryTitle || 'Project Summary'
    };
    
    await writeStateFile(state);
    res.json({ success: true, tasksCount: state.tasks.length, projectsCount: state.projects.length });
  } catch (error) {
    Logger.error('POST /api/state failed', { error: error.message });
    res.status(500).json({ error: 'Failed to save state', code: 'SAVE_FAILED' });
  }
});

app.post('/api/share', async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid share payload', code: 'INVALID_PAYLOAD' });
    }

    pruneExpiredShares();
    const shareId = crypto.randomUUID();
    sharedViews.set(shareId, { payload: body, expiresAt: Date.now() + SHARE_TTL_MS });
    pruneExpiredShares();
    res.json({ success: true, shareId, expiresInMs: SHARE_TTL_MS });
  } catch (error) {
    Logger.error('POST /api/share failed', { error: error.message });
    res.status(500).json({ error: 'Failed to create share link', code: 'SHARE_FAILED' });
  }
});

app.get('/api/share/:id', (req, res) => {
  const sharedData = getSharePayload(req.params.id);
  if (!sharedData) {
    return res.status(404).json({ error: 'Shared view not found or expired', code: 'NOT_FOUND' });
  }
  res.json(sharedData);
});

app.post('/api/sheets/fetch', async (req, res) => {
  try {
    const { url, gid, sheetName } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Google Sheets URL is required', code: 'INVALID_URL' });
    }

    const info = extractGoogleSheetInfo(url);
    let fetchUrl;
    if (info.hasCsvExport) {
      const separator = info.trimmedUrl.includes('?') ? '&' : '?';
      fetchUrl = info.trimmedUrl;
      if (gid && !/[?&]gid=/.test(info.trimmedUrl)) {
        fetchUrl += `${separator}gid=${gid}`;
      }
    } else if (info.isPublishedCsv && info.publishedId) {
      fetchUrl = `https://docs.google.com/spreadsheets/d/e/${info.publishedId}/pub?output=csv`;
      if (gid) fetchUrl += `&gid=${gid}`;
    } else if (gid) {
      fetchUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/export?format=csv&gid=${gid}`;
    } else if (sheetName) {
      fetchUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    } else {
      fetchUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/export?format=csv`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'CITIBIM-Dashboard/1.0 (+http://citibim.com)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Sheet not found', code: 'NOT_FOUND' });
      }
      return res.status(response.status).json({ error: `Google Sheets fetch error: ${response.statusText}` });
    }

    const csvData = await response.text();
    if (!csvData || csvData.trim().length === 0) {
      return res.status(400).json({ error: 'Google Sheets returned empty data', code: 'EMPTY_DATA' });
    }
    if (/^\s*</.test(csvData)) {
      return res.status(403).json({ error: 'Unable to access this sheet. The sheet may be restricted.', code: 'ACCESS_DENIED' });
    }

    res.json({ success: true, csvData, csvUrl: fetchUrl });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Google Sheets request timed out', code: 'TIMEOUT' });
    }
    Logger.error('POST /api/sheets/fetch failed', { error: error.message });
    if (isGoogleSheetsInputError(error)) {
      return res.status(400).json({ error: error.message, code: 'INVALID_URL' });
    }
    res.status(500).json({ error: 'Failed to fetch Google Sheet data', code: 'FETCH_FAILED' });
  }
});

app.post('/api/sheets/tabs', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Google Sheets URL is required', code: 'INVALID_URL' });
    }

    const info = extractGoogleSheetInfo(url);
    if (info.isPublishedCsv) {
      return res.json({ success: true, tabs: [{ id: info.publishedId || 'published_csv', name: 'Published CSV', gid: info.gid || null, published: true }] });
    }
    if (!info.actualSheetId) {
      throw new Error('Could not parse the sheet ID');
    }

    const feedUrl = `https://spreadsheets.google.com/feeds/worksheets/${info.actualSheetId}/public/basic?alt=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(feedUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'CITIBIM-Dashboard/1.0 (+http://citibim.com)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        return res.status(404).json({ 
          error: 'Sheet tabs not found. The sheet may not be published to web. Please publish it first: File → Share → Publish to web → CSV', 
          code: 'SHEET_NOT_PUBLISHED' 
        });
      }
      return res.status(response.status).json({ error: `Google Sheets tabs fetch error: ${response.statusText}` });
    }

    const data = await response.json();
    const entries = data.feed?.entry || [];
    const tabs = entries.map(entry => {
      const title = entry.title?.$t || 'Sheet';
      const alternateLink = (entry.link || []).find(link => /#alternate$/.test(link.rel) || link.rel === 'alternate');
      const href = alternateLink?.href || '';
      const gid = href ? new URL(href).searchParams.get('gid') || (href.match(/gid=(\d+)/)?.[1]) : null;
      return { id: entry.id?.$t || title, name: title, gid };
    });

    res.json({ success: true, tabs });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Google Sheets tabs request timed out', code: 'TIMEOUT' });
    }
    Logger.error('POST /api/sheets/tabs failed', { error: error.message });
    if (isGoogleSheetsInputError(error)) {
      return res.status(400).json({ error: error.message, code: 'INVALID_URL' });
    }
    res.status(500).json({ error: 'Failed to load sheet tabs', code: 'FETCH_FAILED' });
  }
});

app.post('/api/cleanup', async (req, res) => {
  try {
    let state = await readStateFile();
    const beforeCount = state.tasks?.length || 0;
    state = await cleanOrphanedData(state);
    const afterCount = state.tasks?.length || 0;
    
    if (beforeCount !== afterCount) {
      await writeStateFile(state);
    }
    
    res.json({ success: true, orphanedTasksRemoved: beforeCount - afterCount });
  } catch (error) {
    Logger.error('POST /api/cleanup failed', { error: error.message });
    res.status(500).json({ error: 'Cleanup failed', code: 'CLEANUP_FAILED' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const state = await readStateFile();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      tasks: state.tasks?.length || 0,
      projects: state.projects?.length || 0
    });
  } catch (error) {
    Logger.error('Health check failed', { error: error.message });
    res.status(503).json({ status: 'degraded', error: error.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  Logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

const shareCleanupTimer = setInterval(pruneExpiredShares, Math.min(SHARE_TTL_MS, 60 * 60 * 1000));
shareCleanupTimer.unref?.();

// ============================================
// SERVER STARTUP
// ============================================

async function startup() {
  try {
    await ensureDataDir();
    Logger.info('Data directory ready');
    
    // Validate state file on startup
    const state = await readStateFile();
    await cleanOrphanedData(state);
    
    app.listen(PORT, () => {
      Logger.info(`Server running on port ${PORT}`, { environment: process.env.NODE_ENV || 'development' });
    });
  } catch (error) {
    Logger.error('Startup failed', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  Logger.warn('SIGTERM received, starting graceful shutdown');
  process.exit(0);
});

process.on('SIGINT', async () => {
  Logger.warn('SIGINT received, starting graceful shutdown');
  process.exit(0);
});

startup();
