import { useEffect, useState } from 'react';
import { api, upload } from '../../lib/api';
import { LESSON_TYPES, videoEmbed } from '../../lib/format';
import Icon from '../../components/Icon';
import { Button, Field, FileDrop, SlideOver, Toggle } from '../../components/ui';

const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function LessonEditor({ open, lesson, sectionId, type: newType, tenant, onClose, onSaved }) {
    const isNew = !lesson;
    const type = lesson?.type ?? newType ?? 'text';
    const meta = LESSON_TYPES[type] ?? LESSON_TYPES.text;

    const [form, setForm] = useState({});
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setUploadError(null);
        setForm({
            title: lesson?.title ?? '',
            summary: lesson?.summary ?? '',
            content: lesson?.content ?? '',
            video_url: lesson?.video_url ?? '',
            file_path: lesson?.file_path ?? '',
            live_url: lesson?.live_url ?? '',
            live_starts_at: toLocalInput(lesson?.live_starts_at),
            minutes: lesson?.duration_seconds ? String(Math.round(lesson.duration_seconds / 60)) : '',
            is_preview: lesson?.is_preview ?? false,
            drip_days: lesson?.drip_days ? String(lesson.drip_days) : '',
            max_points: lesson?.max_points ? String(lesson.max_points) : '100',
        });
    }, [open, lesson]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function onFile(file) {
        setUploading(true);
        setUploadError(null);
        try {
            const res = await upload(file, 'pdf', tenant);
            setForm((f) => ({ ...f, file_path: res.url, title: f.title || res.name.replace(/\.pdf$/i, '') }));
        } catch (err) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    }

    async function save(e) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        const body = {
            title: form.title,
            summary: form.summary || null,
            duration_seconds: form.minutes ? Math.round(Number(form.minutes) * 60) : 0,
            is_preview: type === 'quiz' ? false : form.is_preview,
            drip_days: form.drip_days ? Number(form.drip_days) : null,
        };
        if (type === 'video') body.video_url = form.video_url || null;
        if (type === 'text' || type === 'pdf' || type === 'live' || type === 'assignment') body.content = form.content || null;
        if (type === 'assignment') {
            body.max_points = form.max_points ? Number(form.max_points) : 100;
            body.file_path = form.file_path || null;
        }
        if (type === 'pdf') body.file_path = form.file_path || null;
        if (type === 'live') {
            body.live_url = form.live_url || null;
            body.live_starts_at = form.live_starts_at ? new Date(form.live_starts_at).toISOString() : null;
        }
        if (isNew) body.type = type;

        try {
            const saved = await api(isNew ? `sections/${sectionId}/lessons` : `lessons/${lesson.id}`, {
                method: isNew ? 'POST' : 'PATCH', tenant, body,
            });
            onSaved(saved, isNew);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const embed = type === 'video' ? videoEmbed(form.video_url) : null;

    return (
        <SlideOver open={open} onClose={onClose}
            title={isNew ? `New ${meta.label.toLowerCase()} lesson` : 'Edit lesson'}
            description={type === 'quiz' && isNew ? 'After saving you’ll add the questions.' : meta.hint}
            footer={<>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button busy={busy} onClick={save}>{isNew ? (type === 'quiz' ? 'Create and add questions' : 'Add lesson') : 'Save lesson'}</Button>
            </>}>
            <form className="space-y-5" onSubmit={save} noValidate>
                {error && !Object.keys(error.errors).length && <p className="rounded-lg bg-margin/5 px-3 py-2 text-margin" role="alert">{error.message}</p>}

                <Field label="Title" name="title" error={error} value={form.title ?? ''} onChange={set('title')}
                    placeholder={type === 'quiz' ? 'e.g. Chapter 1 check' : 'e.g. Introduction to fractions'} />

                {type === 'video' && (
                    <>
                        <Field label="Video link" name="video_url" type="url" error={error} value={form.video_url ?? ''} onChange={set('video_url')}
                            placeholder="https://www.youtube.com/watch?v=…" hint="Paste a YouTube, Vimeo or Bunny Stream link. Unlisted YouTube videos work well." />
                        {embed?.kind === 'iframe' && (
                            <div className="aspect-video overflow-hidden rounded-xl bg-ink-deep ring-1 ring-rule">
                                <iframe src={embed.src} title="Video preview" className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
                            </div>
                        )}
                    </>
                )}

                {type === 'pdf' && (
                    <Field label="PDF file" name="file_path" error={error}>
                        <FileDrop kind="pdf" value={form.file_path} uploading={uploading} error={uploadError}
                            onUpload={onFile} onClear={() => setForm((f) => ({ ...f, file_path: '' }))} />
                    </Field>
                )}

                {type === 'live' && (
                    <>
                        <Field label="Meeting link" name="live_url" type="url" error={error} value={form.live_url ?? ''} onChange={set('live_url')}
                            placeholder="https://zoom.us/j/… or https://meet.google.com/…" />
                        <Field label="Starts at" name="live_starts_at" type="datetime-local" error={error} value={form.live_starts_at ?? ''} onChange={set('live_starts_at')} />
                    </>
                )}

                {type === 'assignment' && (
                    <>
                        <Field label="Instructions" name="content" as="textarea" rows={8} error={error} value={form.content ?? ''} onChange={set('content')}
                            placeholder="What should students hand in? Include the length, format and what you’ll be looking for."
                            hint="Students can type their answer, attach a PDF or image, or both." />
                        <Field label="Worksheet or brief (optional)" name="file_path" error={error}>
                            <FileDrop kind="pdf" value={form.file_path} uploading={uploading} error={uploadError}
                                onUpload={onFile} onClear={() => setForm((f) => ({ ...f, file_path: '' }))} />
                        </Field>
                        <Field label="Marked out of" name="max_points" type="number" min="1" max="1000" inputMode="numeric" className="sm:w-56"
                            error={error} value={form.max_points ?? ''} onChange={set('max_points')} />
                    </>
                )}

                {(type === 'text' || type === 'pdf' || type === 'live') && (
                    <Field label={type === 'text' ? 'Lesson content' : 'Notes for students (optional)'} name="content" as="textarea"
                        rows={type === 'text' ? 14 : 4} error={error} value={form.content ?? ''} onChange={set('content')}
                        hint={type === 'text' ? 'Blank lines start a new paragraph. Lines starting with “- ” become a list, “# ” a heading.' : null} />
                )}

                <Field label="Short summary (optional)" name="summary" error={error} value={form.summary ?? ''} onChange={set('summary')}
                    hint="Shown under the title in the course outline." />

                {type !== 'quiz' && (
                    <Field label="Length in minutes (optional)" name="duration_seconds" type="number" min="0" inputMode="numeric" className="sm:w-56"
                        error={error} value={form.minutes ?? ''} onChange={set('minutes')} />
                )}

                <div className="space-y-4 rounded-xl border border-rule bg-white p-4">
                    {type !== 'quiz' && (
                        <Toggle label="Free preview" hint="Anyone can open this lesson before enrolling."
                            checked={!!form.is_preview} onChange={(v) => setForm((f) => ({ ...f, is_preview: v }))} />
                    )}
                    <div className={type !== 'quiz' ? 'border-t border-rule pt-4' : ''}>
                        <p className="font-bold text-graphite">Release on a schedule</p>
                        <p className="text-sm text-pencil">Open this lesson a number of days after a student enrols. Leave empty to open it straight away.</p>
                        <div className="mt-2 flex items-center gap-2">
                            <input type="number" min="0" max="365" inputMode="numeric" aria-label="Days after enrolment" value={form.drip_days ?? ''} onChange={set('drip_days')}
                                className="h-11 w-24 rounded-lg border border-rule bg-white px-3 focus:border-ink focus:ring-4 focus:ring-ink/10 focus:outline-none" />
                            <span className="text-pencil">days after enrolling</span>
                        </div>
                    </div>
                </div>

                {type === 'quiz' && !isNew && (
                    <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                        <Icon name="quiz" size={18} className="mt-0.5 shrink-0" />
                        Questions, pass mark and time limit are edited on the quiz page.
                    </p>
                )}
                <button type="submit" className="hidden" />
            </form>
        </SlideOver>
    );
}
