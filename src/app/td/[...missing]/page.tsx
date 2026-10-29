import { notFound } from 'next/navigation';

// An address under /td that no page has (an old bookmark of a removed page, a typo): the workspace's own 404.
export default function Page() {
  notFound();
}
