import { useState } from 'react';
import { api, upload } from '../../lib/api';
import { Button, ConfirmDialog, Field, FileDrop, Toggle, useToast } from '../../components/ui';

const LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export default function DetailsTab({ course, tenant, onSaved, onDeleted }) {
    const toast = useToast();
    const [form, setForm] = useState(() => ({
        title: course.title ?? '',
        short_description: course.short_description ?? '',
        description: course.description ?? '',
        what_you_learn: course.what_you_learn ?? '',
        thumbnail: course.thumbnail ?? '',
        level: course.level ?? 'beginner',
        is_free: course.is_free || Number(course.price) === 0,
        price: Number(course.price) ? String(Number(course.price)) : '',
        sale_price: course.sale_price ? String(Number(course.sale_price)) : '',
        certificate_enabled: course.certificate_enabled ?? true,
    }));
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function onImage(file) {
        setUploading(true);
        setUploadError(null);
        try {
            const res = await upload(file, 'image', tenant);
            setForm((f) => ({ ...f, thumbnail: res.url }));
        } catch (err) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    }

    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api(`courses/${course.id}`, {
                method: 'PATCH', tenant, body: {
                    title: form.title,
                    short_description: form.short_description || null,
                    description: form.description || null,
                    what_you_learn: form.what_you_learn || null,
                    thumbnail: form.thumbnail || null,
                    level: form.level,
                    is_free: form.is_free,
                    price: form.is_free ? 0 : Number(form.price || 0),
                    sale_price: form.is_free || !form.sale_price ? null : Number(form.sale_price),
                    certificate_enabled: form.certificate_enabled,
                },
            });
            toast('Course details saved');
            onSaved();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        await api(`courses/${course.id}`, { method: 'DELETE', tenant });
        onDeleted();
    }

    return (
        <form onSubmit={save} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" noValidate>
            <div className="space-y-6">
                <Card title="Basics">
                    <Field label="Title" name="title" error={error} value={form.title} onChange={set('title')} />
                    <Field label="Short description" name="short_description" error={error} value={form.short_description} onChange={set('short_description')}
                        hint="One line shown on course cards." maxLength={500} />
                    <Field label="About this course" name="description" as="textarea" rows={6} error={error} value={form.description} onChange={set('description')}
                        placeholder="Who is it for, what does it cover, what do students need before starting?" />
                    <Field label="What students will learn" name="what_you_learn" as="textarea" rows={5} error={error} value={form.what_you_learn} onChange={set('what_you_learn')}
                        hint="One point per line. Shown as a checklist on the course page." placeholder={'Hold a 5-minute conversation\nWrite a formal email\nUse past and present tense correctly'} />
                    <Field label="Level" name="level" error={error}>
                        <div className="grid grid-cols-3 gap-2">
                            {Object.entries(LEVELS).map(([value, label]) => (
                                <button key={value} type="button" onClick={() => setForm({ ...form, level: value })} aria-pressed={form.level === value}
                                    className={`h-11 rounded-lg border text-[15px] font-bold transition ${form.level === value ? 'border-ink bg-ink-50 text-ink-deep' : 'border-rule bg-white text-pencil hover:border-ink/30'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </Field>
                </Card>

                <Card title="Pricing">
                    <Toggle label="Free course" hint="Students enrol with one click." checked={form.is_free} onChange={(v) => setForm({ ...form, is_free: v })} />
                    {!form.is_free && (
                        <div className="grid gap-4 border-t border-rule pt-4 sm:grid-cols-2">
                            <Field label={`Price (${course.currency})`} name="price" type="number" min="0" inputMode="numeric" error={error} value={form.price} onChange={set('price')} />
                            <Field label="Sale price (optional)" name="sale_price" type="number" min="0" inputMode="numeric" error={error} value={form.sale_price} onChange={set('sale_price')}
                                hint="Shown with the full price crossed out." />
                        </div>
                    )}
                </Card>
            </div>

            <div className="space-y-6">
                <Card title="Cover image">
                    <FileDrop kind="image" value={form.thumbnail} uploading={uploading} error={uploadError}
                        onUpload={onImage} onClear={() => setForm({ ...form, thumbnail: '' })} hint="16:9 works best. Without one we draw a notebook cover." />
                </Card>
                <Card title="Completion">
                    <Toggle label="Certificate" hint="Issue a certificate when a student finishes every lesson."
                        checked={form.certificate_enabled} onChange={(v) => setForm({ ...form, certificate_enabled: v })} />
                </Card>
                <div className="sticky top-6 space-y-3">
                    <Button type="submit" className="w-full" busy={busy}>Save details</Button>
                    <Button variant="ghost" className="w-full text-margin hover:bg-margin/5" icon="trash" onClick={() => setDeleting(true)}>Delete course</Button>
                </div>
            </div>

            <ConfirmDialog open={deleting} title="Delete this course?" confirmLabel="Delete course" onConfirm={remove} onClose={() => setDeleting(false)}>
                <strong className="text-graphite">{course.title}</strong> will be removed for everyone, including enrolled students.
            </ConfirmDialog>
        </form>
    );
}

function Card({ title, children }) {
    return (
        <section className="space-y-5 rounded-2xl border border-rule bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold">{title}</h2>
            {children}
        </section>
    );
}
