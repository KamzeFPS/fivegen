import {request} from 'node:http';

// Node fetch can ignore a supplied Host header. Internal requests must retain
// the canonical authority so they pass the same host boundary as public traffic.
export function loopbackRequest(url,options={}){
  const target=new URL(url);
  if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.username||target.password)
    return Promise.reject(new Error('Internal requests require the local server.'));
  return new Promise((resolve,reject)=>{
    const req=request(target,{method:options.method||'POST',headers:options.headers,signal:options.signal},res=>{
      res.on('error',reject);
      res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode}));
      res.resume();
    });
    req.on('error',reject);
    req.end(options.body);
  });
}
