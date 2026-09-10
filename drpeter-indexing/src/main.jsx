import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { apiRoot } from './workspace.js';
const root = ReactDOM.createRoot(document.getElementById('root'));
async function start() {
  root.render(<p>Loading indexing workspace…</p>);
  try {
    const res = await fetch(`${apiRoot}/session`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
    if (!res.ok) throw new Error((await res.json()).error || 'Sign in with a marking account to open this workspace.');
    setInterval(() => { fetch(`${apiRoot}/session`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }).catch(() => {}); }, 30 * 60 * 1000);
    root.render(<React.StrictMode><App /></React.StrictMode>);
  } catch (err) { root.render(<div role="alert"><p>{err.message}</p><button onClick={start}>Retry</button></div>); }
}
start();
