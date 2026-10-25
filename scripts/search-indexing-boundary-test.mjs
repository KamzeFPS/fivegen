import assert from 'node:assert/strict';
import {privateSearchResponse,publicHomeSearch} from '../runtime/render/search-indexing.mjs';

for(const query of ['', 'utm_source=google&utm_campaign=launch', 'gclid=example', 'fbclid=example&gbraid=example'])assert.equal(publicHomeSearch(new URLSearchParams(query)),true,query);
for(const query of ['view=calendar','project=private-id&area=vsl','planning=1','prompt=private+draft','unknown=anything','utm_source=google&view=create'])assert.equal(privateSearchResponse('',new URLSearchParams(query)),true,query);
for(const path of ['/api/products','/account/billing','/build/private-id','/checkout','/learn/member-course','/access/member-token','/oauth/authorize','/operations','/welcome','/signin-with-chatgpt','/callback','/customer','/o/offer-study','/collaborate/invite/token'])assert.equal(privateSearchResponse(path),true,path);
for(const path of ['/pricing','/terms','/privacy','/refund','/product/published-course','/creator/published-creator','/pages/published-page','/robots.txt','/sitemap.xml','/brand/favicon-96.png','/googleverification-example.html'])assert.equal(privateSearchResponse(path),false,path);
for(const path of ['','/pricing','/product/published-course'])assert.equal(privateSearchResponse(path,new URLSearchParams(),true),true,path);
console.log('Search indexing boundary passed: public canonical/tracking requests stay crawlable; workspace queries, private/auth/API paths and authenticated responses are noindex. Authentication is unchanged.');
