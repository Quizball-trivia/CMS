import { useQuery } from '@tanstack/react-query';
import { tdApi } from '@/lib/td/client';
import type { TdStaffListResponse } from '@/types/td';

export const tdStaffKeys = {
  all: ['td', 'staff'] as const,
};

export function useTdStaff() {
  return useQuery({
    queryKey: tdStaffKeys.all,
    queryFn: ({ signal }) => tdApi.get<TdStaffListResponse>('/admin/staff', { signal }),
  });
}
