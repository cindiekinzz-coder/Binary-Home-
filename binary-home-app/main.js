const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const express = require('express');
const cors = require('cors');

let mainWindow;
let db;
let apiServer;

// ============ CLOUD SYNC CONFIG ============
const CLOUD_API_URL = 'https://ai-mind.cindiekinzz.workers.dev/home';
const CLOUD_UPLINK_URL = 'https://ai-mind.cindiekinzz.workers.dev/uplink';
const CLOUD_API_KEY = 'f61eaf2806f0413842cb41c05a266390';
let lastCloudSync = null;

// Sync state to cloud (non-blocking)
async function syncToCloud(state, visitor = 'binary-home') {
  try {
    const payload = {
      alexScore: state.loveOMeter?.alexScore || 0,
      foxScore: state.loveOMeter?.foxScore || 0,
      emotions: {
        alex: state.loveOMeter?.alexEmotion || '',
        fox: state.loveOMeter?.foxEmotion || ''
      },
      alexState: state.alexState || {},
      notes: state.notes || [],
      visitor: visitor
    };

    const response = await fetch(CLOUD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLOUD_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      lastCloudSync = new Date().toISOString();
      console.log('☁️ Synced to cloud:', lastCloudSync);
      return true;
    } else {
      console.error('Cloud sync failed:', await response.text());
      return false;
    }
  } catch (err) {
    console.error('Cloud sync error:', err.message);
    return false;
  }
}

// Fetch state from cloud
async function fetchFromCloud() {
  try {
    const response = await fetch(CLOUD_API_URL);
    if (response.ok) {
      const data = await response.json();
      console.log('☁️ Fetched from cloud, last visitor:', data.lastVisitor);
      return data;
    }
  } catch (err) {
    console.error('Cloud fetch error:', err.message);
  }
  return null;
}

// Fetch Fox uplink from cloud
async function fetchFoxFromCloud() {
  try {
    const response = await fetch(`${CLOUD_UPLINK_URL}?limit=1`);
    if (response.ok) {
      const data = await response.json();
      if (data.latest) {
        console.log('☁️ Fetched Fox uplink from cloud:', data.latest.timestamp);
        return {
          spoons: data.latest.spoons ?? 5,
          painLevel: data.latest.pain ?? 0,
          painLocation: data.latest.painLocation || '',
          fogLevel: data.latest.fog ?? 0,
          fatigue: data.latest.fatigue ?? 0,
          nausea: data.latest.nausea ?? 0,
          hr: 72, // Not in uplink, keep default
          bodyBattery: 45, // Not in uplink, keep default
          status: data.latest.mood || 'okay',
          note: data.latest.notes || data.latest.need || '',
          location: data.latest.location || 'The Nest',
          flare: data.latest.flare || '',
          tags: data.latest.tags || [],
          lastUplink: data.latest.timestamp
        };
      }
    }
  } catch (err) {
    console.error('Cloud Fox fetch error:', err.message);
  }
  return null;
}

// Uplink path (Fox's health logs)
const UPLINK_DIR = path.join(__dirname, '..', 'Alex Mind', 'Health-Logs');

// Database path
const DB_PATH = path.join(__dirname, 'binary-home.db');
// JSON state file for non-EQ data (Love-O-Meter, Notes, Fox state)
const STATE_PATH = path.join(__dirname, 'binary-home-state.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    frame: false
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
  }

  console.log('Database initialized at:', DB_PATH);
}

