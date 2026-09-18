/* PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, invitesClient, notifications, ws } from './platformClient';
import SeasonControl from './SeasonControl';
import ClubRegistration from './ClubRegistration';
import Finance, { Invoice } from './Finance';
import Communications from './Communications';
import Reports from './Reports';
import PublicPortal from './PublicPortal';
import ClubManagement from './ClubManagement';
import PlayerRegistry from './PlayerRegistry';
import Scheduling from './Scheduling';
import MatchdayCommandCentre from './MatchdayCommandCentre';
import AutomationCentre from './AutomationCentre';
import PredictiveOperations from './PredictiveOperations';
import LiveMatchCentre from './LiveMatchCentre';
import RoleAccessManagement from './RoleAccessManagement';
import LeagueIdentity from './LeagueIdentity';
import ClubOperatingSystem from './ClubOperatingSystem';
import PlayerFamilySystem from './PlayerFamilySystem';
import SafeguardingCompliance from './SafeguardingCompliance';
import ComplianceGovernance from './ComplianceGovernance';
import LeagueExecutiveCommand from './LeagueExecutiveCommand';
import CompetitionPortfolio from './CompetitionPortfolio';
import LeagueWorkflowAutomation from './LeagueWorkflowAutomation';
import LeagueDecisionIntelligence from './LeagueDecisionIntelligence';
import CrossCompetitionControl from './CrossCompetitionControl';
import CompetitionOperations from './CompetitionOperations';
import { Bell, CalendarDays, Check, ChevronRight, CircleDollarSign, ClipboardCheck, ClipboardList, Clock3, GitBranch, Home, LogIn, LogOut, Menu, MessageSquare, Plus, Search, Send, Shield, Sparkles, Trophy, UserPlus, Users, X } from 'lucide-react';
import { Building2 } from 'lucide-react';
import { CalendarRange, Radio } from 'lucide-react';

type Fixture={id:string;home:string;away:string;date:string;time:string;venue:string;status:string;homeScore?:number;awayScore?:number};
type Team={id:string;name:string;ageGroup:string;played:number;won:number;drawn:number;lost:number;gf:number;ga:number;pts:number};
type Player={id:string;name:string;team:string;position:string;number:number;status:string;rating:number;memberRef:string};
type Registration={id:string;name:string;team:string;memberRef:string;status:string};
type Payment={id:string;memberRef:string;item:string;amount:number;status:string};
type Official={id:string;name:string;role:string;availability:string};
type Discipline={id:string;memberRef:string;fixtureId:string;type:string;status:string};
type PortalState={team:string;fixtureId:string|null;availability:string;notifications:boolean;payments:Payment[];announcements:Array<{id:string;message:string;createdAt:number}>};
type Appointment={id:string;fixtureId:string;officialId:string;role:string;status:string};
type Venue={id:string;name:string;location:string;availability:string};
type Performance={id:string;fixtureId:string;playerRef:string;appearance:string;minutes:number;goals:number;assists:number;yellow:number;red:number;saves:number;rating:number;motm:boolean};
type Summary={playerRef:string;apps:number;minutes:number;goals:number;assists:number;ratingSum:number;motm:number;avgRating:number};
type ClubApplication={id:string;clubName:string;area:string;contactRole:string;ageGroups:string[];venue:string;division:string;status:string;requirements:{profile:boolean;teams:boolean;venue:boolean;acceptance:boolean};createdAt:number};
type Tab='home'|'fixtures'|'table'|'squad'|'club'|'teams'|'matchday'|'league'|'officials'|'discipline'|'portal'|'performance'|'intelligence'|'operations'|'competition'|'registration'|'finance'|'communications'|'reports'|'public'|'club-management'|'player-registry'|'scheduling'|'control-tower'|'matchday-command'|'automation'|'predictive'|'live-match'|'access-management'|'league-identity'|'club-operating-system'|'player-family-system'|'safeguarding-compliance'|'compliance-governance'|'decision-intelligence'|'executive-command'|'workflow-automation'|'competition-portfolio'|'cross-competition'|'competition-operations';
type Role='Supporter'|'Manager'|'Club'|'LFA Admin';
type RoleNavItem={tab:Tab;label:string;icon:React.ReactNode;roles:Role[]};
type RoleNavGroup={id:string;label:string;roles:Role[];items:RoleNavItem[]};
const roleNavGroups:RoleNavGroup[]=[
  {id:'supporter-main',label:'Follow football',roles:['Supporter','Manager','Club','LFA Admin'],items:[
    {tab:'home',label:'Dashboard',icon:<Home size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
    {tab:'fixtures',label:'Fixtures & Results',icon:<CalendarDays size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
    {tab:'table',label:'League Table',icon:<Trophy size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
    {tab:'public',label:'League',icon:<Radio size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
    {tab:'live-match',label:'Live Match',icon:<Radio size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
    {tab:'portal',label:'My Portal',icon:<UserPlus size={18}/>,roles:['Supporter','Manager']},
  ]},
  {id:'team',label:'Team workspace',roles:['Manager'],items:[
    {tab:'matchday',label:'Matchday',icon:<ClipboardCheck size={18}/>,roles:['Manager']},
    {tab:'squad',label:'Squad & Players',icon:<Users size={18}/>,roles:['Manager']},
    {tab:'player-family-system',label:'Players & Families',icon:<Users size={18}/>,roles:['Manager']},
    {tab:'performance',label:'Performance',icon:<Shield size={18}/>,roles:['Manager']},
    {tab:'safeguarding-compliance',label:'Safeguarding',icon:<Shield size={18}/>,roles:['Manager']},
  ]},
  {id:'club',label:'Club workspace',roles:['Club'],items:[
    {tab:'club-management',label:'Club Centre',icon:<Building2 size={18}/>,roles:['Club']},
    {tab:'teams',label:'Teams & Age Groups',icon:<Users size={18}/>,roles:['Club']},
    {tab:'player-registry',label:'Player Registry',icon:<UserPlus size={18}/>,roles:['Club']},
    {tab:'player-family-system',label:'Players & Families',icon:<Users size={18}/>,roles:['Club']},
    {tab:'safeguarding-compliance',label:'Safeguarding',icon:<Shield size={18}/>,roles:['Club']},
    {tab:'finance',label:'Finance',icon:<CircleDollarSign size={18}/>,roles:['Club']},
    {tab:'communications',label:'Communications',icon:<Bell size={18}/>,roles:['Club']},
    {tab:'reports',label:'Reports',icon:<ClipboardList size={18}/>,roles:['Club']},
    {tab:'intelligence',label:'Club Intelligence',icon:<Trophy size={18}/>,roles:['Club']},
    {tab:'club',label:'Club Admin',icon:<Shield size={18}/>,roles:['Club']},
    {tab:'club-operating-system',label:'Club Operations',icon:<Building2 size={18}/>,roles:['Club']},
  ]},
  {id:'lfa-operations',label:'League operations',roles:['LFA Admin'],items:[
    {tab:'control-tower',label:'Control Tower',icon:<Trophy size={18}/>,roles:['LFA Admin']},
    {tab:'league',label:'League Office',icon:<Shield size={18}/>,roles:['LFA Admin']},
    {tab:'operations',label:'Operations Desk',icon:<CalendarDays size={18}/>,roles:['LFA Admin']},
    {tab:'officials',label:'Officials',icon:<Users size={18}/>,roles:['LFA Admin']},
    {tab:'discipline',label:'Discipline',icon:<ClipboardList size={18}/>,roles:['LFA Admin']},
    {tab:'matchday-command',label:'Matchday Command',icon:<Radio size={18}/>,roles:['LFA Admin']},
    {tab:'live-match',label:'Live Match',icon:<Radio size={18}/>,roles:['LFA Admin']},
  ]},
  {id:'lfa-competition',label:'Competition management',roles:['LFA Admin'],items:[
    {tab:'competition-portfolio',label:'Competitions',icon:<Trophy size={18}/>,roles:['LFA Admin']},
    {tab:'competition-operations',label:'Competition Operations',icon:<CalendarDays size={18}/>,roles:['LFA Admin']},
    {tab:'competition',label:'Competition Engine',icon:<CalendarDays size={18}/>,roles:['LFA Admin']},
    {tab:'scheduling',label:'Scheduling',icon:<CalendarRange size={18}/>,roles:['LFA Admin']},
    {tab:'registration',label:'Club Registration',icon:<UserPlus size={18}/>,roles:['LFA Admin']},
    {tab:'cross-competition',label:'Competition Control',icon:<GitBranch size={18}/>,roles:['LFA Admin']},
    {tab:'teams',label:'Teams & Age Groups',icon:<Users size={18}/>,roles:['LFA Admin']},
    {tab:'player-registry',label:'Player Registry',icon:<UserPlus size={18}/>,roles:['LFA Admin']},
  ]},
  {id:'lfa-people',label:'People & governance',roles:['LFA Admin'],items:[
    {tab:'club-management',label:'Club Management',icon:<Building2 size={18}/>,roles:['LFA Admin']},
    {tab:'club-operating-system',label:'Club Operations',icon:<Building2 size={18}/>,roles:['LFA Admin']},
    {tab:'player-family-system',label:'Players & Families',icon:<Users size={18}/>,roles:['LFA Admin']},
    {tab:'safeguarding-compliance',label:'Safeguarding',icon:<Shield size={18}/>,roles:['LFA Admin']},
    {tab:'compliance-governance',label:'Compliance & Governance',icon:<Shield size={18}/>,roles:['LFA Admin']},
    {tab:'access-management',label:'Access & Settings',icon:<Shield size={18}/>,roles:['LFA Admin']},
    {tab:'league-identity',label:'League Identity',icon:<GitBranch size={18}/>,roles:['LFA Admin']},
  ]},
  {id:'lfa-intelligence',label:'Intelligence & automation',roles:['LFA Admin'],items:[
    {tab:'intelligence',label:'Club Intelligence',icon:<Trophy size={18}/>,roles:['LFA Admin']},
    {tab:'automation',label:'Automation',icon:<Sparkles size={18}/>,roles:['LFA Admin']},
    {tab:'predictive',label:'Smart Insights',icon:<Sparkles size={18}/>,roles:['LFA Admin']},
    {tab:'decision-intelligence',label:'Decision Support',icon:<Sparkles size={18}/>,roles:['LFA Admin']},
    {tab:'executive-command',label:'Executive Dashboard',icon:<ClipboardCheck size={18}/>,roles:['LFA Admin']},
    {tab:'workflow-automation',label:'Workflows',icon:<Sparkles size={18}/>,roles:['LFA Admin']},
    {tab:'communications',label:'Communications',icon:<Bell size={18}/>,roles:['LFA Admin']},
    {tab:'reports',label:'Reports',icon:<ClipboardList size={18}/>,roles:['LFA Admin']},
  ]},
];
const roleItems=roleNavGroups.flatMap(group=>group.items);
function canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}const roleItems:Array<{tab:Tab;label:string;icon:React.ReactNode;roles:Role[]}>= [
  // Public/supporter surface: keep the primary football experience small and obvious.
  {tab:'home',label:'Dashboard',icon:<Home size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
  {tab:'fixtures',label:'Fixtures & Results',icon:<CalendarDays size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
  {tab:'table',label:'League Table',icon:<Trophy size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
  {tab:'public',label:'League',icon:<Radio size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
  {tab:'live-match',label:'Live Match',icon:<Radio size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
  {tab:'portal',label:'My Portal',icon:<UserPlus size={18}/>,roles:['Supporter','Manager']},

  // Team/club surface: capabilities are grouped instead of exposed as separate admin products.
  {tab:'squad',label:'Squad & Players',icon:<Users size={18}/>,roles:['Manager','Club','LFA Admin']},
  {tab:'matchday',label:'Matchday',icon:<ClipboardCheck size={18}/>,roles:['Manager','Club','LFA Admin']},
  {tab:'performance',label:'Performance',icon:<Shield size={18}/>,roles:['Manager','Club','LFA Admin']},
  {tab:'club',label:'Club Dashboard',icon:<Shield size={18}/>,roles:['Club','LFA Admin']},
  {tab:'club-management',label:'Club Management',icon:<Building2 size={18}/>,roles:['Club','LFA Admin']},
  {tab:'player-family-system',label:'Players & Families',icon:<Users size={18}/>,roles:['Manager','Club','LFA Admin']},
  {tab:'teams',label:'Teams & Age Groups',icon:<Users size={18}/>,roles:['Club','LFA Admin']},
  {tab:'finance',label:'Finance',icon:<CircleDollarSign size={18}/>,roles:['Club','LFA Admin']},
  {tab:'communications',label:'Communications',icon:<Bell size={18}/>,roles:['Club','LFA Admin']},
  {tab:'reports',label:'Reports',icon:<ClipboardList size={18}/>,roles:['Club','LFA Admin']},

  // League administration: one coherent operations layer rather than many overlapping control screens.
  {tab:'registration',label:'Clubs & Registration',icon:<UserPlus size={18}/>,roles:['LFA Admin']},
  {tab:'officials',label:'Officials',icon:<Users size={18}/>,roles:['LFA Admin']},
  {tab:'discipline',label:'Discipline',icon:<ClipboardList size={18}/>,roles:['LFA Admin']},
  {tab:'scheduling',label:'Fixtures & Scheduling',icon:<CalendarRange size={18}/>,roles:['LFA Admin']},
  {tab:'competition-operations',label:'Competitions',icon:<Trophy size={18}/>,roles:['LFA Admin']},
  {tab:'control-tower',label:'Matchday Control Tower',icon:<Trophy size={18}/>,roles:['LFA Admin']},
  {tab:'matchday-command',label:'Matchday Command',icon:<Radio size={18}/>,roles:['LFA Admin']},
  {tab:'compliance-governance',label:'Compliance & Safeguarding',icon:<Shield size={18}/>,roles:['LFA Admin']},
  {tab:'executive-command',label:'Executive Dashboard',icon:<ClipboardCheck size={18}/>,roles:['LFA Admin']},
  {tab:'access-management',label:'Access & Settings',icon:<Shield size={18}/>,roles:['LFA Admin']},
];
function canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}
