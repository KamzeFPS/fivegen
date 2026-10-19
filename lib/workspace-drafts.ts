export function clearWorkspaceDrafts(){
  try{
    for(const key of Object.keys(sessionStorage))if(key.startsWith('fivegen:idea:'))sessionStorage.removeItem(key);
  }catch{}
}
