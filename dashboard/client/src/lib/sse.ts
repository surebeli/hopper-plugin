import { useEffect, useRef, useState } from 'react';

export type SseState = 'connecting' | 'open' | 'error' | 'closed';

export function useSSE<T>(
  channel: string,
  onMessage: (data: T) => void,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const callbackRef = useRef(onMessage);
  const [state, setState] = useState<SseState>('connecting');

  useEffect(() => {
    callbackRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled) {
      setState('closed');
      return;
    }

    const source = new EventSource(channel);
    const eventName = eventNameForChannel(channel);
    const handleMessage = (event: MessageEvent) => {
      try {
        callbackRef.current(JSON.parse(event.data) as T);
      } catch (err) {
        console.warn(`[useSSE] parse error on ${channel}:`, err);
      }
    };

    source.onopen = () => setState('open');
    source.onerror = () => setState('error');
    source.onmessage = handleMessage;
    source.addEventListener(eventName, handleMessage);

    return () => {
      source.removeEventListener(eventName, handleMessage);
      source.close();
      setState('closed');
    };
  }, [channel, enabled]);

  return state;
}

function eventNameForChannel(channel: string) {
  const normalized = channel.replace(/^\/events\/?/, '');
  return normalized.split('/')[0] || 'message';
}
