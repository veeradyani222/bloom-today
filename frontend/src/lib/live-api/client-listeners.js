export function registerLiveClientListeners(client, handlers) {
  if (!client || !handlers) return () => {};

  const entries = Object.entries(handlers).filter(([, handler]) => typeof handler === 'function');
  entries.forEach(([eventName, handler]) => {
    client.on(eventName, handler);
  });

  return () => {
    entries.forEach(([eventName, handler]) => {
      client.off(eventName, handler);
    });
  };
}
