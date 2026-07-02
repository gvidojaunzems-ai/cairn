import { afterEach, describe, expect, it } from 'vitest';

import { resetMeetingEngineForTests } from '../../src/main/engines/meeting-engine.js';
import { createMeetingsService } from '../../src/main/services/meetings.service.js';
import { resetServiceContextForTests } from '../../src/main/services/service-context.js';

describe('meetings.getLive IPC shape', () => {
  afterEach(() => {
    resetMeetingEngineForTests();
    resetServiceContextForTests();
  });

  it('returns live session under both live and session keys', async () => {
    const { getServiceContext } = await import('../../src/main/services/service-context.js');
    const { createEventBus } = await import('../../src/main/ipc/event-bus.js');
    const eventBus = createEventBus({ getWebContents: () => [] });
    const ctx = getServiceContext(eventBus);
    const service = createMeetingsService(ctx);

    service.start({ title: 'Standup', consent: true });
    const result = service.getLive();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.data as {
      live: { id: string; transcript: string } | null;
      session: { id: string } | null;
    };
    expect(data.live).not.toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.live?.id).toBe(data.session?.id);
  });
});
