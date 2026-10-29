import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {authenticateAgentClaimRequest} from '@/lib/observatory/agent-claim-auth';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const legacy=JSON.stringify([{agentId:'plato',tokenSha256:hash('legacy-plato')},{agentId:'main',tokenSha256:hash('legacy-main')}]);
describe('main additive credential bootstrap',()=>{
 it('accepts a fixed main supplemental credential without exposing or replacing the legacy configuration',()=>{
  expect(authenticateAgentClaimRequest('Bearer new-main',legacy,hash('new-main'))).toEqual({agentId:'main'});
 });
 it('keeps both existing main and other Agent credentials valid',()=>{
  for(const agent of ['plato','main'])expect(authenticateAgentClaimRequest(`Bearer legacy-${agent}`,legacy,hash('new-main'))).toEqual({agentId:agent});
 });
 it('rejects a malformed supplemental configuration or cross-Agent credential collision',()=>{
  for(const extra of ['bad',hash('legacy-plato')])expect(()=>authenticateAgentClaimRequest('Bearer new-main',legacy,extra)).toThrow('UNCONFIGURED');
 });
 it('does not bypass invalid legacy configuration or accept an arbitrary bearer',()=>{
  for(const base of [undefined,'not-json','[]'])expect(()=>authenticateAgentClaimRequest('Bearer new-main',base,hash('new-main'))).toThrow('UNCONFIGURED');
  expect(()=>authenticateAgentClaimRequest('Bearer wrong',legacy,hash('new-main'))).toThrow('UNAUTHORIZED');
 });
});
