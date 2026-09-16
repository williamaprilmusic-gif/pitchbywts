import fs from 'node:fs';

const path = 'src/App.tsx';
let source = fs.readFileSync(path, 'utf8');

const start = "const roleItems:Array<{tab:Tab;label:string;icon:React.ReactNode;roles:Role[]}>= [";
const end = "];\nfunction canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}";
if (!source.includes(start) || !source.includes(end)) throw new Error('Information architecture nav markers not found');

const groupedConfig = `type RoleNavItem={tab:Tab;label:string;icon:React.ReactNode;roles:Role[]};
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
function canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}`;
source = source.slice(0, source.indexOf(start)) + groupedConfig + source.slice(source.indexOf(end) + end.length);

const stateMarker = "const [mobileOpen,setMobileOpen]=useState(false);";
if (!source.includes("const [openNavGroups,setOpenNavGroups]")) {
  source = source.replace(stateMarker, `${stateMarker}const [openNavGroups,setOpenNavGroups]=useState<string[]>(['supporter-main','team','club','lfa-operations']);`);
}

const navStart = "<nav>{roleItems.filter(item=>";
const navEnd = "</nav>";
const navStartIndex = source.indexOf(navStart);
const navEndIndex = navStartIndex >= 0 ? source.indexOf(navEnd, navStartIndex) : -1;
if (navStartIndex < 0 || navEndIndex < 0) throw new Error('Existing flat navigation render not found');
const groupedNavMarkup = `<nav className='workspace-nav'>{roleNavGroups.filter(group=>group.roles.includes(effectiveRole)).map(group=>{const items=group.items.filter(item=>item.roles.includes(effectiveRole));const open=openNavGroups.includes(group.id);const active=items.some(item=>item.tab===tab);return <div className="nav-group" key={group.id}><button type='button' className={\`nav-group-head \${active?'active':''}\`} onClick={()=>setOpenNavGroups(groups=>groups.includes(group.id)?groups.filter(id=>id!==group.id):[...groups,group.id])}><span>{group.label}</span><ChevronRight size={14} className={open?'nav-chevron open':''}/></button>{open&&<div className='nav-group-items'>{items.map(item=><Nav key={item.tab} icon={item.icon} label={item.label==='Communications'&&notificationSummary.unread?\`${item.label} · \${notificationSummary.unread}\`:item.label} active={tab===item.tab} onClick={()=>navigate(item.tab)}/>)}</div>}</div>})}</nav>`;
source = source.slice(0, navStartIndex) + groupedNavMarkup + source.slice(navEndIndex + navEnd.length);

const roleStateReset = "setUserRole('Supporter');setRole('Supporter');setJoinStatus(null);";
if (source.includes(roleStateReset)) {
  source = source.replace(roleStateReset, roleStateReset + "setOpenNavGroups(['supporter-main']);");
}

fs.writeFileSync(path, source);
console.log('Pitchline information architecture grouped by role and collapsible workspace.');
