import type { Metadata } from 'next';
import { KeyRound, Rocket, Search, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TdTabPage, TdPlaceholderTable, TdSection } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('integration').label };

// Partner contract v1, §5: every refusal carries one of these codes.
const REASON_CODES: Array<[code: string, meaning: string]> = [
  ['invalid_signature', 'HMAC signature does not match'],
  ['unknown_key', 'X-Partner-Key-Id is not an active key'],
  ['timestamp_skew', 'Timestamp outside ±300 s'],
  ['nonce_replayed', 'Nonce already used in the last 10 min'],
  ['ip_not_allowed', 'Source IP is not on the allowlist'],
  ['request_conflict', 'Same requestId, different payload'],
  ['player_blocked', 'Player is blocked or self-excluded'],
  ['rate_limited', 'Too many requests'],
];

const LOG_EMPTY = 'These logs come with the webhook API (admin contract v5), on another branch.';

export default function TdIntegrationPage() {
  return (
    <TdTabPage tab="integration">
      <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
        Not wired yet: session inits, launches and webhook deliveries arrive with admin contract v5 (the webhook API). This CMS pins v4.
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-(--td-text-3)" />
        <Input disabled placeholder="Search by playerId, sessionId or eventId" className="h-11 rounded-full bg-(--td-input) pl-11" />
      </div>
      <TdSection title="Session inits" description="POST /partner/v1/sessions/init from Betsson's servers (HMAC + IP allowlist).">
        <TdPlaceholderTable
          columns={['Time', 'Request id', 'Player id', 'Source IP', 'Result', 'Reason code']}
          icon={KeyRound}
          emptyTitle="No session inits yet"
          emptyBody={LOG_EMPTY}
        />
      </TdSection>
      <TdSection title="Launches" description="One-time token exchanges from the iframe (POST /auth/exchange).">
        <TdPlaceholderTable
          columns={['Time', 'Session id', 'Player id', 'Result', 'Reason code']}
          icon={Rocket}
          emptyTitle="No launches yet"
          emptyBody={LOG_EMPTY}
        />
      </TdSection>
      <TdSection title="Webhook deliveries" description="Signed result events to Betsson; retried with backoff for 24 h, then dead-lettered.">
        <TdPlaceholderTable
          columns={['Time', 'Event id', 'Event', 'Attempt', 'Status', 'Latency', 'Response', 'Retry']}
          icon={Send}
          emptyTitle="No webhook deliveries yet"
          emptyBody={LOG_EMPTY}
        />
      </TdSection>
      <TdSection title="Reason codes">
        <dl className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
          {REASON_CODES.map(([code, meaning]) => (
            <div key={code} className="flex flex-col gap-0.5">
              <dt className="font-mono text-xs text-primary">{code}</dt>
              <dd className="text-sm text-(--td-text-2)">{meaning}</dd>
            </div>
          ))}
        </dl>
      </TdSection>
    </TdTabPage>
  );
}
