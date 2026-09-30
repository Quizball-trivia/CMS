'use client';

import { useState } from 'react';
import { ImageIcon, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TdCellTitle, TdContentList } from '@/components/td/content/td-content-list';
import { TdContentEditorSheet, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import type { TdContentRow } from '@/lib/td/admin-api';
import { useInitialSearch } from './use-initial-search';

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Pencil />
    </Button>
  );
}

const points = (value: number) => '●'.repeat(value);

/** ბარათონი: card categories, then the cards of the one chosen. */
export function TdCardsTab() {
  const [category, setCategory] = useState<TdContentRow<'card-categories'> | null>(null);
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const initial = useInitialSearch();
  return (
    <>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <TdContentList
          type="card-categories"
          title="Categories"
          description="Choose one to see its cards. A category is approved with its cards."
          bulk={false}
          selectedId={category?.id}
          onOpen={(row) => setCategory(row)}
          onCreate={() => setTarget({ type: 'card-categories', row: null })}
          createLabel="New category"
          emptyTitle="No card categories yet"
          columns={[
            { header: 'Category', cell: (row) => <TdCellTitle title={row.data.prompt} sub={row.data.key} /> },
            { header: '', className: 'w-10', cell: (row) => <EditButton label="Edit category" onClick={() => setTarget({ type: 'card-categories', row })} /> },
          ]}
        />
        <TdContentList
          type="cards"
          title={category ? `Cards of “${category.data.key}”` : 'All cards'}
          description="Photo, value 1–3, clue lines, the answer and its accepted spellings."
          fixedQuery={category ? { category: category.data.key } : undefined}
          initialSearch={initial}
          onOpen={(row) => setTarget({ type: 'cards', row })}
          onCreate={() => setTarget({ type: 'cards', row: null, preset: { categoryKey: category?.data.key ?? '' } })}
          createLabel="New card"
          searchPlaceholder="Search answers, spellings, clue lines"
          emptyTitle="No cards yet"
          actions={
            category && (
              <Button variant="secondary" className="rounded-lg" onClick={() => setCategory(null)}>
                All categories
              </Button>
            )
          }
          columns={[
            { header: 'Answer', cell: (row) => <TdCellTitle title={row.data.display} sub={`${row.data.categoryKey}/${row.data.key}`} /> },
            { header: 'Value', className: 'w-20', cell: (row) => <span className="text-primary" title={`${row.data.value} points`}>{points(row.data.value)}</span> },
            {
              header: 'Clues',
              className: 'hidden md:table-cell',
              cell: (row) => (
                <span className="flex items-center gap-2 text-xs text-(--td-text-3)">
                  {row.data.lines.length} line{row.data.lines.length === 1 ? '' : 's'}
                  {(row.data.imageKey || row.data.photo) && <ImageIcon className="size-3.5" aria-label="Has a photo" />}
                </span>
              ),
            },
          ]}
        />
      </div>
      <TdContentEditorSheet target={target} onClose={() => setTarget(null)} onSaved={(row) => target?.type === 'card-categories' && category?.id === row.id && setCategory(row as TdContentRow<'card-categories'>)} />
    </>
  );
}

/** გამარჯობა ჩემი სახელია: subjects with ordered clues. */
export function TdWhoamiTab() {
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const initial = useInitialSearch();
  return (
    <>
      <TdContentList
        type="whoami-subjects"
        title="Subjects"
        description="Each subject is read out clue by clue; a match reads 5."
        initialSearch={initial}
        onOpen={(row) => setTarget({ type: 'whoami-subjects', row })}
        onCreate={() => setTarget({ type: 'whoami-subjects', row: null })}
        createLabel="New subject"
        searchPlaceholder="Search answers and clues"
        emptyTitle="No subjects yet"
        columns={[
          { header: 'Answer', cell: (row) => <TdCellTitle title={row.data.display} sub={row.data.key} /> },
          { header: 'Clues', className: 'w-24', cell: (row) => <span className="tabular-nums">{row.data.clues.length}</span> },
          { header: 'First clue', className: 'hidden md:table-cell', cell: (row) => <span className="line-clamp-1 text-xs text-(--td-text-3)">{row.data.clues[0]}</span> },
        ]}
      />
      <TdContentEditorSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

/** პაპა კარლოს ყუთი: box categories, then the questions of the one chosen. */
export function TdBoxTab() {
  const [category, setCategory] = useState<TdContentRow<'box-categories'> | null>(null);
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const initial = useInitialSearch();
  return (
    <>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <TdContentList
          type="box-categories"
          title="Categories"
          description="Choose one to see its questions. A category is approved with its questions."
          bulk={false}
          selectedId={category?.id}
          onOpen={(row) => setCategory(row)}
          onCreate={() => setTarget({ type: 'box-categories', row: null })}
          createLabel="New category"
          emptyTitle="No box categories yet"
          columns={[
            { header: 'Category', cell: (row) => <TdCellTitle title={row.data.title} sub={row.data.key} /> },
            { header: '', className: 'w-10', cell: (row) => <EditButton label="Edit category" onClick={() => setTarget({ type: 'box-categories', row })} /> },
          ]}
        />
        <TdContentList
          type="box-questions"
          title={category ? `Questions of “${category.data.key}”` : 'All questions'}
          description="The question, the answer and its accepted spellings."
          fixedQuery={category ? { category: category.data.key } : undefined}
          initialSearch={initial}
          onOpen={(row) => setTarget({ type: 'box-questions', row })}
          onCreate={() => setTarget({ type: 'box-questions', row: null, preset: { categoryKey: category?.data.key ?? '' } })}
          createLabel="New question"
          searchPlaceholder="Search questions and answers"
          emptyTitle="No questions yet"
          actions={
            category && (
              <Button variant="secondary" className="rounded-lg" onClick={() => setCategory(null)}>
                All categories
              </Button>
            )
          }
          columns={[
            { header: 'Question', cell: (row) => <TdCellTitle title={row.data.q} sub={`${row.data.categoryKey}/${row.data.key}`} /> },
            { header: 'Answer', className: 'hidden md:table-cell', cell: (row) => <span className="line-clamp-1">{row.data.display}</span> },
          ]}
        />
      </div>
      <TdContentEditorSheet target={target} onClose={() => setTarget(null)} onSaved={(row) => target?.type === 'box-categories' && category?.id === row.id && setCategory(row as TdContentRow<'box-categories'>)} />
    </>
  );
}

export function TdPenaltiesTab() {
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const initial = useInitialSearch();
  return (
    <>
      <TdContentList
        type="penalty-questions"
        title="Penalty questions"
        description="The shoot-out’s own pool: 10 questions, then up to 10 more in sudden death."
        initialSearch={initial}
        onOpen={(row) => setTarget({ type: 'penalty-questions', row })}
        onCreate={() => setTarget({ type: 'penalty-questions', row: null })}
        createLabel="New question"
        searchPlaceholder="Search questions and answers"
        emptyTitle="No penalty questions yet"
        columns={[
          { header: 'Question', cell: (row) => <TdCellTitle title={row.data.q} sub={row.data.key} /> },
          { header: 'Answer', className: 'hidden md:table-cell', cell: (row) => <span className="line-clamp-1">{row.data.display}</span> },
        ]}
      />
      <TdContentEditorSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}
