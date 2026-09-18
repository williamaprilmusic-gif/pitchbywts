import fs from 'node:fs';

const path = 'src/App.tsx';
let source = fs.readFileSync(path, 'utf8');
const appliedMarker = 'PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED';
const consolidatedMarker = 'WTS_WORKSPACE_CONSOLIDATION_APPLIED';

if (source.includes(consolidatedMarker)) {
  console.log('Canonical WTS workspace consolidation detected; preserving the source navigation.');
  process.exit(0);
}

if (source.includes(appliedMarker)) {
  console.log('Pitchline information architecture already applied; skipping duplicate source mutation.');
  process.exit(0);
}

const start = "const roleItems:Array<{tab:Tab;label:string;icon:React.ReactNode;roles:Role[]}>= [";
const end = "];\nfunction canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}";
if (!source.includes(start) || !source.includes(end)) throw new Error('Information architecture nav markers not found');

const groupedConfig = `type RoleNavItem={tab:Tab;label:string;icon:React.ReactNode;roles:Role[]};
type RoleNavGroup={id:string;label:string;roles:Role[];items:RoleNavItem[]};
const roleNavGroups:RoleNavGroup[]=[
  {id:'supporter-main',label:'Follow football',roles:['Supporter','Manager','Club','LFA Admin'],items:[
    {tab:'home',label:'Dashboard',icon:<Home size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},