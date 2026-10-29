import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createAssociationHandlers } from '@/lib/observatory/project-association-route';
import { createProjectAssociationRepository } from '@/lib/observatory/project-association-repository';
import { ProjectAssociationError } from '@/lib/observatory/project-associations';

const source='socrates/fixture',target='shared/fixture';
const token='fixture-main-token';
const approval={sourceProjectKey:source,targetProjectKey:target,ownerAgentId:'main',catalogOperationId:'catalog:fixture',catalogReceiptSha256:'a'.repeat(64)};
const snap={schema_version:'concerto-project-association-snapshot-v1',source_project_key:source,target_project_key:target,snapshot_revision:'b'.repeat(32),snapshot_as_of:'2026-10-29T01:00:00Z',complete:true,next_cursor:null,page_count:1,version_count:0,item_count:0,versions:[],items:[],association:null};
function setup() {
 const read=vi.fn().mockResolvedValue(snap);const associate=vi.fn().mockResolvedValue({association:{},operation:{}});
 const repository=vi.fn(()=>({read,associate}));const projects=vi.fn().mockResolvedValue({projects:[{projectKey:target,owner:'main',status:'active'}],agentIds:['main']});
 const approvals=vi.fn(()=>JSON.stringify([approval]));
 const handlers=createAssociationHandlers({keyConfiguration:()=>JSON.stringify([{agentId:'main',tokenSha256:createHash('sha256').update(token).digest('hex')}]),projects,approvals,repository});
 const request=(body?:unknown,extra='',bearer=token)=>new Request('https://example.test/api/concerto/project-associations'+(body? '':`/snapshot?sourceProjectKey=${encodeURIComponent(source)}&targetProjectKey=${encodeURIComponent(target)}${extra}`),{method:body?'POST':'GET',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {handlers,read,associate,repository,projects,approvals,request};
}
describe('Project association official handlers',()=>{
 it('rejects unauthenticated and unauthorized reads before constructing a database repository',async()=>{
  const s=setup();expect((await s.handlers.GET(s.request(undefined,'','wrong'))).status).toBe(401);
  s.projects.mockResolvedValue({projects:[{projectKey:target,owner:'plato',status:'active'}],agentIds:['main']});
  expect((await s.handlers.GET(s.request())).status).toBe(403);expect(s.repository).not.toHaveBeenCalled();
 });
 it('fails closed on absent trusted approval and rejects unrecognized GET/POST arguments',async()=>{
  const s=setup();s.approvals.mockReturnValue('');expect((await s.handlers.GET(s.request())).status).toBe(503);
  expect((await s.handlers.GET(s.request(undefined,'&actor=main'))).status).toBe(400);
  expect((await s.handlers.POST(s.request({sourceProjectKey:source,targetProjectKey:target,expectedRevision:'b'.repeat(32),idempotencyKey:'one',actor:'main'}))).status).toBe(400);
  expect(s.repository).not.toHaveBeenCalled();
 });
 it('returns no-store full snapshot, rejects drift and hides database errors',async()=>{
  const s=setup();const response=await s.handlers.GET(s.request());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(await response.json()).toEqual(snap);
  expect((await s.handlers.GET(s.request(undefined,'&expectedRevision='+'c'.repeat(32)))).status).toBe(409);
  s.read.mockRejectedValue(new Error('postgres://private-token@database'));const failed=await s.handlers.GET(s.request());expect(failed.status).toBe(503);expect(await failed.json()).toEqual({error:'UNAVAILABLE'});
 });
 it('takes provenance only from server approval and reports stable conflicts',async()=>{
  const s=setup();const input={sourceProjectKey:source,targetProjectKey:target,expectedRevision:'b'.repeat(32),idempotencyKey:'one'};
  expect((await s.handlers.POST(s.request(input))).status).toBe(200);
  expect(s.associate).toHaveBeenCalledWith({actor:'main',approval,input});
  s.associate.mockRejectedValue(new ProjectAssociationError('ASSOCIATION_CONFLICT'));expect((await s.handlers.POST(s.request(input))).status).toBe(409);
  s.projects.mockResolvedValue({projects:[{projectKey:target,owner:'plato',status:'active'}],agentIds:['plato']});
  expect((await s.handlers.POST(s.request(input))).status).toBe(403);expect(s.associate).toHaveBeenCalledTimes(2);
 });
 it('repository calls complete snapshot RPC once and rejects truncated database replies',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:snap,error:null});const repo=createProjectAssociationRepository({rpc});
  await expect(repo.read(source,target)).resolves.toEqual(snap);expect(rpc).toHaveBeenCalledWith('read_observatory_project_association_snapshot',{p_source_key:source,p_target_key:target});
  rpc.mockResolvedValue({data:{...snap,item_count:1},error:null});await expect(repo.read(source,target)).rejects.toThrow();
 });
});
