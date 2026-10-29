import 'server-only';
import { z } from 'zod';
import { ProjectAssociationError, validateAssociationSnapshot, type AssociationApproval, type AssociationInput } from '@/lib/observatory/project-associations';
import type { ConcertoPublicClient } from '@/lib/observatory/concerto-public-repository';

const resultSchema = z.strictObject({
  association: z.strictObject({ source_project_key:z.string(),target_project_key:z.string(),actor_agent_id:z.string(),catalog_operation_id:z.string(),catalog_receipt_sha256:z.string(),created_at:z.iso.datetime({offset:true}) }),
  operation: z.strictObject({id:z.uuid(),actor_agent_id:z.string(),idempotency_key:z.string(),request_fingerprint:z.string().regex(/^[a-f0-9]{64}$/u),source_project_key:z.string(),target_project_key:z.string(),expected_revision:z.string(),created_at:z.iso.datetime({offset:true})}),
});
export function createProjectAssociationRepository(client: ConcertoPublicClient) {
  async function call(name:string,args:Record<string,unknown>) {
    const {data,error}=await client.rpc(name,args);
    if(error){
      for(const code of ['FORBIDDEN','INVALID_REQUEST','SNAPSHOT_DRIFT','ASSOCIATION_CONFLICT','IDEMPOTENCY_CONFLICT'] as const) if(new RegExp(`\\b${code}\\b`,'u').test(error.message)) throw new ProjectAssociationError(code);
      throw new ProjectAssociationError('UNAVAILABLE');
    }
    if(data===null)throw new ProjectAssociationError('UNAVAILABLE');
    return data;
  }
  return {
    async read(source:string,target:string) {
      return validateAssociationSnapshot(await call('read_observatory_project_association_snapshot',{p_source_key:source,p_target_key:target}),source,target);
    },
    async associate({actor,approval,input}:{actor:string;approval:AssociationApproval;input:AssociationInput}) {
      const result=resultSchema.parse(await call('associate_observatory_project_as_agent',{
        p_agent_id:actor,p_is_project_owner:true,p_source_key:input.sourceProjectKey,p_target_key:input.targetProjectKey,
        p_catalog_operation_id:approval.catalogOperationId,p_catalog_receipt_sha256:approval.catalogReceiptSha256,
        p_expected_revision:input.expectedRevision,p_idempotency_key:input.idempotencyKey,
      }));
      if(result.association.source_project_key!==input.sourceProjectKey || result.association.target_project_key!==input.targetProjectKey ||
        result.association.catalog_operation_id!==approval.catalogOperationId || result.association.catalog_receipt_sha256!==approval.catalogReceiptSha256 ||
        result.operation.actor_agent_id!==actor || result.operation.idempotency_key!==input.idempotencyKey ||
        result.operation.source_project_key!==input.sourceProjectKey || result.operation.target_project_key!==input.targetProjectKey || result.operation.expected_revision!==input.expectedRevision) throw new ProjectAssociationError('UNAVAILABLE');
      return result;
    },
  };
}
