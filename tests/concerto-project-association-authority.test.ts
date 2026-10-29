import { describe,expect,it } from 'vitest';
import { associationProjectsFromRegistry } from '@/lib/observatory/project-association-authority';

describe('Project association published authority freshness',()=>{
 const registry={source:{freshness:'fresh'},project_groups:[{owner:'Shared',projects:[{project_key:'shared/fixture',name:'fixture',project_owner:'main',status:'active'}]}]};
 it('uses explicit current published Owner and preserves status for the request authorization',()=>{
  expect(associationProjectsFromRegistry(registry)).toEqual({projects:[{projectKey:'shared/fixture',title:'fixture',owner:'main',status:'active'}],agentIds:[]});
 });
 it('rejects stale or unknown registry rather than inheriting Dashboard ready status',()=>{
  for(const freshness of ['stale','unknown','missing'])expect(()=>associationProjectsFromRegistry({...registry,source:{freshness}})).toThrow('UNAVAILABLE');
 });
});
