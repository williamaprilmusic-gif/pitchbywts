import fs from 'node:fs';

const path='src/App.tsx';
let source=fs.readFileSync(path,'utf8');
const marker='PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED';
const groupStart="type RoleNavItem={tab:Tab;label:string;icon:React.ReactNode;roles:Role[]};";
const flatStart="const roleItems:Array<{tab:Tab;label:string;icon:React.ReactNode;roles:Role[]}>= [";
const flatEnd="];\nfunction canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}";

if(source.includes(groupStart)&&source.includes("className='workspace-nav")){
  console.log('Information architecture already canonical.');
  process.exit(0);
}
if(!source.includes(flatStart)||!source.includes(flatEnd)) throw new Error('Information architecture navigation markers not found');

const groupedConfig=`type RoleNavItem={tab:Tab;label:string;icon:React.ReactNode;roles:Role[]};
type RoleNavGroup={id:string;label:string;roles:Role[];items:RoleNavItem[]};
const roleNavGroups:RoleNavGroup[]=[
{id:'football',label:'Football',roles:['Supporter','Manager','Club','LFA Admin'],items:[
{tab:'home',label:'Dashboard',icon:<Home size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
{tab:'fixtures',label:'Fixtures & Results',icon:<CalendarDays size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
{tab:'table',label:'League Table',icon:<Trophy size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
{tab:'live-match',label:'Live Match',icon:<Radio size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},
]},
{id:'team',label:'Team',roles:['Manager'],items:[
{tab:'squad',label:'Squad & Players',icon:<Users size={18}/>,roles:['Manager']},
{tab:'matchday',label:'Matchday',icon:<ClipboardCheck size={18}/>,roles:['Manager']},
{tab:'performance',label:'Performance',icon:<Shield size={18}/>,roles:['Manager']},
{tab:'player-family-system',label:'Players & Families',icon:<Users size={18}/>,roles:['Manager']},
]},
{id:'club',label:'Club',roles:['Club'],items:[
{tab:'club-management',label:'Club Management',icon:<Building2 size={18}/>,roles:['Club']},
{tab:'teams',label:'Teams & Age Groups',icon:<Users size={18}/>,roles:['Club']},
{tab:'player-family-system',label:'Players & Families',icon:<Users size={18}/>,roles:['Club']},
{tab:'finance',label:'Finance',icon:<CircleDollarSign size={18}/>,roles:['Club']},
{tab:'communications',label:'Communications',icon:<Bell size={18}/>,roles:['Club']},
{tab:'reports',label:'Reports',icon:<ClipboardList size={18}/>,roles:['Club']},
]},
{id:'league',label:'League Operations',roles:['LFA Admin'],items:[
{tab:'registration',label:'Clubs & Registration',icon:<UserPlus size={18}/>,roles:['LFA Admin']},
{tab:'officials',label:'Officials',icon:<Users size={18}/>,roles:['LFA Admin']},
{tab:'discipline',label:'Discipline',icon:<ClipboardList size={18}/>,roles:['LFA Admin']},
{tab:'scheduling',label:'Fixtures & Scheduling',icon:<CalendarRange size={18}/>,roles:['LFA Admin']},
{tab:'competition-operations',label:'Competitions',icon:<Trophy size={18}/>,roles:['LFA Admin']},
{tab:'control-tower',label:'Matchday Control Tower',icon:<Trophy size={18}/>,roles:['LFA Admin']},
{tab:'matchday-command',label:'Matchday Command',icon:<Radio size={18}/>,roles:['LFA Admin']},
]},
{id:'governance',label:'Governance',roles:['LFA Admin'],items:[
{tab:'compliance-governance',label:'Compliance & Safeguarding',icon:<Shield size={18}/>,roles:['LFA Admin']},
{tab:'access-management',label:'Access & Settings',icon:<Shield size={18}/>,roles:['LFA Admin']},
]},
{id:'executive',label:'Executive',roles:['LFA Admin'],items:[
{tab:'executive-command',label:'Executive Dashboard',icon:<ClipboardCheck size={18}/>,roles:['LFA Admin']},
]}];
const roleItems=roleNavGroups.flatMap(group=>group.items);
function canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}`;

source=source.slice(0,source.indexOf(flatStart))+groupedConfig+source.slice(source.indexOf(flatEnd)+flatEnd.length);

const stateMarker="const [mobileOpen,setMobileOpen]=useState(false);";
if(!source.includes("const [openNavGroups,setOpenNavGroups]")) source=source.replace(stateMarker,stateMarker+"const [openNavGroups,setOpenNavGroups]=useState<string[]>(['football','team','club','league']);");

const navStart="<nav>{roleItems.filter(item=>item.roles.includes(effectiveRole)).map(item=>";
const navEnd="</nav>";
const ni=source.indexOf(navStart), ei=source.indexOf(navEnd,ni);
if(ni<0||ei<0) throw new Error('Flat navigation render not found');

const nav=String.raw`<nav className='workspace-nav'>{roleNavGroups.filter(group=>group.roles.includes(effectiveRole)).map(group=>{const items=group.items.filter(item=>item.roles.includes(effectiveRole));const open=openNavGroups.includes(group.id);const active=items.some(item=>item.tab===tab);return <div className='nav-group' key={group.id}><button type='button' className={'nav-group-head '+(active?'active':'')} onClick={()=>setOpenNavGroups(groups=>groups.includes(group.id)?groups.filter(id=>id!==group.id):[...groups,group.id])}><span>{group.label}</span><ChevronRight size={14} className={open?'nav-chevron open':''}/></button>{open&&<div className='nav-group-items'>{items.map(item=><Nav key={item.tab} icon={item.icon} label={item.label==='Communications'&&notificationSummary.unread ? item.label+' · '+notificationSummary.unread : item.label} active={tab===item.tab} onClick={()=>navigate(item.tab)}/>)}</div>}</div>})}</nav>`;
source=source.slice(0,ni)+nav+source.slice(ei+navEnd.length);

source=source.replace(/^\/\* PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED \*\/\n?/,'');
source=source.replace(/^\/\* WTS_WORKSPACE_CONSOLIDATION_APPLIED \*\/\n?/,'');
source=`/* ${marker} */\n`+source;
fs.writeFileSync(path,source);
console.log('Information architecture consolidated into six role-based workspaces.');
