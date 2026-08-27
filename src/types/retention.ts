export type JourneyStatus = 'draft' | 'canary' | 'live' | 'paused' | 'completed';

export type RetentionJourneyDashboard = {
  config: {
    journey_key: string;
    version: number;
    feature_flag_key: string;
    status: JourneyStatus;
    assignment_cap: number;
    daily_assignment_cap: number;
    daily_send_cap: number;
    min_lifetime_matches: number;
    quiet_hours_start: number;
    quiet_hours_end: number;
    email_frequency_days: number;
    sms_status: 'locked' | 'paused' | 'live';
    updated_at: string;
    runtime_enabled: boolean;
    email_provider_ready: boolean;
    sms_explanation: string;
  };
  segments: Array<{
    segment: '0-3 days' | '3-7 days' | '7-14 days' | '14-30 days' | '30-60 days' | '60+ days';
    players: number;
    email_reachable: number;
    verified_phone: number;
    sms_marketing_eligible: number;
  }>;
  funnel: Array<{
    variant: 'control' | 'test';
    enrolled: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    returned_72h: number;
    started_three_matches_7d: number;
  }>;
  steps: Array<{
    milestone_days: 3 | 7 | 14 | 30 | 60;
    assigned: number;
    sent: number;
    delivered: number;
    clicked: number;
    failed: number;
    unsubscribed: number;
  }>;
  journey: Array<{
    milestone_days: 3 | 7 | 14 | 30 | 60;
    title: string;
    destination: string;
  }>;
  experiment: {
    feature_flag_key: string;
    decision_metric: string;
    retention_metric: string;
    guardrails: string[];
  };
};
