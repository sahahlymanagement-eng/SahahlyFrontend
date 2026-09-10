import { useState } from 'react';
import { api } from '../api.js';

export default function MarkingGuidance({ exam, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const value = draft ?? exam.extraGuidance ?? '';
  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      const next = await api.saveGuidance(exam.id, value);
      onSaved(next); setDraft(null); setMessage('Saved — included with every paper in new Instant and Batch runs.');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <section className="panel">
    <h2>Extra marking guidance</h2>
    <p className="muted small">Add instructions for the AI to use alongside this index and the student papers. Save before starting marking. Changes apply to new runs; existing runs keep their saved guidance.</p>
    <textarea aria-label="Extra marking guidance" rows={4} maxLength={10000} value={value} disabled={saving}
      style={{ width: '100%', boxSizing: 'border-box', margin: '12px 0' }}
      placeholder="For example: Accept equivalent scientific wording. Explain missing answers clearly."
      onChange={e => { setDraft(e.target.value); setMessage(''); }} />
    <button type="button" onClick={save} disabled={saving || draft === null}>{saving ? 'Saving…' : 'Save guidance'}</button>
    {draft !== null && !saving && <p className="muted small">Unsaved guidance — save it before marking.</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error} Try saving again.</p>}
  </section>;
}
