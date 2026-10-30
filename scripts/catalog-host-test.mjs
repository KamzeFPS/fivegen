import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createStorage} from '../runtime/render/storage.mjs';
import {catalogHostRequest} from '../runtime/render/catalog-host.mjs';
const storage=createStorage(resolve('outputs/catalog-host-qa',randomUUID())),db=storage.sqlite,host='learn.creator-domain.com';
try{
 db.prepare('INSERT INTO creator_catalogs(owner,draft,version,updated_at,published,published_slug,published_version,published_at) VALUES(?, ?,1,1,?,?,1,1)').run('owner','{}','{}','my-studio');
 db.prepare('INSERT INTO creator_catalog_domains(owner,hostname,txt_token,updated_at) VALUES(?,?,?,1)').run('owner',host,'public-dns-ownership-fixture');
 const call=(path='/',method='GET',hostname=host)=>catalogHostRequest(db,{host:hostname,method,path});
 assert.equal(call(),null,'An owner DNS claim cannot activate hosting');
 db.prepare("UPDATE creator_catalog_domains SET ownership_verified_at=1,dns_verified_at=1,platform_status='connected'").run();assert.equal(call(),null,'TLS is a separate platform check');
 db.prepare("UPDATE creator_catalog_domains SET tls_status='active'").run();assert.equal(call().path,'/creator/my-studio');
 assert.equal(call('/creator/my-studio').status,200);assert.equal(call('/assets/main.js').status,200);
 for(const path of ['/api/account/catalog','/account','/creator/another-studio','/assets/../api/workspace'])assert.ok([400,404].includes(call(path).status),path);
 for(const path of ['/signin','/customer'])assert.equal(call(path).canonical,true,'Account links redirect to the trusted origin without proxying sessions');
 assert.equal(call('/','POST').status,405);assert.equal(call('/','GET','unrecognized.test'),null);
 db.prepare('UPDATE creator_catalogs SET published_at=NULL').run();assert.equal(call(),null,'Pausing the catalog removes its hostname route immediately');
 console.log('Catalog hostname passed: only verified platform/TLS states route, public content/assets only, no customer/account/auth/API/actions, immediate pause rollback.');
}finally{storage.close();}
