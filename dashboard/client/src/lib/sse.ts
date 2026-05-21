import { useEffect } from 'react';

export function useSSE(channel: string, onMessage: (data: unknown) => void) {
  useEffect(() => {
    const source = new EventSource(channel);
    source.onmessage = (event) => onMessage(JSON.parse(event.data));
    return () => source.close();
  }, [channel, onMessage]);
}
