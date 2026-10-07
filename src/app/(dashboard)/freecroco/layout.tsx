import { MockBanner } from './_components/mock-banner';

export default function FreecrocoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <MockBanner />
      {children}
    </div>
  );
}
