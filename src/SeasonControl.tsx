import { Trophy, Shield, CalendarDays } from 'lucide-react';

type Team = {
    id: string;
    name: string;
    ageGroup: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    pts: number;
};

type Fixture = {
    id: string;
    home: string;
    away: string;
    date: string;
    time: string;
    venue: string;
    status: string;
    homeScore?: number;
    awayScore?: number;
};

export default function SeasonControl({ teams, fixtures }: { teams: Team[]; fixtures: Fixture[] }) {
    const divisions = Array.from(new Set(teams.map(team => team.ageGroup))).sort();
    const completed = fixtures.filter(fixture => fixture.status === 'completed').length;
    const upcoming = fixtures.filter(fixture => fixture.status === 'upcoming').length;
    return (
        <section className='card' style={{ marginTop: 18 }}>
            <div className='card-head'>
                <div>
                    <span className='label'>SEASON CONTROL</span>
                    <h2>Competition readiness</h2>
                </div>
                <Trophy size={19} />
            </div>
            <div className='stats-grid'>
                <div className='card stat'><div className='stat-icon'><CalendarDays size={18} /></div><div><span>Results complete</span><strong>{completed}</strong><small>{upcoming} fixtures still scheduled</small></div></div>
                <div className='card stat'><div className='stat-icon'><Shield size={18} /></div><div><span>Divisions</span><strong>{divisions.length}</strong><small>age-group competition bands</small></div></div>
            </div>
            <div className='league-table'>
                <div className='table-row table-head'><span>Division</span><span>Leader</span><span>Top target</span><span>Bottom target</span></div>
                {divisions.map(division => {
                    const ranked = teams.filter(team => team.ageGroup === division).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
                    return (
                        <div className='table-row' key={division}>
                            <b>{division}</b>
                            <span>{ranked[0]?.name || '—'}</span>
                            <span className='status green'>Promotion review</span>
                            <span className='status amber'>Relegation review</span>
                        </div>
                    );
                })}
            </div>
            <div className='roadmap-items' style={{ marginTop: 14 }}>
                <span>Verify results</span>
                <span>Resolve discipline</span>
                <span>Confirm postponed fixtures</span>
                <span>Lock final table</span>
                <span>Publish season outcome</span>
            </div>
        </section>
    );
}
