import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContentIntel,intelFreshness} from '../public/content-intel.js';

test('content intelligence accepts only explicit public snapshots',()=>{
 assert.equal(normalizeContentIntel({schema:'content-intel-1',visibility:'private',generated_at:'2026-10-07T13:00:00Z',items:[]}),null);
 const x=normalizeContentIntel({
  schema:'content-intel-1',visibility:'public',generated_at:'2026-10-07T13:00:00Z',
  items:[{id:'1',platform:'instagram',title:'Публичный ролик',url:'https://example.test/reel',projects:['Росток'],metrics:{views:1000},analysis:{angle:'идея'}}]
 });
 assert.equal(x.items.length,1);
 assert.equal(x.items[0].platform,'instagram');
 assert.equal(x.items[0].metrics.views,1000);
 assert.equal(x.items[0].analysis.angle,'идея');
});

test('content intelligence freshness fails closed',()=>{
 assert.equal(intelFreshness(null).state,'offline');
 const live=intelFreshness({generated_at:'2026-10-07T13:00:00Z',ttl_seconds:21600},Date.parse('2026-10-07T14:00:00Z'));
 assert.equal(live.state,'live');
 const stale=intelFreshness({generated_at:'2026-10-07T00:00:00Z',ttl_seconds:3600},Date.parse('2026-10-07T14:00:00Z'));
 assert.equal(stale.state,'stale');
});
