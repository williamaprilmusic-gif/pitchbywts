import { useEffect, useState } from 'react';
import { api } from './platformClient';
import { getSelectedCompetition, setSelectedCompetition } from './competitionSelection';

type Option = { id: string; name: string; season?: string };

/** Header select (not a workspace) for Supporters and the Site Admin. Hidden unless more than one competition exists. */
export default function CompetitionSelector({ isSiteAdmin, role }: { isSiteAdmin: boolean; role: string }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [value, setValue] = useState(getSelectedCompetition());
  const eligible = isSiteAdmin || role === 'Supporter';
  useEffect(() => {
    if (!eligible) { setOptions([]); return; }
    let live = true;
    const path = isSiteAdmin ? '/api/admin/competitions' : '/api/competitions';
    void api.get<{ competitions?: Option[] }>(path).then(r => { if (live) setOptions(Array.isArray(r.data?.competitions) ? r.data!.competitions! : []); }).catch(() => { if (live) setOptions([]); });
    return () => { live = false; };
  }, [eligible, isSiteAdmin]);
  if (!eligible || options.length < 2) return null;
  const current = options.some(o => o.id === value) ? value : '';
  return <label className='competition-selector'><span>Competition</span><select value={current} aria-label='Choose competition' onChange={e => { setSelectedCompetition(e.target.value); setValue(e.target.value); window.location.reload(); }}><option value=''>All competitions</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}{o.season ? ` · ${o.season}` : ''}</option>)}</select></label>;
}
