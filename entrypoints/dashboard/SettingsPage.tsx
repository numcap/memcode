import { useState, type ChangeEvent } from 'react';
import { exportData, importData, saveSettings } from '@/lib/storage';
import type { Settings } from '@/lib/types';
import { useCards, useSettings } from './hooks';
import { SyncPanel } from './SyncPanel';

export function SettingsPage() {
  const [settings, setSettings] = useSettings();
  const { cards } = useCards();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  if (!settings) return <div className="page-loading">Loading…</div>;

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const onExport = async () => {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remcode-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: `Exported ${data.cards.length} cards.` });
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = await importData(JSON.parse(await file.text()));
      setMessage({
        kind: 'ok',
        text: `Imported: ${result.added} added, ${result.updated} updated, ${result.skipped} unchanged.`,
      });
    } catch (err) {
      setMessage({ kind: 'error', text: `Import failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="panel">
        <h2>Scheduling</h2>
        <label className="setting">
          <div>
            <div className="setting-title">Target retention: {Math.round(settings.retention * 100)}%</div>
            <div className="setting-help">
              How likely you should be to remember a problem when it comes up. Higher means more frequent reviews.
              90% is a good default.
            </div>
          </div>
          <input
            type="range"
            min={0.8}
            max={0.97}
            step={0.01}
            value={settings.retention}
            onChange={(e) => update({ retention: Number(e.target.value) })}
          />
        </label>
        <label className="setting">
          <div>
            <div className="setting-title">Maximum reviews per day</div>
            <div className="setting-help">Extra due cards wait until tomorrow. Set to 0 for no limit.</div>
          </div>
          <input
            className="input number"
            type="number"
            min={0}
            max={999}
            value={settings.maxReviewsPerDay}
            onChange={(e) => update({ maxReviewsPerDay: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
        </label>
        <label className="setting">
          <div>
            <div className="setting-title">Hide topics until reveal</div>
            <div className="setting-help">Topic tags like "Two Pointers" give away the pattern you're trying to recall.</div>
          </div>
          <input
            type="checkbox"
            checked={settings.hideTagsOnFront}
            onChange={(e) => update({ hideTagsOnFront: e.target.checked })}
          />
        </label>
      </section>

      <section className="panel">
        <h2>Capture</h2>
        <p className="setting-help">
          Ask how hard a problem was as soon as a submission is accepted. The Save to ReMCode button stays available either
          way.
        </p>
        {(['leetcode', 'neetcode'] as const).map((site) => (
          <label className="setting" key={site}>
            <div className="setting-title">Prompt on {site === 'leetcode' ? 'LeetCode' : 'NeetCode'}</div>
            <input
              type="checkbox"
              checked={settings.autoPrompt[site]}
              onChange={(e) => update({ autoPrompt: { ...settings.autoPrompt, [site]: e.target.checked } })}
            />
          </label>
        ))}
      </section>

      <SyncPanel />

      <section className="panel">
        <h2>Your data</h2>
        <p className="setting-help">
          Your deck lives in this browser ({cards?.length ?? 0} cards), plus your GitHub repository if sync is on. Export a
          backup now and then, or to move to another browser without sync. Importing merges by problem, and the copy
          changed more recently wins.
        </p>
        <div className="data-actions">
          <button type="button" className="mc-btn" onClick={onExport}>
            Export JSON
          </button>
          <label className="mc-btn">
            Import JSON
            <input type="file" accept="application/json,.json" hidden onChange={onImport} />
          </label>
        </div>
        {message && <p className={message.kind === 'error' ? 'error' : 'success'}>{message.text}</p>}
      </section>
    </div>
  );
}
