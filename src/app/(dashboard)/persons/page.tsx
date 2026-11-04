'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, UserSearch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { usePersons } from '@/hooks/use-admin-persons';
import { RealDataGate } from '@/components/analytics/real-data-gate';

const PAGE_SIZE = 50;

function PersonsInner() {
  const [kind, setKind] = useState<'registered' | 'guest'>('registered');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = usePersons(kind, search, offset);

  const rows = data?.persons ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Persons</h1>
        <p className="text-sm text-slate-500">
          Real players from the production database. Click one to see their full journey.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserSearch className="h-4 w-4 text-slate-400" />
            {kind === 'registered' ? 'Registered users' : 'Guest journeys (played)'}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={kind === 'registered' ? 'default' : 'outline'}
              onClick={() => { setKind('registered'); setOffset(0); }}>Registered</Button>
            <Button size="sm" variant={kind === 'guest' ? 'default' : 'outline'}
              onClick={() => { setKind('guest'); setOffset(0); }}>Guests</Button>
            <form className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setOffset(0); }}>
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                placeholder={kind === 'registered' ? 'nickname, email or id' : 'guest id'} className="h-8 w-56" />
              <Button size="sm" type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-sm text-slate-500">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Joined</TableHead>
                  {kind === 'registered' ? <TableHead className="text-right">Coins</TableHead> : <TableHead>Status</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/persons/${p.kind}/${p.id}`} className="font-medium text-blue-600 hover:underline">
                        {p.nickname ?? p.email ?? `${p.id.slice(0, 8)}…`}
                      </Link>
                      {p.nickname && p.email && <span className="ml-2 text-xs text-slate-400">{p.email}</span>}
                    </TableCell>
                    <TableCell className="uppercase">{p.country ?? '—'}</TableCell>
                    <TableCell>{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                    {kind === 'registered'
                      ? <TableCell className="text-right tabular-nums">{p.coins?.toLocaleString('en-US') ?? '—'}</TableCell>
                      : <TableCell>{p.converted ? <Badge>converted</Badge> : <Badge variant="outline">guest</Badge>}</TableCell>}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">No matches.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex items-center justify-between">
            <Button size="sm" variant="outline" disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</Button>
            <span className="text-xs text-slate-500">rows {offset + 1}–{offset + rows.length}</span>
            <Button size="sm" variant="outline" disabled={rows.length < PAGE_SIZE}
              onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PersonsPage() {
  return <RealDataGate><PersonsInner /></RealDataGate>;
}
