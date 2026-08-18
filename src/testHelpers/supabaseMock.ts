// A minimal chainable Supabase query-builder mock. Every intermediate method
// (select/eq/order/limit/insert) returns the same builder so calls can be
// chained in any combination; the builder is itself thenable so `await
// supabase.from(...).insert(...)` resolves directly without a terminal call,
// while `.single()`/`.maybeSingle()` resolve explicitly for select chains.
export function chainableSupabaseResult(finalResult: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn(async () => finalResult);
  builder.maybeSingle = jest.fn(async () => finalResult);
  builder.then = (resolve: (value: unknown) => void) => resolve(finalResult);
  return builder;
}

// A minimal mock RealtimeChannel: `.on(...)` records each registered handler by
// event type so a test can fire it directly (`triggerPostgresChanges`/
// `triggerPresenceSync`), `.subscribe(cb)` immediately calls back with
// 'SUBSCRIBED' (mirroring an always-succeeds connection), and `.track`/
// `.presenceState` are jest.fn()s a test can configure per case.
export function createMockRealtimeChannel() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const channel: Record<string, unknown> = {};

  channel.on = jest.fn((type: string, _filter: unknown, callback: (...args: unknown[]) => void) => {
    (handlers[type] ??= []).push(callback);
    return channel;
  });
  channel.subscribe = jest.fn((callback?: (status: string) => void) => {
    callback?.('SUBSCRIBED');
    return channel;
  });
  channel.track = jest.fn(async () => ({ status: 'ok' }));
  channel.presenceState = jest.fn(() => ({}));
  channel.unsubscribe = jest.fn(async () => ({ status: 'ok' }));

  channel.__trigger = (type: string, ...args: unknown[]) => {
    for (const handler of handlers[type] ?? []) handler(...args);
  };

  return channel;
}
