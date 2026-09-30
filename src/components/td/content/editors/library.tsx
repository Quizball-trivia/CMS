'use client';

import { TdMediaPicker, TdMediaThumb, TdUploadButton } from '@/components/td/media/td-media';
import { cn } from '@/lib/utils';
import { issuesAt, TdField, TdIssueText, TdListField, TdOptionalTextField, TdSelectField, TdSwitchField, TdTextField } from '../td-form';
import { KeyField, type TdEditorProps } from './rounds';

export function PracticeEditor({ value, onChange, issues, creating }: TdEditorProps<'practice-questions'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TdSelectField
          label="Difficulty"
          value={value.difficulty}
          onChange={(difficulty) => onChange({ ...value, difficulty })}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
          issues={issuesAt(issues, 'data.difficulty')}
          hint="A run opens with 5 easy, then 10 medium, then hard."
        />
        <TdTextField label="Category" value={value.category} onChange={(category) => onChange({ ...value, category })} issues={issuesAt(issues, 'data.category')} />
      </div>
      <TdTextField label="Question" multiline value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })} issues={issuesAt(issues, 'data.prompt')} />
      <TdListField
        label="Options (choose the right one)"
        values={value.options}
        onChange={(options) => onChange({ ...value, options, answer: Math.min(value.answer, Math.max(0, options.length - 1)) })}
        issues={issues}
        path="data.options"
        max={8}
        addLabel="Add an option"
        hint="2 to 8 options, in the order shown."
        renderMarker={(index) => (
          <input
            type="radio"
            name="practice-answer"
            aria-label={`Option ${index + 1} is right`}
            checked={value.answer === index}
            onChange={() => onChange({ ...value, answer: index })}
            className="mt-3 size-4 shrink-0 accent-(--td-primary)"
          />
        )}
      />
      <TdIssueText issues={issuesAt(issues, 'data.answer')} />
      <TdOptionalTextField label="Explanation (optional)" multiline value={value.explanation} onChange={(explanation) => onChange({ ...value, explanation })} issues={issuesAt(issues, 'data.explanation')} />
      <TdMediaPicker label="Image (optional)" value={value.imageKey} onChange={(imageKey) => onChange({ ...value, imageKey })} />
    </>
  );
}

export function MediaEditor({ value, onChange, issues, creating }: TdEditorProps<'media'>) {
  const rights = !value.author?.trim() || !value.license?.trim() || !value.source?.trim();
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdField label="Image" issues={[...issuesAt(issues, 'data.uploadId'), ...issues.filter((i) => i.path === 'data')]}>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-(--td-input)/40 p-3">
          <TdMediaThumb uploadId={value.uploadId} url={value.url} alt={value.key} className="h-24 w-36" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-(--td-text-3)">
            {value.uploadId ? <span>Uploaded image · {value.width} × {value.height} px</span> : value.url ? <span className="break-all">Kept by URL (from before uploads): {value.url}</span> : <span>No image yet</span>}
            {value.url && <span>An image by URL cannot be changed; replace it with an upload.</span>}
          </div>
          <TdUploadButton
            variant="secondary"
            label={value.uploadId || value.url ? 'Replace with an upload' : 'Upload image'}
            onUploaded={(upload) => onChange({ ...value, url: null, uploadId: upload.id, width: upload.width, height: upload.height })}
          />
        </div>
      </TdField>
      <p className={cn('rounded-lg px-3 py-2 text-xs', rights ? 'bg-amber-400/10 text-amber-300' : 'bg-(--td-new)/10 text-(--td-new)')}>
        {rights ? 'A publisher approves an image only with its licence, credit and source.' : 'Rights recorded: a publisher can approve it.'}
      </p>
      <TdOptionalTextField label="Credit (author)" value={value.author} onChange={(author) => onChange({ ...value, author })} issues={issuesAt(issues, 'data.author')} placeholder="Photographer or agency" />
      <TdOptionalTextField label="Licence" value={value.license} onChange={(license) => onChange({ ...value, license })} issues={issuesAt(issues, 'data.license')} placeholder="e.g. CC BY-SA 4.0, or the agreement" />
      <TdOptionalTextField label="Source" value={value.source} onChange={(source) => onChange({ ...value, source })} issues={issuesAt(issues, 'data.source')} placeholder="Where it comes from (a link or a reference)" />
    </>
  );
}

export function ClubEditor({ value, onChange, issues, creating }: TdEditorProps<'clubs'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TdTextField label="Label" value={value.label} onChange={(label) => onChange({ ...value, label })} issues={issuesAt(issues, 'data.label')} hint="As shown." />
        <TdTextField label="Value" value={value.value} onChange={(next) => onChange({ ...value, value: next })} issues={issuesAt(issues, 'data.value')} hint="What a player’s pick stores." />
        <TdTextField label="Country" value={value.country} onChange={(country) => onChange({ ...value, country })} issues={issuesAt(issues, 'data.country')} />
        <TdOptionalTextField label="Country (Georgian)" value={value.countryKa} onChange={(countryKa) => onChange({ ...value, countryKa })} issues={issuesAt(issues, 'data.countryKa')} />
        <TdOptionalTextField label="Flag" value={value.flag} onChange={(flag) => onChange({ ...value, flag })} issues={issuesAt(issues, 'data.flag')} placeholder="🇬🇪" />
        <TdTextField label="Crest file" value={value.crest} onChange={(crest) => onChange({ ...value, crest })} issues={issuesAt(issues, 'data.crest')} hint="A file under /assets/clubs, such as dinamo-tbilisi.webp." />
      </div>
      <TdMediaPicker label="Uploaded crest" value={value.crestImageKey} onChange={(crestImageKey) => onChange({ ...value, crestImageKey })} suggestedKey={`crest-${value.key}`} hint="Shown instead of the crest file when chosen. Upload one from Choose." />
      <TdSwitchField label="Hidden from the club picker" checked={value.hidden} onChange={(hidden) => onChange({ ...value, hidden })} hint="Still resolvable, e.g. for Career Path crests." />
    </>
  );
}