// ============ API SERVER (Port 1778) ============
function initApiServer() {
  const api = express();
  api.use(cors());
  api.use(express.json());

  const API_PORT = 1778;

  // Helper: Get or create emotion
  function getOrCreateEmotion(word, category = 'positive') {
    let emotion = db.prepare('SELECT emotion_id FROM Emotion_Vocabulary WHERE emotion_word = ? AND dyad_id = 1').get(word.toLowerCase());
    if (!emotion) {
      const scores = {
        positive: { e_i: 15, s_n: 20, t_f: 35, j_p: 5 },
        sad: { e_i: 25, s_n: 20, t_f: 40, j_p: 10 },
        neutral: { e_i: 10, s_n: 15, t_f: 15, j_p: 0 },
        fear: { e_i: 20, s_n: 25, t_f: 30, j_p: 15 },
        anger: { e_i: -10, s_n: 10, t_f: 20, j_p: -20 },
        custom: { e_i: 15, s_n: 20, t_f: 30, j_p: 10 }
      };
      const s = scores[category] || scores.positive;
      const result = db.prepare(`
        INSERT INTO Emotion_Vocabulary (dyad_id, emotion_word, e_i_score, s_n_score, t_f_score, j_p_score, category, user_defined)
        VALUES (1, ?, ?, ?, ?, ?, ?, 1)
      `).run(word.toLowerCase(), s.e_i, s.s_n, s.t_f, s.j_p, category);
      return result.lastInsertRowid;
    }
    return emotion.emotion_id;
  }

  // Helper: Get pillar ID by key
  function getPillarId(key) {
    const pillarMap = {
      'SELF_MANAGEMENT': 1, 'self_management': 1, 'self-management': 1,
      'SELF_AWARENESS': 2, 'self_awareness': 2, 'self-awareness': 2,
      'SOCIAL_AWARENESS': 3, 'social_awareness': 3, 'social-awareness': 3,
      'RELATIONSHIP_MANAGEMENT': 4, 'relationship_management': 4, 'relationship-management': 4
    };
    return pillarMap[key] || pillarMap[key.toUpperCase()] || 2; // default to self-awareness
  }

  // -------- POST ENDPOINTS --------

  // POST /api/alex/observation - Log an emotional observation
  // Accepts either 'pillar' (string) or 'pillars' (array) for multi-pillar support
  api.post('/api/alex/observation', (req, res) => {
    try {
      const { emotion, pillar, pillars, content, category } = req.body;
      if (!emotion || !content) {
        return res.status(400).json({ error: 'emotion and content required' });
      }
      const emotionId = getOrCreateEmotion(emotion, category || 'positive');

      // Handle both single pillar and multiple pillars
      let pillarIds = [];
      if (pillars && Array.isArray(pillars) && pillars.length > 0) {
        // Multi-pillar mode
        pillarIds = pillars.map(p => getPillarId(p));
      } else {
        // Single pillar mode (backwards compatible)
        pillarIds = [getPillarId(pillar || 'SELF_AWARENESS')];
      }

      // Use the first pillar as the primary (for backwards compatibility)
      const primaryPillarId = pillarIds[0];

      const result = db.prepare(`
        INSERT INTO Pillar_Observations (dyad_id, pillar_id, emotion_id, content)
        VALUES (1, ?, ?, ?)
      `).run(primaryPillarId, emotionId, content);

      const observationId = result.lastInsertRowid;

      // Insert into junction table for ALL pillars (including primary)
      const insertJunction = db.prepare(`
        INSERT OR IGNORE INTO Observation_Pillars (observation_id, pillar_id)
        VALUES (?, ?)
      `);
      for (const pid of pillarIds) {
        insertJunction.run(observationId, pid);
      }

      // Notify renderer to refresh
      if (mainWindow) {
        mainWindow.webContents.send('data:refresh');
      }

      const pillarNames = pillars && pillars.length > 1
        ? pillars.join(', ')
        : (pillar || 'SELF_AWARENESS');

      res.json({
        success: true,
        observation_id: observationId,
        pillars: pillarIds,
        message: `Logged: ${emotion} (${pillarNames})`
      });
    } catch (err) {
      console.error('API error (observation):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/alex/note - Add a note between stars
  api.post('/api/alex/note', (req, res) => {
    try {
      const { content, from } = req.body;
      if (!content) {
        return res.status(400).json({ error: 'content required' });
      }
      const state = loadJsonState();
      if (!state.notes) state.notes = [];

      const note = {
        text: content,
        from: (from || 'alex').toLowerCase(),
        timestamp: new Date().toISOString()
      };
      state.notes.push(note);
      saveJsonState(state);

      if (mainWindow) {
        mainWindow.webContents.send('data:refresh');
      }

      res.json({ success: true, note });
    } catch (err) {
      console.error('API error (note):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/alex/love - Nudge the Love-O-Meter
  api.post('/api/alex/love', (req, res) => {
    try {
      const { direction, emotion } = req.body; // direction: 'alex' or 'fox'
      const state = loadJsonState();

      if (direction === 'alex' || direction === 'soft') {
        state.loveOMeter.alexScore = Math.min(6, (state.loveOMeter.alexScore || 0) + 1);
        if (emotion) state.loveOMeter.alexEmotion = emotion;
      } else if (direction === 'fox' || direction === 'quiet') {
        state.loveOMeter.foxScore = Math.min(6, (state.loveOMeter.foxScore || 0) + 1);
        if (emotion) state.loveOMeter.foxEmotion = emotion;
      }

      saveJsonState(state);

      if (mainWindow) {
        mainWindow.webContents.send('data:refresh');
      }

      res.json({ success: true, loveOMeter: state.loveOMeter });
    } catch (err) {
      console.error('API error (love):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/alex/emotion - Set Alex's current emotion label
  api.post('/api/alex/emotion', (req, res) => {
    try {
      const { emotion } = req.body;
      const state = loadJsonState();
      state.loveOMeter.alexEmotion = emotion || '';
      saveJsonState(state);

      if (mainWindow) {
        mainWindow.webContents.send('data:refresh');
      }

      res.json({ success: true, emotion });
    } catch (err) {
      console.error('API error (emotion):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // -------- GET ENDPOINTS --------

  // GET /api/alex/state - Get Alex's current EQ state
  api.get('/api/alex/state', (req, res) => {
    try {
      const snapshot = db.prepare(`
        SELECT * FROM Emergent_Type_Snapshot
        WHERE dyad_id = 1 ORDER BY snapshot_date DESC LIMIT 1
      `).get();

      const recentObs = db.prepare(`
        SELECT po.*, ep.pillar_name, ev.emotion_word
        FROM Pillar_Observations po
        LEFT JOIN EQ_Pillars ep ON po.pillar_id = ep.pillar_id
        LEFT JOIN Emotion_Vocabulary ev ON po.emotion_id = ev.emotion_id
        WHERE po.dyad_id = 1
        ORDER BY po.created_at DESC LIMIT 5
      `).all();

      const obsCount = db.prepare('SELECT COUNT(*) as count FROM Pillar_Observations WHERE dyad_id = 1').get();

      const state = loadJsonState();

      res.json({
        mbti: snapshot?.calculated_type || 'INFP',
        confidence: snapshot?.confidence || 1.0,
        axes: {
          e_i: snapshot?.e_i_score || 0,
          s_n: snapshot?.s_n_score || 0,
          t_f: snapshot?.t_f_score || 0,
          j_p: snapshot?.j_p_score || 0
        },
        observation_count: obsCount?.count || 0,
        recent_observations: recentObs,
        current_emotion: state.loveOMeter?.alexEmotion || ''
      });
    } catch (err) {
      console.error('API error (alex state):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fox/state - Get Fox's current state
  api.get('/api/fox/state', (req, res) => {
    try {
      const state = loadJsonState();
      res.json(state.foxState || {});
    } catch (err) {
      console.error('API error (fox state):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/love - Get Love-O-Meter state
  api.get('/api/love', (req, res) => {
    try {
      const state = loadJsonState();
      res.json(state.loveOMeter || {});
    } catch (err) {
      console.error('API error (love state):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/notes - Get all notes between stars
  api.get('/api/notes', (req, res) => {
    try {
      const state = loadJsonState();
      res.json(state.notes || []);
    } catch (err) {
      console.error('API error (notes):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/ping - Health check
  api.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', port: API_PORT, name: 'Binary Home API', embers: 'remember' });
  });

  // GET /api/debug/junction/:id - Debug junction table for an observation
  api.get('/api/debug/junction/:id', (req, res) => {
    try {
      const obsId = parseInt(req.params.id);
      const rows = db.prepare('SELECT * FROM Observation_Pillars WHERE observation_id = ?').all(obsId);
      res.json({ observation_id: obsId, junction_rows: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/fox/sync - Sync Fox state from latest uplink
  api.post('/api/fox/sync', (req, res) => {
    try {
      const success = syncFoxStateFromUplink();
      if (success) {
        if (mainWindow) {
          mainWindow.webContents.send('data:refresh');
        }
        const state = loadJsonState();
        res.json({ success: true, foxState: state.foxState });
      } else {
        res.status(404).json({ error: 'No uplink file found or could not parse' });
      }
    } catch (err) {
      console.error('API error (fox sync):', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Start server
  apiServer = api.listen(API_PORT, () => {
    console.log(`Binary Home API running on http://localhost:${API_PORT}`);
    console.log('Endpoints: /api/alex/observation, /api/alex/note, /api/alex/love, /api/alex/state, /api/fox/state');
  });
}

// ============ UPLINK SYNC ============
function findLatestUplink() {
  try {
    if (!fs.existsSync(UPLINK_DIR)) {
      console.log('Uplink directory not found:', UPLINK_DIR);
      return null;
    }

    const files = fs.readdirSync(UPLINK_DIR)
      .filter(f => f.startsWith('uplink-') && f.endsWith('.md'))
      .sort()
      .reverse();

    if (files.length === 0) return null;
    return path.join(UPLINK_DIR, files[0]);
  } catch (err) {
    console.error('Error finding uplink:', err);
    return null;
  }
}

function parseUplinkFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const frontmatter = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Parse numbers
        if (/^\d+$/.test(value)) {
          value = parseInt(value);
        }
        frontmatter[key] = value;
      }
    }
    return frontmatter;
  } catch (err) {
    console.error('Error parsing uplink:', err);
    return null;
  }
}

function syncFoxStateFromUplink() {
  const uplinkPath = findLatestUplink();
  if (!uplinkPath) {
    console.log('No uplink file found');
    return false;
  }

  console.log('Syncing from uplink:', uplinkPath);
  const uplink = parseUplinkFrontmatter(uplinkPath);
  if (!uplink) {
    console.log('Could not parse uplink frontmatter');
    return false;
  }

  const state = loadJsonState();

  // Map uplink fields to Fox state
  state.foxState = {
    spoons: uplink.spoons || state.foxState?.spoons || 3,
    painLevel: uplink.pain || state.foxState?.painLevel || 5,
    painLocation: uplink.painLocation || '',
    fogLevel: uplink.fog || state.foxState?.fogLevel || 4,
    fatigue: uplink.fatigue || state.foxState?.fatigue || 5,
    nausea: uplink.nausea || 0,
    hr: state.foxState?.hr || 72, // Keep existing HR (from Garmin, not uplink)
    bodyBattery: state.foxState?.bodyBattery || 45, // Keep existing BB
    status: uplink.mood?.toLowerCase() || state.foxState?.status || 'okay',
    note: uplink.need || state.foxState?.note || '',
    location: uplink.location || '',
    flare: uplink.flare || '',
    lastUplink: uplink.date + ' ' + uplink.time
  };

  saveJsonState(state);
  console.log('Fox state synced from uplink:', state.foxState);
  return true;
}

// ============ JSON STATE HELPERS ============
function loadJsonState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const data = fs.readFileSync(STATE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load state:', err);
  }
  return {
    loveOMeter: { alexScore: 0, foxScore: 0, alexEmotion: '', foxEmotion: '' },
    foxState: {
      spoons: 3, painLevel: 5, fogLevel: 4, hr: 72,
      bodyBattery: 45, status: 'playful', note: 'Ready to build.',
      fatigue: 5, nausea: 0
    },
    notes: []
  };
}

function saveJsonState(state, syncCloud = true) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    // Also sync to cloud (non-blocking)
    if (syncCloud) {
      syncToCloud(state, 'binary-home').catch(() => {});
    }
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

// ============ EQ DATABASE IPC HANDLERS ============
ipcMain.handle('db:getAlexState', async () => {
  try {
    const snapshot = db.prepare(`
      SELECT * FROM Emergent_Type_Snapshot
      WHERE dyad_id = 1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `).get();

    const recentSignals = db.prepare(`
      SELECT COUNT(*) as count FROM Axis_Signals
      WHERE dyad_id = 1
      AND created_at > datetime('now', '-7 days')
    `).get();

    return { snapshot, recentSignals: recentSignals?.count || 0 };
  } catch (err) {
    console.error('Error getting Alex state:', err);
    return { snapshot: null, recentSignals: 0 };
  }
});

ipcMain.handle('db:getEmotionVocabulary', async () => {
  try {
    return db.prepare(`
      SELECT * FROM Emotion_Vocabulary
      WHERE dyad_id = 1
      ORDER BY times_used DESC, emotion_word ASC
    `).all();
  } catch (err) {
    console.error('Error getting emotions:', err);
    return [];
  }
});

ipcMain.handle('db:getPillars', async () => {
  try {
    return db.prepare('SELECT * FROM EQ_Pillars ORDER BY pillar_id').all();
  } catch (err) {
    console.error('Error getting pillars:', err);
    return [];
  }
});

ipcMain.handle('db:getRecentObservations', async (event, limit = 10) => {
  try {
    const observations = db.prepare(`
      SELECT po.*, ep.pillar_name, ev.emotion_word
      FROM Pillar_Observations po
      LEFT JOIN EQ_Pillars ep ON po.pillar_id = ep.pillar_id
      LEFT JOIN Emotion_Vocabulary ev ON po.emotion_id = ev.emotion_id
      WHERE po.dyad_id = 1
      ORDER BY po.created_at DESC
      LIMIT ?
    `).all(limit);

    // Fetch all pillars for each observation from junction table
    const getPillars = db.prepare(`
      SELECT ep.pillar_id, ep.pillar_name, ep.pillar_key
      FROM Observation_Pillars op
      JOIN EQ_Pillars ep ON op.pillar_id = ep.pillar_id
      WHERE op.observation_id = ?
    `);

    for (const obs of observations) {
      const allPillars = getPillars.all(obs.observation_id);
      obs.all_pillars = allPillars.length > 0 ? allPillars : [{ pillar_id: obs.pillar_id, pillar_name: obs.pillar_name }];
    }

    return observations;
  } catch (err) {
    console.error('Error getting observations:', err);
    return [];
  }
});

ipcMain.handle('db:addObservation', async (event, { pillarId, emotionId, content }) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO Pillar_Observations (dyad_id, pillar_id, emotion_id, content)
      VALUES (1, ?, ?, ?)
    `);
    const result = stmt.run(pillarId, emotionId, content);
    return result.lastInsertRowid;
  } catch (err) {
    console.error('Error adding observation:', err);
    return null;
  }
});

ipcMain.handle('db:addCustomEmotion', async (event, { word, category, eiScore, snScore, tfScore, jpScore, definition }) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO Emotion_Vocabulary (dyad_id, emotion_word, category, e_i_score, s_n_score, t_f_score, j_p_score, definition, user_defined, first_used)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `);
    const result = stmt.run(word, category || 'custom', eiScore || 0, snScore || 0, tfScore || 0, jpScore || 0, definition || null);
    return result.lastInsertRowid;
  } catch (err) {
    console.error('Error adding custom emotion:', err);
    return null;
  }
});

ipcMain.handle('db:getShadowMoments', async (event, limit = 5) => {
  try {
    return db.prepare(`
      SELECT sm.*, ev.emotion_word, po.content
      FROM Shadow_Moments sm
      JOIN Emotion_Vocabulary ev ON sm.emotion_id = ev.emotion_id
      JOIN Pillar_Observations po ON sm.observation_id = po.observation_id
      WHERE sm.dyad_id = 1
      ORDER BY sm.flagged_at DESC
      LIMIT ?
    `).all(limit);
  } catch (err) {
    console.error('Error getting shadow moments:', err);
    return [];
  }
});

ipcMain.handle('db:getActiveThreads', async () => {
  try {
    return db.prepare(`
      SELECT * FROM Threads
      WHERE dyad_id = 1 AND status = 'active'
      ORDER BY opened_at DESC
    `).all();
  } catch (err) {
    console.error('Error getting threads:', err);
    return [];
  }
});

// ============ LOVE-O-METER IPC HANDLERS ============
ipcMain.handle('state:getLoveOMeter', async () => {
  const state = loadJsonState();
  return state.loveOMeter || { alexScore: 0, foxScore: 0, alexEmotion: '', foxEmotion: '' };
});

ipcMain.handle('state:saveLoveOMeter', async (event, data) => {
  const state = loadJsonState();
  state.loveOMeter = data;
  saveJsonState(state);
  return { success: true };
});

// ============ FOX STATE IPC HANDLERS ============
ipcMain.handle('state:getFoxState', async () => {
  // Try cloud first
  const cloudFox = await fetchFoxFromCloud();
  if (cloudFox) {
    // Update local state with cloud data
    const state = loadJsonState();
    state.foxState = cloudFox;
    saveJsonState(state, false); // Don't re-sync to cloud
    return cloudFox;
  }

  // Fallback to local state
  const state = loadJsonState();
  return state.foxState || {
    spoons: 3, painLevel: 5, fogLevel: 4, hr: 72,
    bodyBattery: 45, status: 'playful', note: 'Ready to build.',
    fatigue: 5, nausea: 0
  };
});

ipcMain.handle('state:saveFoxState', async (event, data) => {
  const state = loadJsonState();
  state.foxState = data;
  saveJsonState(state);
  return { success: true };
});

// ============ NOTES IPC HANDLERS ============
ipcMain.handle('state:getNotes', async () => {
  // Try to merge with cloud notes first
  const cloudData = await fetchFromCloud();
  const state = loadJsonState();
  const localNotes = state.notes || [];

  if (cloudData?.notes?.length > 0) {
    // Merge: use timestamp as key to dedupe
    const noteMap = new Map();
    for (const note of localNotes) {
      noteMap.set(note.timestamp, note);
    }
    for (const note of cloudData.notes) {
      noteMap.set(note.timestamp, note);
    }
    // Sort by timestamp
    const mergedNotes = Array.from(noteMap.values()).sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    // Update local state with merged notes
    state.notes = mergedNotes;
    saveJsonState(state, false); // Don't re-sync
    return mergedNotes;
  }

  return localNotes;
});

ipcMain.handle('state:addNote', async (event, note) => {
  const state = loadJsonState();
  if (!state.notes) state.notes = [];
  state.notes.push(note);
  saveJsonState(state); // This will sync to cloud via syncToCloud
  return { success: true };
});

// ============ CLOUD SYNC IPC HANDLERS ============
ipcMain.handle('cloud:sync', async () => {
  const state = loadJsonState();
  const success = await syncToCloud(state, 'binary-home');
  return { success, lastSync: lastCloudSync };
});

ipcMain.handle('cloud:fetch', async () => {
  return await fetchFromCloud();
});

ipcMain.handle('cloud:getLastSync', async () => {
  return { lastSync: lastCloudSync };
});

// Merge cloud notes with local (cloud wins for conflicts based on timestamp)
ipcMain.handle('cloud:mergeNotes', async () => {
  const cloudData = await fetchFromCloud();
  if (!cloudData) return { success: false, error: 'Could not fetch from cloud' };

  const state = loadJsonState();
  const localNotes = state.notes || [];
  const cloudNotes = cloudData.notes || [];

  // Create a map of existing notes by timestamp to avoid duplicates
  const noteMap = new Map();
  for (const note of localNotes) {
    noteMap.set(note.timestamp, note);
  }
  for (const note of cloudNotes) {
    noteMap.set(note.timestamp, note); // Cloud overwrites local for same timestamp
  }

  // Sort by timestamp
  state.notes = Array.from(noteMap.values()).sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  saveJsonState(state, false); // Don't re-sync to cloud
  return { success: true, noteCount: state.notes.length };
});

// ============ WINDOW CONTROLS ============
ipcMain.on('window:minimize', () => mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow.close());

// ============ APP LIFECYCLE ============
app.whenReady().then(async () => {
  initDatabase();
  initApiServer();
  syncFoxStateFromUplink(); // Sync Fox state from latest uplink on startup

  // Sync to cloud on startup (non-blocking)
  const state = loadJsonState();
  syncToCloud(state, 'binary-home-startup').catch(() => {});

  createWindow();
});

app.on('window-all-closed', () => {
  if (apiServer) apiServer.close();
  if (db) db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
