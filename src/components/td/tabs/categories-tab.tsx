'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TdCellTitle, TdContentList } from '@/components/td/content/td-content-list';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';

/** The categories of the two rounds that have them. Their cards and questions are on the Questions page. */
export function TdCategoriesTab() {
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  return (
    <>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <TdContentList
          type="card-categories"
          title="Round I · ბარათონი"
          description="Each category holds cards worth 1 to 3 points. A category is approved with its cards."
          bulk={false}
          onOpen={(row) => setTarget({ type: 'card-categories', row })}
          onCreate={() => setTarget({ type: 'card-categories', row: null })}
          createLabel="New category"
          emptyTitle="No card categories yet"
          columns={[
            { header: 'Category', cell: (row) => <TdCellTitle title={row.data.prompt} sub={row.data.key} /> },
            {
              header: '',
              className: 'w-24 text-right',
              cell: (row) => (
                <Link href={`/td/questions?mode=round-1&category=${encodeURIComponent(row.data.key)}`} onClick={(event) => event.stopPropagation()} className="text-xs font-bold text-blue-700 underline underline-offset-2">
                  Its cards
                </Link>
              ),
            },
          ]}
        />
        <TdContentList
          type="box-categories"
          title="Round III · პაპა კარლოს ყუთი"
          description="Each category holds the box's questions. A category is approved with its questions."
          bulk={false}
          onOpen={(row) => setTarget({ type: 'box-categories', row })}
          onCreate={() => setTarget({ type: 'box-categories', row: null })}
          createLabel="New category"
          emptyTitle="No box categories yet"
          columns={[
            { header: 'Category', cell: (row) => <TdCellTitle title={row.data.title} sub={row.data.key} /> },
            {
              header: '',
              className: 'w-28 text-right',
              cell: (row) => (
                <Link href={`/td/questions?mode=round-3&category=${encodeURIComponent(row.data.key)}`} onClick={(event) => event.stopPropagation()} className="text-xs font-bold text-blue-700 underline underline-offset-2">
                  Its questions
                </Link>
              ),
            },
          ]}
        />
      </div>
      <TdContentEditorDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
