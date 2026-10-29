import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertConcertoProductionTarget, parseConcertoDeploymentCommand, redactConcertoDeploymentError } from '@/scripts/observatory/deploy-concerto-public-execution-interfaces';
const project = 'fiicazfhjkviqaaaiksp';
function env(database = `postgresql://postgres:secret@db.${project}.supabase.co:5432/postgres`) { return { NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`, SUPABASE_DB_URL: database }; }
describe('bounded Concerto public interface deployment launcher', () => {
  it('accepts only check, apply, status; defaults rollback-only check', () => {
    expect(parseConcertoDeploymentCommand([])).toBe('check');
    for (const command of ['check','apply','status']) expect(parseConcertoDeploymentCommand([command])).toBe(command);
    for (const args of [['--apply'], ['apply','extra'], ['status','postgresql://secret']]) expect(() => parseConcertoDeploymentCommand(args)).toThrow();
  });
  it('pins production identity without host/query/username overrides', () => {
    expect(assertConcertoProductionTarget(env()).projectRef).toBe(project);
    expect(assertConcertoProductionTarget(env(`postgresql://postgres.${project}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?pgbouncer=true`)).databaseUrl).not.toContain('?');
    expect(assertConcertoProductionTarget(env(`postgresql://postgres.${project}:secret@aws-0-us-west-1.pooler.supabase.com:6543/postgres`)).projectRef).toBe(project);
    for (const url of [`postgresql://postgres@127.0.0.1:5432/postgres`, `postgresql://postgres@db.${project}.supabase.co:5432/other`, `postgresql://postgres@db.${project}.supabase.co:5432/postgres?host=evil.invalid`, `postgresql://postgres@db.${project}.supabase.co:5432/postgres?sslmode=disable`, `postgresql://postgres.other@aws-0-us-west-1.pooler.supabase.com:5432/postgres`, `https://db.${project}.supabase.co/postgres`]) expect(() => assertConcertoProductionTarget(env(url))).toThrow();
    expect(() => assertConcertoProductionTarget({ ...env(), NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' })).toThrow();
  });
  it('provides one dedicated npm release entry for this exact migration', () => {
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    expect(pkg.scripts['observatory:concerto-public-interfaces:deploy']).toBe('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/observatory/deploy-concerto-public-execution-interfaces.ts');
  });
  it('does not echo driver errors, env paths, credentials or SQL data', () => {
    expect(redactConcertoDeploymentError(new Error('postgresql://user:secret@private.example:5432/db'))).toEqual({ error: 'CONCERTO_PUBLIC_DEPLOY_FAILED' });
  });
  it('uses native rollback scopes, complete semantic grants and protected-state comparison', () => {
    const source = readFileSync('scripts/observatory/deploy-concerto-public-execution-interfaces.ts','utf8');
    expect(source).toContain('20261027000100');
    expect(source).toContain('concerto_public_execution_interfaces');
    expect(source).toContain('savepoint');
    expect(source).toContain('read only');
    expect(source).toContain('has_function_privilege');
    expect(source).toContain('has_table_privilege');
    expect(source).toContain('protectedState');
    expect(source).not.toContain('error.message');
    expect(source).not.toContain('console.log(process.env');
  });
});
