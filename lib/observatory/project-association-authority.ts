import 'server-only';
import { readObservatoryOverviewState } from '@/lib/observatory/dashboard-state';
import { createObservatoryRepository, type ObservatoryRepositoryClient } from '@/lib/observatory/repository';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ProjectAssociationError } from '@/lib/observatory/project-associations';

interface RegistryAuthority {
 source:{freshness:string};
 project_groups:Array<{owner:string;projects:Array<{project_key:string;name:string;title?:string;project_owner?:string;status:string}>}>;
}
export function associationProjectsFromRegistry(registry:RegistryAuthority){
 if(registry.source.freshness!=='fresh')throw new ProjectAssociationError('UNAVAILABLE');
 return {projects:registry.project_groups.flatMap((group)=>group.projects.map((p)=>({projectKey:p.project_key,title:p.title??p.name,owner:p.project_owner??group.owner,status:p.status}))),agentIds:[]};
}
export async function loadAssociationProjects(){
 // Never reuse the Dashboard's 60-second presentation cache for authorization.
 // This is the newest successfully PUBLISHED Registry, not a live host filesystem read.
 const state=await readObservatoryOverviewState(createObservatoryRepository(createSupabaseAdminClient() as unknown as ObservatoryRepositoryClient));
 if(state.status!=='ready')throw new ProjectAssociationError('UNAVAILABLE');
 return associationProjectsFromRegistry(state.snapshot.registry);
}
