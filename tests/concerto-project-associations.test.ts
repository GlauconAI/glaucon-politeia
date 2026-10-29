import { describe, expect, it } from 'vitest';
import { parseAssociationApprovals, authorizeAssociation, validateAssociationSnapshot } from '@/lib/observatory/project-associations';

const source = 'socrates/fixture';
const target = 'shared/fixture';
const approval = { sourceProjectKey: source, targetProjectKey: target, ownerAgentId: 'main', catalogOperationId: 'fixture:transfer', catalogReceiptSha256: 'a'.repeat(64) };
const projects = [{ projectKey: target, owner: 'main', status: 'active' }];
const version = { id: '11111111-1111-4111-8111-111111111111', project_key: source, original_project_key: source, effective_project_key: source, status: 'released', row_version: 7, version_label: '1.0.0' };
const item = { id: '22222222-2222-4222-8222-222222222222', original_project_key: source, effective_project_key: source, project_key: source, project_version_id: version.id, state: 'done', version: 4 };
const snapshot = { schema_version: 'concerto-project-association-snapshot-v1', source_project_key: source, target_project_key: target, snapshot_revision: 'b'.repeat(32), snapshot_as_of: '2026-10-29T01:00:00Z', complete: true, next_cursor: null, page_count: 1, version_count: 1, item_count: 1, versions: [version], items: [item], association: null };

describe('Project association trust and full snapshot', () => {
  it('accepts only a unique strict deployment approval and rejects missing or ambiguous trust', () => {
    expect(parseAssociationApprovals(JSON.stringify([approval]))).toEqual([approval]);
    for (const raw of [undefined, '{}', '[]', JSON.stringify([approval, approval]), JSON.stringify([{ ...approval, extra: true }]), JSON.stringify([{ ...approval, targetProjectKey: source }])]) {
      expect(() => parseAssociationApprovals(raw)).toThrow();
    }
  });
  it('requires an exact approved pair and the CURRENT explicit owner on every use', () => {
    expect(authorizeAssociation('main', source, target, [approval], projects)).toEqual(approval);
    const deny = (agent = 'main', s = source, p = projects) => expect(() => authorizeAssociation(agent, s, target, [approval], p)).toThrow();
    deny('socrates'); deny('shared'); deny('plato'); deny('main', 'other/private');
    deny('main', source, [{ ...projects[0], owner: 'plato' }]);
    deny('main', source, [{ ...projects[0], status: 'retired' }]);
    deny('main', source, [...projects, { projectKey: source, owner: 'plato', status: 'active' }]);
  });
  it('validates all versions and more than 500 items without a visible-list cap', () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ ...item, id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}` }));
    expect(validateAssociationSnapshot({ ...snapshot, items, item_count: 501 }, source, target).items).toHaveLength(501);
    expect(validateAssociationSnapshot(snapshot, source, target).versions[0].status).toBe('released');
  });
  it('rejects truncation, foreign rows, duplicate IDs, broken version links and invented effective keys', () => {
    for (const invalid of [
      { ...snapshot, item_count: 2 }, { ...snapshot, version_count: 2 }, { ...snapshot, complete: false },
      { ...snapshot, next_cursor: 'more' }, { ...snapshot, source_project_key: 'other/private' },
      { ...snapshot, items: [item, item], item_count: 2 },
      { ...snapshot, versions: [version, version], version_count: 2 },
      { ...snapshot, items: [{ ...item, original_project_key: 'other/private' }] },
      { ...snapshot, versions: [], version_count: 0 },
      { ...snapshot, items: [{ ...item, effective_project_key: target }] },
    ]) expect(() => validateAssociationSnapshot(invalid, source, target)).toThrow();
  });
});
