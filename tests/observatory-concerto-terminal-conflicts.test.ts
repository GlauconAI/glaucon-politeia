import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertMinimalConflictMigration, MIGRATION_VERSION } from '../scripts/observatory/deploy-concerto-terminal-conflicts';

const source=readFileSync('supabase/migrations/20261029000200_concerto_binding_terminal_conflicts.sql','utf8');
const base=readFileSync('supabase/migrations/20261027000100_concerto_public_execution_interfaces.sql','utf8');
describe('terminal binding conflict migration',()=>{
  it('changes only the two retryable domain errors, preserving complete function contract',()=>{
    expect(MIGRATION_VERSION).toBe('20261029000200');
    const {newBody}=assertMinimalConflictMigration(source,base);
    expect(newBody).not.toContain("errcode = '40001'");
    expect(newBody.match(/errcode = 'PT409'/gu)).toHaveLength(2);
  });
  it('rejects edits to authorization, locking, parameters or additional SQL',()=>{
    for(const altered of [source.replace("p_is_project_owner is distinct from true","false"),source.replace('share row exclusive','access exclusive'),source.replace('p_expected_version integer','p_expected_version bigint'),source+'\ndrop table public.observatory_work_items;']) {
      expect(()=>assertMinimalConflictMigration(altered,base)).toThrow();
    }
  });
});
