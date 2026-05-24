import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';

export function useManagedMutation<TData, TVariables>(options: {
  mutationFn: (vars: TVariables) => Promise<AxiosResponse<TData>>;
  invalidateKeys?: QueryKey[];
  onSuccess?: (data: TData) => void;
  onPending?: (pendingActionId: string) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: (res) => {
      if (res.status === 202) {
        const id = (res.data as any).pendingActionId;
        options.onPending?.(id);
      } else {
        if (options.invalidateKeys) {
          options.invalidateKeys.forEach(k => queryClient.invalidateQueries({ queryKey: k as readonly unknown[] }));
        }
        options.onSuccess?.(res.data);
      }
    },
  });
}
