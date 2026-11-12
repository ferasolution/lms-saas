import { useEffect, useState } from 'react';
import { api, upload } from '../lib/api';
import { dateTime } from '../lib/format';
import Icon from './Icon';
import RichText from './RichText';
import { Button, Field, FileDrop, useToast } from './ui';

/** Student side of an assignment lesson: brief, hand-in form, and the grade once marked. */
export default function AssignmentPanel({ lesson, tenant, enrolled, onProgress }) {
    const toast = useToast();
    const [sub, setSub] = useState(lesson.submission ?? null);
    const [editing, setEditing] = useState(!lesson.submission);
    const [body, setBody] = useState(lesson.submission?.body ?? '');
    const [file, setFile] = useState(lesson.submission?.file_path ?? '');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const max = lesson.max_points ?? 100;

    // The outline only carries status and grade; fetch the full hand-in (text, file, feedback).
    useEffect(() => {
        if (!enrolled || !lesson.submission) return;
        api(`lessons/${lesson.id}/submission`, { tenant }).then((r) => {
            if (!r.submission) return;
            setSub(r.submission);
            setBody(r.submission.body ?? '');
            setFile(r.submission.file_path ?? '');
        }).catch(() => {});
    }, [lesson.id, lesson.submission, enrolled, tenant]);

    async function onFile(f) {
        setUploading(true);
        setUploadError(null);
        try {
            const kind = f.type === 'application/pdf' ? 'pdf' : 'image';
            setFile((await upload(f, kind, tenant)).url);
        } catch (err) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    }

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await api(`lessons/${lesson.id}/submission`, { method: 'POST', tenant, body: { body: body || null, file_path: file || null } });
            setSub(r.submission);
            setEditing(false);
            toast(sub ? 'Your work was updated' : 'Handed in — your teacher has been notified');
            onProgress?.(r.progress);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="margin-line rounded-2xl border border-rule bg-white p-6 pl-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-bold text-pencil"><Icon name="clipboard" size={18} />Assignment</p>
                    <span className="rounded-full bg-ink-50 px-3 py-0.5 text-sm font-bold text-ink">Marked out of {max}</span>
                </div>
                {lesson.content ? <RichText text={lesson.content} className="mt-3" /> : <p className="mt-3 text-pencil">Your teacher hasn’t added instructions yet.</p>}
                {lesson.file_path && (
                    <a href={lesson.file_path} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 font-bold text-ink hover:underline">
                        <Icon name="download" size={18} />Download the brief
                    </a>
                )}
            </div>

            {sub?.status === 'graded' && (
                <div className="rounded-2xl border border-leaf/30 bg-leaf-50 p-6">
                    <div className="flex items-baseline justify-between gap-4">
                        <p className="font-bold text-leaf">Graded {sub.graded_at ? dateTime(sub.graded_at) : ''}</p>
                        <p className="font-display text-4xl font-extrabold text-ink-deep tabular-nums">{sub.grade}<span className="text-xl text-pencil">/{max}</span></p>
                    </div>
                    {sub.feedback && <p className="mt-3 whitespace-pre-line text-graphite"><strong>Feedback: </strong>{sub.feedback}</p>}
                </div>
            )}

            {!enrolled ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900">Students hand in their work here. You’re seeing a preview.</p>
            ) : sub && !editing ? (
                <div className="rounded-2xl border border-rule bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="flex items-center gap-2 font-bold text-graphite">
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-leaf text-white"><Icon name="check" size={13} strokeWidth={3} /></span>
                            Handed in {dateTime(sub.submitted_at)}
                        </p>
                        {sub.status !== 'graded' && <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditing(true)}>Change my work</Button>}
                    </div>
                    {sub.body && <p className="mt-4 whitespace-pre-line text-graphite">{sub.body}</p>}
                    {sub.file_path && <a href={sub.file_path} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 font-bold text-ink hover:underline"><Icon name="file" size={18} />Your attached file</a>}
                    {sub.status !== 'graded' && <p className="mt-4 text-sm text-pencil">Waiting for your teacher to grade it. You’ll get a notification.</p>}
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink/25 bg-white p-6">
                    <p className="text-lg font-bold text-ink-deep">Your work</p>
                    <Field label="Answer" name="body" as="textarea" rows={8} error={error} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your answer here…" />
                    <Field label="Attach a file (optional)" name="file_path" error={error}>
                        <FileDrop kind="any" value={file} uploading={uploading} error={uploadError} onUpload={onFile} onClear={() => setFile('')} hint="PDF up to 20 MB, or a JPG/PNG photo up to 4 MB" />
                    </Field>
                    {error && !Object.keys(error.errors).length && <p className="text-margin" role="alert">{error.message}</p>}
                    <div className="flex gap-2">
                        <Button type="submit" size="lg" icon="check" busy={busy} disabled={uploading || (!body.trim() && !file)}>{sub ? 'Update my work' : 'Hand in'}</Button>
                        {sub && <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
                    </div>
                </form>
            )}
        </div>
    );
}
