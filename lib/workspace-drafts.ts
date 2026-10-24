export function clearWorkspaceDrafts(){
  try{
    for(const key of Object.keys(sessionStorage))if(key.startsWith('fivegen:idea:')||key.startsWith('fivegen:builder-draft:')||key.startsWith('fivegen:import-review:'))sessionStorage.removeItem(key);
    for(const key of Object.keys(localStorage))if(key.startsWith('fivegen:builder-agent:'))localStorage.removeItem(key);
  }catch{}
}
