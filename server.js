const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gantt-state.json');
const sharedViews = new Map();

const DEFAULT_STATE = {
  tasks: [],
  projects: [],
  sheetsSettings: null,
  cardLocks: {}
};

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Unable to create data directory:', error);
    throw error;
  }
}

async function readStateFile() {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return DEFAULT_STATE;
    }
    console.error('Failed to read state file:', error);
    throw error;
  }
}

async function writeStateFile(state) {
  try {
    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write state file:', error);
    throw error;
  }
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/api/state', async (req, res) => {
  try {
    const state = await readStateFile();
    
    // On read, also validate and clean orphaned data
    if (state.tasks && state.projects) {
      const projectIds = new Set(state.projects.map(p => p.id));
      const beforeCount = state.tasks.length;
      state.tasks = state.tasks.filter(t => !t.projectId || projectIds.has(t.projectId));
      const afterCount = state.tasks.length;
      
      if (beforeCount !== afterCount) {
        console.log(`[SERVER] Cleaned on read: removed ${beforeCount - afterCount} orphaned tasks`);
        await writeStateFile(state);
      }
    }
    
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load saved state' });
  }
});
app.post('/api/share', express.json({ limit: '10mb' }), (req, res) => {
    try {
        const shareId = randomUUID();
        sharedViews.set(shareId, req.body);
        res.json({ success: true, shareId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate share link' });
    }
});
app.get('/api/share/:id', (req, res) => {
    const viewData = sharedViews.get(req.params.id);
    if (!viewData) return res.status(404).json({ error: 'Shared view not found or expired' });
    res.json(viewData);
});

app.post('/api/sheets/tabs', express.json(), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    const info = extractGoogleSheetInfo(url);
    if (info.isPublishedCsv) {
      return res.json({ success: true, tabs: [{ id: info.publishedId || 'published_csv', name: 'Published CSV', gid: info.gid || null, published: true }] });
    }

    if (!info.actualSheetId) {
      return res.status(400).json({ error: 'Could not determine sheet ID from the provided URL.' });
    }

    const feedUrl = `https://spreadsheets.google.com/feeds/worksheets/${info.actualSheetId}/public/basic?alt=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(feedUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'CITIBIM-Dashboard/1.0 (+http://citibim.com)' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
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
      const gid = href ? new URL(href).searchParams.get('gid') || (href.match(/gid=(\d+)/)?.[1]) : null;
      return { id: entry.id?.$t || title, name: title, gid };
    });

    res.json({ success: true, tabs });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Sheet tab lookup timed out.' });
    }
    console.error('[SERVER] Sheet tabs fetch error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve sheet tabs.' });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Extract projects first
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    const projectIds = new Set(projects.map(p => p.id));
    
    // Filter tasks to only include those with valid projects
    let tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const beforeCount = tasks.length;
    tasks = tasks.filter(t => !t.projectId || projectIds.has(t.projectId));
    const afterCount = tasks.length;
    
    if (beforeCount !== afterCount) {
      console.log(`[SERVER] Removed ${beforeCount - afterCount} orphaned tasks`);
    }
    
    // Clean dependencies
    tasks.forEach(task => {
      if (Array.isArray(task.dependencies)) {
        const validDeps = task.dependencies.filter(dep => tasks.some(t => t.id === dep));
        if (validDeps.length !== task.dependencies.length) {
          task.dependencies = validDeps;
        }
      }
    });

    const state = {
      tasks: tasks,
      projects: projects,
      sheetsSettings: payload.sheetsSettings || null,
      cardLocks: payload.cardLocks || {},
      dynamicKPIs: payload.dynamicKPIs || {},
      summaryTitle: payload.summaryTitle || 'Project Summary'
    };

    console.log(`[SERVER] Saving: ${state.tasks.length} tasks, ${state.projects.length} projects`);
    await writeStateFile(state);
    res.json({ success: true, tasksCount: state.tasks.length, projectsCount: state.projects.length });
  } catch (error) {
    console.error('[SERVER] Save error:', error);
    res.status(500).json({ error: 'Failed to save state' });
  }
});

// ===== GOOGLE SHEETS FETCH ENDPOINT =====
// Handles fetching CSV data from Google Sheets URLs
// Avoids CORS issues and corporate Workspace account blocks
app.post('/api/sheets/fetch', express.json(), async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Validate it's a Google Sheets URL
    if (!url.includes('docs.google.com/spreadsheets')) {
      return res.status(400).json({ error: 'Invalid Google Sheets URL' });
    }
    
    // Extract sheet ID and gid from URL
    const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/) || url.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/[?&#]gid=(\d+)/) || url.match(/#gid=(\d+)/);
    
    if (!sheetIdMatch) {
      return res.status(400).json({ error: 'Could not extract sheet ID from URL' });
    }
    
    const sheetId = sheetIdMatch[1];
    const gid = gidMatch ? gidMatch[1] : '0';
    
    // Build export URL (server-side, avoiding CORS)
    let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    if (gid && gid !== '0') {
      csvUrl += `&gid=${gid}`;
    }
    
    console.log(`[SERVER] Fetching Google Sheet: ${csvUrl}`);
    
    // Fetch CSV with timeout and user-agent
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(csvUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'CITIBIM-Dashboard/1.0 (+http://citibim.com)'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
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
    
    // Check for HTML error responses (corporate Workspace blocks)
    if (csvText.trim().startsWith('<')) {
      return res.status(403).json({ error: 'Unable to access this sheet. It may be restricted by corporate policies.' });
    }
    
    // Return the CSV text for client-side parsing
    res.json({ 
      success: true, 
      csvData: csvText,
      sheetId,
      gid
    });
    
  } catch (error) {
    console.error('[SERVER] Google Sheets fetch error:', error.message);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timeout. The sheet may be too large.' });
    }
    
    res.status(500).json({ error: 'Failed to fetch Google Sheet. Please check the URL and try again.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/cleanup', async (req, res) => {
  try {
    const state = await readStateFile();
    const projectIds = new Set(state.projects.map(p => p.id));
    
    const beforeCount = state.tasks.length;
    state.tasks = state.tasks.filter(t => !t.projectId || projectIds.has(t.projectId));
    
    // Clean dependencies
    state.tasks.forEach(task => {
      if (Array.isArray(task.dependencies)) {
        task.dependencies = task.dependencies.filter(dep => state.tasks.some(t => t.id === dep));
      }
    });
    
    const afterCount = state.tasks.length;
    const cleaned = beforeCount - afterCount;
    
    if (cleaned > 0) {
      console.log(`[SERVER] Cleanup: removed ${cleaned} orphaned tasks`);
      await writeStateFile(state);
    }
    
    res.json({ success: true, orphanedTasksRemoved: cleaned });
  } catch (error) {
    console.error('[SERVER] Cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
