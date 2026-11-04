import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

describe('inventory workflow', () => {
  const wf = parse(readFileSync('.github/workflows/inventory.yml', 'utf8'));

  it('runs every 6 hours and on demand', () => {
    expect(wf.on.schedule[0].cron).toBe('17 */6 * * *');
    expect(wf.on).toHaveProperty('workflow_dispatch');
  });

  it('tests before indexing and passes the OpenSea key', () => {
    const steps = wf.jobs.inventory.steps.map((s: { run?: string }) => s.run ?? '');
    expect(steps.indexOf('npm test')).toBeLessThan(steps.indexOf('npm run index'));
    const indexStep = wf.jobs.inventory.steps.find((s: { run?: string }) => s.run === 'npm run index');
    expect(indexStep.env.OPENSEA_API_KEY).toBe('${{ secrets.OPENSEA_API_KEY }}');
  });

  it('can push its commit', () => {
    expect(wf.permissions.contents).toBe('write');
  });

  it('renormalizes public/media before staging (binary per .gitattributes)', () => {
    const commit = wf.jobs.inventory.steps.find((s: { name?: string }) => s.name === 'Commit snapshot');
    expect(commit.run).toContain('--renormalize');
    expect(commit.run.indexOf('--renormalize')).toBeLessThan(commit.run.indexOf('git add data public/media'));
  });

  it('rebases onto origin before pushing the snapshot', () => {
    const commit = wf.jobs.inventory.steps.find((s: { name?: string }) => s.name === 'Commit snapshot');
    expect(commit.run).toContain('git pull --rebase');
    expect(commit.run.indexOf('git pull --rebase')).toBeLessThan(commit.run.indexOf('git push'));
  });

  it('offers an accept_drop dispatch input passed to the index step as ACCEPT_DROP (I5)', () => {
    expect(wf.on.workflow_dispatch.inputs.accept_drop).toMatchObject({ type: 'string', default: '' });
    const indexStep = wf.jobs.inventory.steps.find((s: { run?: string }) => s.run === 'npm run index');
    expect(indexStep.env.ACCEPT_DROP).toBe('${{ inputs.accept_drop }}');
  });
});
