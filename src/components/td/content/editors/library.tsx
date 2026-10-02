'use client';

import { TdMediaPicker, TdMediaThumb, TdUploadButton } from '@/components/td/media/td-media';
import { t } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';
import { issuesAt, TdField, TdIssueText, TdListField, TdOptionalTextField, TdSelectField, TdSwitchField, TdTextField, type TdListChange } from '../td-form';
import { KeyField, type TdEditorProps } from './rounds';

/** The right option's index after the options list changed: it follows its option. */
export function followAnswer(answer: number, change: TdListChange): number {
  if (change.kind === 'move') return answer === change.from ? change.to : answer === change.to ? change.from : answer;
  if (change.kind === 'remove') return change.index < answer ? answer - 1 : answer;
  return answer;
}

export function PracticeEditor({ value, onChange, issues, creating }: TdEditorProps<'practice-questions'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TdSelectField
          label={t('Difficulty')}
          value={value.difficulty}
          onChange={(difficulty) => onChange({ ...value, difficulty })}
          options={[
            { value: 'easy', label: t('Easy') },
            { value: 'medium', label: t('Medium') },
            { value: 'hard', label: t('Hard') },
          ]}
          issues={issuesAt(issues, 'data.difficulty')}
          hint={t('A run opens with 5 easy, then 10 medium, then hard.')}
        />
        <TdTextField label={t('Category')} value={value.category} onChange={(category) => onChange({ ...value, category })} issues={issuesAt(issues, 'data.category')} />
      </div>
      <TdTextField label={t('Question')} multiline value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })} issues={issuesAt(issues, 'data.prompt')} />
      <TdListField
        label={t('Options (choose the right one)')}
        values={value.options}
        onChange={(options, change) => onChange({ ...value, options, answer: followAnswer(value.answer, change) })}
        canRemove={(index) => (index === value.answer ? t('Mark another option as right before removing this one') : true)}
        issues={issues}
        path="data.options"
        max={8}
        addLabel={t('Add an option')}
        hint={t('2 to 8 options, in the order shown.')}
        renderMarker={(index) => (
          <input
            type="radio"
            name="practice-answer"
            aria-label={t('Option {n} is right', { n: index + 1 })}
            checked={value.answer === index}
            onChange={() => onChange({ ...value, answer: index })}
            className="mt-3 size-4 shrink-0 accent-(--td-primary)"
          />
        )}
      />
      <TdIssueText issues={issuesAt(issues, 'data.answer')} />
      <TdOptionalTextField label={t('Explanation (optional)')} multiline value={value.explanation} onChange={(explanation) => onChange({ ...value, explanation })} issues={issuesAt(issues, 'data.explanation')} />
      <TdMediaPicker label={t('Image (optional)')} value={value.imageKey} onChange={(imageKey) => onChange((current) => ({ ...current, imageKey }))} />
    </>
  );
}

export function MediaEditor({ value, onChange, issues, creating }: TdEditorProps<'media'>) {
  const rights = !value.author?.trim() || !value.license?.trim() || !value.source?.trim();
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdField label={t('Image')} issues={[...issuesAt(issues, 'data.uploadId'), ...issues.filter((i) => i.path === 'data')]}>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-(--td-input)/40 p-3">
          <TdMediaThumb uploadId={value.uploadId} url={value.url} alt={value.key} className="h-24 w-36" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-(--td-text-3)">
            {value.uploadId ? (
              <span>{t('Uploaded image · {width} × {height} px', { width: value.width, height: value.height })}</span>
            ) : value.url ? (
              <span className="break-all">{t('Kept by URL (from before uploads): {url}', { url: value.url })}</span>
            ) : (
              <span>{t('No image yet')}</span>
            )}
            {value.url && <span>{t('An image by URL cannot be changed; replace it with an upload.')}</span>}
          </div>
          <TdUploadButton
            variant="secondary"
            label={value.uploadId || value.url ? t('Replace with an upload') : t('Upload image')}
            onUploaded={(upload) => onChange((current) => ({ ...current, url: null, uploadId: upload.id, width: upload.width, height: upload.height }))}
          />
        </div>
      </TdField>
      <p className={cn('rounded-lg px-3 py-2 text-xs', rights ? 'bg-amber-50 text-amber-800' : 'bg-(--td-new)/10 text-(--td-new)')}>
        {rights ? t('A publisher approves an image only with its licence, credit and source.') : t('Rights recorded: a publisher can approve it.')}
      </p>
      <TdOptionalTextField label={t('Credit (author)')} value={value.author} onChange={(author) => onChange({ ...value, author })} issues={issuesAt(issues, 'data.author')} placeholder={t('Photographer or agency')} />
      <TdOptionalTextField label={t('Licence')} value={value.license} onChange={(license) => onChange({ ...value, license })} issues={issuesAt(issues, 'data.license')} placeholder={t('e.g. CC BY-SA 4.0, or the agreement')} />
      <TdOptionalTextField label={t('Source')} value={value.source} onChange={(source) => onChange({ ...value, source })} issues={issuesAt(issues, 'data.source')} placeholder={t('Where it comes from (a link or a reference)')} />
    </>
  );
}

export function ClubEditor({ value, onChange, issues, creating }: TdEditorProps<'clubs'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TdTextField label={t('Label')} value={value.label} onChange={(label) => onChange({ ...value, label })} issues={issuesAt(issues, 'data.label')} hint={t('As shown.')} />
        <TdTextField label={t('Value')} value={value.value} onChange={(next) => onChange({ ...value, value: next })} issues={issuesAt(issues, 'data.value')} hint={t('What a player’s pick stores.')} />
        <TdTextField label={t('Country')} value={value.country} onChange={(country) => onChange({ ...value, country })} issues={issuesAt(issues, 'data.country')} />
        <TdOptionalTextField label={t('Country (Georgian)')} value={value.countryKa} onChange={(countryKa) => onChange({ ...value, countryKa })} issues={issuesAt(issues, 'data.countryKa')} />
        <TdOptionalTextField label={t('Flag')} value={value.flag} onChange={(flag) => onChange({ ...value, flag })} issues={issuesAt(issues, 'data.flag')} placeholder="🇬🇪" />
        <TdTextField label={t('Crest file')} value={value.crest} onChange={(crest) => onChange({ ...value, crest })} issues={issuesAt(issues, 'data.crest')} hint={t('A file under /assets/clubs, such as dinamo-tbilisi.webp.')} />
      </div>
      <TdMediaPicker label={t('Uploaded crest')} value={value.crestImageKey} onChange={(crestImageKey) => onChange((current) => ({ ...current, crestImageKey }))} suggestedKey={`crest-${value.key}`} hint={t('Shown instead of the crest file when chosen. Upload one from Choose.')} />
      <TdSwitchField label={t('Hidden from the club picker')} checked={value.hidden} onChange={(hidden) => onChange({ ...value, hidden })} hint={t('Still resolvable, e.g. for Career Path crests.')} />
    </>
  );
}
