import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * React Query does not know about tab focus in React Native. Refetch the
 * given query keys whenever a screen comes back into view (skipping the very
 * first focus, which the mount already covers).
 */
export function useRefetchOnFocus(keys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      for (const key of keys) queryClient.invalidateQueries({ queryKey: [...key] });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, JSON.stringify(keys)]),
  );
}
