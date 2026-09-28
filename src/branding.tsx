import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './platformClient';

export type ClubBrand = { id: string; name: string; shortName: string; crest: string; primaryColor: string; secondaryColor: string };
export type LeagueInfo = { name: string; season: string; country: string };
type Branding = { league: LeagueInfo; clubs: ClubBrand[]; refresh: () => Promise<void>; clubForTeam: (team?: string) => ClubBrand | undefined };

const fallbackLeague: LeagueInfo = { name: 'Pitchline League', season: String(new Date().getFullYear()), country: '' };
const BrandingContext = createContext<Branding>({ league: fallbackLeague, clubs: [], refresh: async () => undefined, clubForTeam: () => undefined });

// Same normalisation the API uses to tie teams to clubs: drop an "FC" suffix and a trailing age group.
const clubKey = (value?: string) => String(value || '').toLowerCase().replace(/\s+u[0-9]+$/, '').replace(/\s+fc$/, '').trim();

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [league, setLeague] = useState<LeagueInfo>(fallbackLeague);
  const [clubs, setClubs] = useState<ClubBrand[]>([]);
  const refresh = useCallback(async () => {
    try {
      const result = await api.get('/api/league-settings');
      const data = result.data as { league?: LeagueInfo; clubs?: ClubBrand[] } | null;
      if (data?.league) setLeague(data.league);
      if (Array.isArray(data?.clubs)) setClubs(data.clubs);
    } catch { /* branding is decorative; keep defaults */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo<Branding>(() => {
    const byKey = new Map(clubs.map(club => [clubKey(club.name), club]));
    return { league, clubs, refresh, clubForTeam: team => byKey.get(clubKey(team)) };
  }, [league, clubs, refresh]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);

export function initialsOf(name?: string) {
  return String(name || '').replace(/\s+u[0-9]+$/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';
}

/** Club crest for a team or club name: the uploaded image, or initials on the club colour. */
export function Crest({ team, size = 24, className = '' }: { team?: string; size?: number; className?: string }) {
  const { clubForTeam } = useBranding();
  const club = clubForTeam(team);
  const style: React.CSSProperties = { width: size, height: size, minWidth: size, fontSize: Math.max(9, Math.round(size * 0.38)) };
  if (club?.crest) return <img className={`club-crest ${className}`} src={club.crest} alt={`${club.name} crest`} style={style} />;
  const background = club?.primaryColor || '#e8efe9';
  const color = club?.primaryColor ? (club.secondaryColor || '#ffffff') : '#40524a';
  return <span className={`club-crest club-crest-initials ${className}`} style={{ ...style, background, color }} aria-hidden="true">{initialsOf(club?.name || team)}</span>;
}
