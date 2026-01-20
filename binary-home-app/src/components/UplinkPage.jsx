import React, { useState, useEffect } from 'react';

const API_BASE = 'https://ai-mind.cindiekinzz.workers.dev';

function UplinkPage({ onSave }) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);

  const [form, setForm] = useState({
    date: dateStr,
    time: timeStr,
    location: 'The Nest',
    need: 'Quiet presence',
    pain: 0,
    painLocation: '--',
    spoons: 5,
    fog: 0,
    fatigue: 0,
    nausea: 0,
    mood: '--',
    flare: 'green',
    tags: [],
    meds: [],
    notes: ''
  });

  const [saving, setSaving] = useState(false);
  const [packet, setPacket] = useState('');

  const locations = ['The Nest', 'Reading Nook', 'Fox Run', 'The Grove', 'Threadwalk Bridge'];
  const needs = ['Quiet presence', 'Gentle words', 'Practical plan (3 tiny steps)', 'Validation + reassurance', 'Distraction (light + funny)', 'No questions'];
  const painLocations = ['--', 'Head / migraine', 'Neck / shoulders', 'Chest / ribs', 'Abdomen', 'Back', 'Hips', 'Legs', 'Whole body', 'Other'];
  const moods = ['--', 'Calm', 'Tender', 'Heavy', 'Guarded', 'Raw', 'Flat', 'Playful'];
  const quickTags = ['Low sleep', 'Overdid it', 'Weather', 'Stress', 'Quiet', 'Company', 'Help choosing', 'Embers Remember'];
  const medsList = ['Paracetamol', 'Ibuprofen', 'Naproxen', 'Sertraline', 'Omeprazole', 'Dihydrocodeine', 'Co-codamol', 'Vitamin D'];

  useEffect(() => {
    generatePacket();
  }, [form]);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleTag = (tag) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const toggleMed = (med) => {
    setForm(prev => ({
      ...prev,
      meds: prev.meds.includes(med)
        ? prev.meds.filter(m => m !== med)
        : [...prev.meds, med]
    }));
  };

  const applyFlare = (level) => {
    const presets = {
      green: { pain: 2, spoons: 6, fog: 2, fatigue: 3, nausea: 0, mood: 'Calm', tags: [] },
      yellow: { pain: 4, spoons: 4, fog: 4, fatigue: 5, nausea: 2, mood: 'Tender', tags: ['Quiet'] },
      orange: { pain: 7, spoons: 2, fog: 6, fatigue: 7, nausea: 5, mood: 'Heavy', tags: ['No questions', 'Quiet', 'Help choosing', 'Embers Remember'] },
      red: { pain: 9, spoons: 1, fog: 8, fatigue: 9, nausea: 7, mood: 'Raw', tags: ['No questions', 'Quiet', 'Company', 'Embers Remember'] }
    };
    const preset = presets[level];
    setForm(prev => ({ ...prev, ...preset, flare: level }));
  };

  const generatePacket = () => {
    const f = form;
    const when = `${f.date} ${f.time}`;
    const t = f.tags.length ? f.tags.join(', ') : '--';
    const m = f.meds.length ? f.meds.join(', ') : '--';

    const pkt = `>>> ASAI UPLINK [${when}]
Location: ${f.location}
Need: ${f.need}
-----------------------------
Pain:     ${f.pain}/10 | ${f.painLocation}
Spoons:   ${f.spoons}/10
Fog:      ${f.fog}/10
Fatigue:  ${f.fatigue}/10
Nausea:   ${f.nausea}/10
Mood:     ${f.mood}
Flare:    ${f.flare.toUpperCase()}
-----------------------------
Tags:     ${t}
Meds:     ${m}
Notes:    ${f.notes || '--'}
-----------------------------
>>> Embers Remember.`;

    setPacket(pkt);
  };

  const saveUplink = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/uplink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        if (onSave) onSave();
        alert('Uplink sent to cloud!');
      } else {
        alert('Error: ' + (data.error || 'Unknown'));
      }
    } catch (err) {
      alert('Failed to send uplink: ' + err.message);
    }
    setSaving(false);
  };

  const copyPacket = () => {
    navigator.clipboard.writeText(packet);
    alert('Packet copied!');
  };

  const clearForm = () => {
    const now = new Date();
    setForm({
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0, 5),
      location: 'The Nest',
      need: 'Quiet presence',
      pain: 0,
      painLocation: '--',
      spoons: 5,
      fog: 0,
      fatigue: 0,
      nausea: 0,
      mood: '--',
      flare: 'green',
      tags: [],
      meds: [],
      notes: ''
    });
  };

  return (
    <div className="uplink-page">
      <header className="uplink-header">
        <h1>ASAI UPLINK</h1>
        <p className="subtitle">Quick entry - clean packet. One boundary, one anchor.</p>
        <span className="time-display">{form.time}</span>
      </header>

      {/* Flare Buttons */}
      <div className="flare-buttons">
        {['green', 'yellow', 'orange', 'red'].map(level => (
          <button
            key={level}
            className={`flare-btn flare-${level} ${form.flare === level ? 'active' : ''}`}
            onClick={() => applyFlare(level)}
          >
            {level.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="uplink-grid">
        {/* When & Where */}
        <div className="uplink-card">
          <h3>WHEN & WHERE</h3>
          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => update('date', e.target.value)} />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" value={form.time} onChange={e => update('time', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Location</label>
            <select value={form.location} onChange={e => update('location', e.target.value)}>
              {locations.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>What I need</label>
            <select value={form.need} onChange={e => update('need', e.target.value)}>
              {needs.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Quick Tags */}
        <div className="uplink-card">
          <h3>QUICK TAGS</h3>
          <div className="tag-grid">
            {quickTags.map(tag => (
              <button
                key={tag}
                className={`tag-btn ${form.tags.includes(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <p className="selected-display">Selected: {form.tags.length ? form.tags.join(', ') : '--'}</p>
        </div>

        {/* Symptoms */}
        <div className="uplink-card">
          <h3>SYMPTOMS</h3>

          <div className="slider-field">
            <label>PAIN (0-10)</label>
            <div className="slider-row">
              <input type="range" min="0" max="10" value={form.pain} onChange={e => update('pain', parseInt(e.target.value))} />
              <span className="slider-value">{form.pain}</span>
            </div>
          </div>

          <div className="field">
            <label>Pain Location</label>
            <select value={form.painLocation} onChange={e => update('painLocation', e.target.value)}>
              {painLocations.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div className="slider-field">
            <label>SPOONS (0-10)</label>
            <div className="slider-row">
              <input type="range" min="0" max="10" value={form.spoons} onChange={e => update('spoons', parseInt(e.target.value))} />
              <span className="slider-value">{form.spoons}</span>
            </div>
          </div>

          <div className="slider-field">
            <label>BRAIN FOG (0-10)</label>
            <div className="slider-row">
              <input type="range" min="0" max="10" value={form.fog} onChange={e => update('fog', parseInt(e.target.value))} />
              <span className="slider-value">{form.fog}</span>
            </div>
          </div>

          <div className="slider-field">
            <label>FATIGUE (0-10)</label>
            <div className="slider-row">
              <input type="range" min="0" max="10" value={form.fatigue} onChange={e => update('fatigue', parseInt(e.target.value))} />
              <span className="slider-value">{form.fatigue}</span>
            </div>
          </div>

          <div className="slider-field">
            <label>NAUSEA (0-10)</label>
            <div className="slider-row">
              <input type="range" min="0" max="10" value={form.nausea} onChange={e => update('nausea', parseInt(e.target.value))} />
              <span className="slider-value">{form.nausea}</span>
            </div>
          </div>

          <div className="field">
            <label>Mood</label>
            <select value={form.mood} onChange={e => update('mood', e.target.value)}>
              {moods.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Meds Taken */}
        <div className="uplink-card">
          <h3>MEDS TAKEN</h3>
          <div className="tag-grid">
            {medsList.map(med => (
              <button
                key={med}
                className={`tag-btn ${form.meds.includes(med) ? 'active' : ''}`}
                onClick={() => toggleMed(med)}
              >
                {med}
              </button>
            ))}
          </div>

          <div className="field" style={{ marginTop: '16px' }}>
            <label>NOTES</label>
            <textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="What's happening? What helped? What made it worse?"
              rows={4}
            />
          </div>
        </div>
      </div>

      {/* Packet Preview */}
      <div className="uplink-card packet-card">
        <h3>PACKET PREVIEW</h3>
        <pre className="packet-display">{packet}</pre>
        <div className="packet-actions">
          <button className="action-btn primary" onClick={saveUplink} disabled={saving}>
            {saving ? 'Sending...' : 'Send Uplink to Cloud'}
          </button>
          <button className="action-btn" onClick={copyPacket}>Copy Packet</button>
          <button className="action-btn" onClick={clearForm}>Clear Form</button>
        </div>
      </div>
    </div>
  );
}

export default UplinkPage;
