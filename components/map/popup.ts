// HTML for map popups. Kept separate from the map so it can be unit tested.
import { TRI_REPORTING_YEAR } from './config';

// Escapes text from the data before putting it in popup HTML
export function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(value ?? '').replace(/[&<>"']/g, (c) => entities[c]);
}

// Formats pounds with thousands separators; missing or invalid values show as 0
export function formatLbs(value: unknown): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US');
}

// Popup for a TRI facility, built from the properties in tri-facilities.geojson
export function triPopupHtml(p: Record<string, unknown>): string {
  const chems = p.top_air_chems
    ? `<div style="margin-top: 4px;"><b>Top air chemicals:</b> ${escapeHtml(p.top_air_chems)}</div>`
    : '';

  return `<div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; color: #1e293b;">
    <div style="font-weight: 600; font-size: 13px;">${escapeHtml(p.name)}</div>
    <div style="color: #475569;">${escapeHtml(p.city)}, ${escapeHtml(p.state)} · ${escapeHtml(p.sector)}</div>
    <div style="margin-top: 6px;"><b>Air releases:</b> ${formatLbs(p.air_lbs)} lbs</div>
    <div><b>All on-site releases:</b> ${formatLbs(p.onsite_lbs)} lbs</div>
    ${chems}
    <div style="margin-top: 6px; color: #64748b; font-size: 11px;">EPA TRI, ${TRI_REPORTING_YEAR}</div>
  </div>`;
}
