import { useQuery } from '@tanstack/react-query';
import { adminPersonsService } from '@/services/admin-persons.service';

export function usePersons(kind: 'registered' | 'guest', search: string, offset: number) {
  return useQuery({
    queryKey: ['admin-persons', kind, search, offset],
    queryFn: ({ signal }) => adminPersonsService.list({ kind, search: search || undefined, offset }, signal),
    placeholderData: (prev) => prev,
  });
}

export function usePersonActivity(kind: 'registered' | 'guest', id: string) {
  return useQuery({
    queryKey: ['admin-person-activity', kind, id],
    queryFn: ({ signal }) => adminPersonsService.activity(kind, id, signal),
  });
}
