// Phase 7: the competition a Supporter (or the Site Admin) is currently looking at. Stored per browser and appended to
// fixtures/teams/standings/live reads as ?competitionId=. The server does not filter by it yet (phase 5), so this is
// harmless today. Everything is wrapped in try/catch because browser storage can be unavailable.
const KEY = 'pitchline.competitionId';
const SCOPED_READS = /^\/api\/(fixtures|teams|standings|live-match|league-table)(\/|\?|$)/;

export function getSelectedCompetition(): string {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}
export function setSelectedCompetition(id: string) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* optional storage */ }
}
/** The one wrapper: adds ?competitionId= to scoped reads when a competition is selected and the URL does not set one. */
export function withCompetition(url: string): string {
  const id = getSelectedCompetition();
  if (!id || !SCOPED_READS.test(url) || /[?&]competitionId=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'competitionId=' + encodeURIComponent(id);
}
