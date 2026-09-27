import { describe, expect, it } from 'vitest';
import { createDemoExperiment } from './demo';
import { getExperiment, getExperimentStats } from './repo/experiments';
import { createMigratedDb } from './testing/node-db';

describe('experimento de demonstração', () => {
  it('é criado uma única vez com dados consistentes', async () => {
    const db = await createMigratedDb();
    const id = await createDemoExperiment(db, 'Gabriel');
    expect(await createDemoExperiment(db, 'Gabriel')).toBe(id);
    const experiment = (await getExperiment(db, id))!;
    const stats = await getExperimentStats(db, experiment);
    expect(stats).toMatchObject({ samples: 12, sessions: 2, observations: 23, retracted: 1, events: 2, expectedObservations: 36 });
  });
});
