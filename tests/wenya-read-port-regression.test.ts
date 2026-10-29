import {describe,it,expect,vi} from 'vitest';
import {createAgentWorkItemRepository,type AgentWorkItemRepositoryClient} from '@/lib/observatory/agent-work-item-repository';
import {buildWorkTrackerProjectOptions} from '@/lib/observatory/work-tracker-projects';
import type {ObservatoryRegistrySnapshot} from '@/lib/observatory/schema';
describe('production read-port regression without service-role table grants',()=>{
 it('reads an exact Item through a service-only RPC instead of forbidden table SELECT',async()=>{
 const row={id:'11111111-1111-4111-8111-111111111111',version:6};
 const rpc=vi.fn().mockResolvedValue({data:row,error:null});
 const from=vi.fn(()=>{throw Error('table SELECT denied to service_role');});
 const repository=createAgentWorkItemRepository({from,rpc} as unknown as AgentWorkItemRepositoryClient);
 await expect(repository.get(row.id)).resolves.toEqual(row);
 expect(rpc).toHaveBeenCalledWith('read_observatory_work_item_for_agent_api',{p_item_id:row.id});expect(from).not.toHaveBeenCalled();
 });
 it('uses explicit Project Owner for shared projects',()=>{
 const registry={project_groups:[{owner:'Shared',projects:[{project_key:'shared/example',name:'example',project_owner:'Socrates',status:'active'}]}]} as unknown as ObservatoryRegistrySnapshot;
 expect(buildWorkTrackerProjectOptions(registry)[0].owner).toBe('Socrates');
 });
});
