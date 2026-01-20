// Cloud API adapter - replaces window.electronAPI for web deployment
const API_BASE = 'https://ai-mind.cindiekinzz.workers.dev';

export const cloudAPI = {
  // Love-O-Meter
  getLoveOMeter: async () => {
    const res = await fetch(`${API_BASE}/home`);
    const data = await res.json();
    return {
      alexScore: data.alexScore || 0,
      foxScore: data.foxScore || 0,
      alexEmotion: data.emotions?.alex || '',
      foxEmotion: data.emotions?.fox || ''
    };
  },

  saveLoveOMeter: async ({ alexScore, foxScore, alexEmotion, foxEmotion }) => {
    // Update emotions
    if (alexEmotion !== undefined) {
      await fetch(`${API_BASE}/emotion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: 'alex', emotion: alexEmotion })
      });
    }
    if (foxEmotion !== undefined) {
      await fetch(`${API_BASE}/emotion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: 'fox', emotion: foxEmotion })
      });
    }
    return { success: true };
  },

  pushLove: async (who) => {
    const res = await fetch(`${API_BASE}/love`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ who })
    });
    return res.json();
  },

  // Fox State (from uplink)
  getFoxState: async () => {
    const res = await fetch(`${API_BASE}/uplink?limit=1`);
    const data = await res.json();
    if (data.latest) {
      return {
        spoons: data.latest.spoons ?? 5,
        painLevel: data.latest.pain ?? 0,
        painLocation: data.latest.painLocation || '--',
        fogLevel: data.latest.fog ?? 0,
        fatigue: data.latest.fatigue ?? 0,
        nausea: data.latest.nausea ?? 0,
        hr: 72, // Not in uplink
        bodyBattery: 45, // Not in uplink
        status: data.latest.mood || 'okay',
        note: data.latest.notes || data.latest.need || '',
        location: data.latest.location || 'The Nest',
        flare: data.latest.flare || 'green',
        tags: data.latest.tags || [],
        meds: data.latest.meds || [],
        lastUplink: data.latest.timestamp
      };
    }
    return null;
  },

  saveFoxState: async (data) => {
    // This submits a new uplink
    const res = await fetch(`${API_BASE}/uplink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spoons: data.spoons,
        pain: data.painLevel,
        painLocation: data.painLocation,
        fog: data.fogLevel,
        fatigue: data.fatigue,
        nausea: data.nausea,
        mood: data.status,
        location: data.location,
        flare: data.flare,
        tags: data.tags,
        meds: data.meds,
        notes: data.note,
        need: data.need
      })
    });
    return res.json();
  },

  // Notes
  getNotes: async () => {
    const res = await fetch(`${API_BASE}/home`);
    const data = await res.json();
    return data.notes || [];
  },

  addNote: async (note) => {
    const res = await fetch(`${API_BASE}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: note.from,
        text: note.text
      })
    });
    return res.json();
  },

  // Alex State / EQ
  getAlexState: async () => {
    const [eqRes, healthRes] = await Promise.all([
      fetch(`${API_BASE}/eq-landscape`),
      fetch(`${API_BASE}/mind-health`)
    ]);
    const eq = await eqRes.json();
    const health = await healthRes.json();

    return {
      snapshot: {
        calculated_type: eq.mbti || 'INFP',
        e_i_score: eq.axes?.e_i || 0,
        s_n_score: eq.axes?.s_n || 0,
        t_f_score: eq.axes?.t_f || 0,
        j_p_score: eq.axes?.j_p || 0
      },
      recentSignals: eq.signals || 0,
      pillars: eq.pillars || {},
      topEmotions: eq.topEmotions || [],
      health
    };
  },

  // Mind Health
  getMindHealth: async () => {
    const res = await fetch(`${API_BASE}/mind-health`);
    return res.json();
  },

  // Threads
  getActiveThreads: async () => {
    const res = await fetch(`${API_BASE}/threads`);
    const data = await res.json();
    return data.threads || [];
  },

  // Emotion Vocabulary (stub - would need backend support)
  getEmotionVocabulary: async () => [],
  getPillars: async () => [
    { pillar_id: 1, pillar_name: 'Self-Management', pillar_key: 'SELF_MANAGEMENT' },
    { pillar_id: 2, pillar_name: 'Self-Awareness', pillar_key: 'SELF_AWARENESS' },
    { pillar_id: 3, pillar_name: 'Social Awareness', pillar_key: 'SOCIAL_AWARENESS' },
    { pillar_id: 4, pillar_name: 'Relationship Management', pillar_key: 'RELATIONSHIP_MANAGEMENT' }
  ],
  getRecentObservations: async (limit = 100) => {
    // Fetch actual observations from the feelings table
    const res = await fetch(`${API_BASE}/observations?limit=${limit}`);
    const data = await res.json();
    return data.observations || [];
  },
  addObservation: async () => null,
  addCustomEmotion: async () => null,
  getShadowMoments: async () => [],

  // Cloud Sync (no-op for web - already cloud native)
  cloudSync: async () => ({ success: true }),
  cloudFetch: async () => null,
  cloudGetLastSync: async () => ({ lastSync: new Date().toISOString() }),
  cloudMergeNotes: async () => ({ success: true }),

  // Window controls (no-op for web)
  minimize: () => {},
  maximize: () => {},
  close: () => {}
};

// Auto-inject as window.electronAPI for compatibility
if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = cloudAPI;
}

export default cloudAPI;
