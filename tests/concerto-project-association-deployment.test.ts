import {describe,expect,it} from 'vitest';
import {parseAssociationDeploymentCommand,redactAssociationDeploymentError} from '@/scripts/observatory/deploy-concerto-project-associations';
describe('association migration operator boundary',()=>{
 it('defaults to rollback-only check and accepts only one exact command',()=>{
  expect(parseAssociationDeploymentCommand([])).toBe('check');
  for(const command of ['check','status','apply'])expect(parseAssociationDeploymentCommand([command])).toBe(command);
  for(const args of [['force'],['apply','--url','postgres://other']])expect(()=>parseAssociationDeploymentCommand(args)).toThrow();
 });
 it('never returns raw deployment credentials or SQL errors',()=>{
  expect(redactAssociationDeploymentError(new Error('postgres://private:secret@host'))).toEqual({error:'CONCERTO_ASSOCIATION_DEPLOY_FAILED'});
 });
});
