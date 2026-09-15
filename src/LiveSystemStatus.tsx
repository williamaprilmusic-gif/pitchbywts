import { useEffect, useState } from 'react';
import { Activity, CircleOff } from 'lucide-react';
import { api } from './platformClient';

export default function LiveSystemStatus(){
  const [state,setState]=useState<'checking'|'live'|'offline'>('checking');
  const [checkedAt,setCheckedAt]=useState<number|null>(null);
  useEffect(()=>{
    let disposed=false;
    const check=async()=>{
      try{await api.get('/api/health');if(!disposed){setState('live');setCheckedAt(Date.now())}}
      catch{if(!disposed){setState('offline');setCheckedAt(Date.now())}}
    };
    void check();
    const id=window.setInterval(check,30000);
    return()=>{disposed=true;window.clearInterval(id)};
  },[]);
  const label=state==='live'?'LIVE DATA':state==='offline'?'OFFLINE':'CHECKING';
  const detail=checkedAt?`checked ${new Date(checkedAt).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})}`:'checking service';
  return <div className={`system-status ${state}`} title={`Pitchline service ${state}`} aria-label={`Pitchline service ${state}`}><span className='system-status-icon'>{state==='offline'?<CircleOff size={13}/>:<Activity size={13}/>}</span><span><b>{label}</b><small>{detail}</small></span><style>{`.system-status{position:fixed;left:265px;top:18px;display:flex;align-items:center;gap:7px;padding:5px 8px;border:1px solid #dfe8e3;border-radius:8px;background:#fff;z-index:11;box-shadow:0 2px 8px rgba(16,34,26,.04);font-size:9px}.system-status b,.system-status small{display:block}.system-status b{font-size:9px;letter-spacing:.05em}.system-status small{font-size:8px;color:#8c9993;margin-top:1px}.system-status-icon{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:#eef5e3;color:#58702c}.system-status.offline .system-status-icon{background:#fff1cf;color:#8a6418}.system-status.checking .system-status-icon{background:#f3f6f4;color:#78867f}@media(max-width:760px){.system-status{left:auto;right:130px;top:19px}.system-status span:nth-child(2){display:none}}`}</style></div>;
}
