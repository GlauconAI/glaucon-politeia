import { z } from 'zod';
import { defaultSnapshotRouteDependencies } from '@/app/api/concerto/project-work-snapshot/route';
import { jsonResponse, readBoundedJson } from '@/app/api/dashboard/work-items/claims/route';
import { authenticateAgentClaimRequest, AgentClaimAuthError } from '@/lib/observatory/agent-claim-auth';
import { createProjectAssociationRepository } from '@/lib/observatory/project-association-repository';
import { AssociationInputSchema, AssociationPairSchema, ProjectAssociationError, authorizeAssociation, parseAssociationApprovals } from '@/lib/observatory/project-associations';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { ConcertoPublicClient } from '@/lib/observatory/concerto-public-repository';
import { loadAssociationProjects } from '@/lib/observatory/project-association-authority';

export interface AssociationDependencies {
 keyConfiguration():string|undefined;
 approvals():string|undefined;
 projects:typeof defaultSnapshotRouteDependencies.projects;
 repository():ReturnType<typeof createProjectAssociationRepository>;
}
export const defaultAssociationDependencies:AssociationDependencies={
 keyConfiguration:defaultSnapshotRouteDependencies.keyConfiguration,
 approvals:()=>process.env.CONCERTO_PROJECT_ASSOCIATION_APPROVALS,
 projects:loadAssociationProjects,
 repository:()=>createProjectAssociationRepository(createSupabaseAdminClient() as unknown as ConcertoPublicClient),
};
const querySchema=AssociationPairSchema.extend({expectedRevision:z.string().regex(/^[a-f0-9]{32}$/u).optional()});
function errorResponse(error:unknown){
 if(error instanceof AgentClaimAuthError)return jsonResponse({error:error.code==='UNAUTHORIZED'?'UNAUTHORIZED':'UNAVAILABLE'},error.code==='UNAUTHORIZED'?401:503);
 if(error instanceof ProjectAssociationError){const code=error.code;return jsonResponse({error:code},code==='FORBIDDEN'?403:code==='INVALID_REQUEST'?400:code==='UNAVAILABLE'?503:409);}
 return jsonResponse({error:'UNAVAILABLE'},503);
}
export function createAssociationHandlers(dependencies:AssociationDependencies){
 async function scope(actor:string,source:string,target:string){
  const approvals=parseAssociationApprovals(dependencies.approvals());
  const {projects}=await dependencies.projects();
  return authorizeAssociation(actor,source,target,approvals,projects);
 }
 return {
  async GET(request:Request){
   try{
    const {agentId}=authenticateAgentClaimRequest(request.headers.get('authorization'),dependencies.keyConfiguration());
    const params=new URL(request.url).searchParams;
    const parsed=querySchema.safeParse(Object.fromEntries(params));
    if(!parsed.success || [...params.keys()].some((key)=>params.getAll(key).length!==1))return jsonResponse({error:'INVALID_REQUEST'},400);
    const input=parsed.data;await scope(agentId,input.sourceProjectKey,input.targetProjectKey);
    const snapshot=await dependencies.repository().read(input.sourceProjectKey,input.targetProjectKey);
    if(input.expectedRevision && input.expectedRevision!==snapshot.snapshot_revision)throw new ProjectAssociationError('SNAPSHOT_DRIFT');
    return jsonResponse(snapshot,200);
   }catch(error){return errorResponse(error);}
  },
  async POST(request:Request){
   try{
    const {agentId}=authenticateAgentClaimRequest(request.headers.get('authorization'),dependencies.keyConfiguration());
    const parsed=AssociationInputSchema.safeParse(await readBoundedJson(request));
    if(!parsed.success)return jsonResponse({error:'INVALID_REQUEST'},400);
    const input=parsed.data;const approval=await scope(agentId,input.sourceProjectKey,input.targetProjectKey);
    return jsonResponse(await dependencies.repository().associate({actor:agentId,approval,input}),200);
   }catch(error){return errorResponse(error);}
  },
 };
}
