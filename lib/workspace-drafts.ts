export function clearWorkspaceDrafts(){
  try{
    const prefixes=['fivegen:idea:','fivegen:builder-draft:','fivegen:import-review:','fivegen:workspace-chat:','fivegen:assistant-request:','fivegen:last-assistant-conversation:'];
    for(const key of Object.keys(sessionStorage))if(prefixes.some(prefix=>key.startsWith(prefix)))sessionStorage.removeItem(key);
    for(const key of Object.keys(localStorage))if(key.startsWith('fivegen:builder-agent:'))localStorage.removeItem(key);
  }catch{}
}
