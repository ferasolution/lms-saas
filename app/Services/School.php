<?php

namespace App\Services;

use App\Http\Controllers\Api\ToolsController;
use App\Models\ClassSection;
use App\Models\SectionSubject;
use App\Models\StudentProfile;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantManager;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Shared rules for the school modules: who may work with which class, how
 * students and families are created, and who hears about what.
 */
class School
{
    /** Roles that run the school office (everything except billing and settings for managers). */
    public const OFFICE = [User::ROLE_ADMIN, User::ROLE_MANAGER];

    public function __construct(protected TenantManager $tenants, protected Notifier $notifier) {}

    public function isOffice(User $user): bool
    {
        return $user->hasRole(...self::OFFICE);
    }

    /** Section ids a teacher works with: class teacher of, or teaches a subject in. Null = all. */
    public function sectionIdsFor(User $user): ?array
    {
        if ($this->isOffice($user)) {
            return null;
        }
        if (! $user->hasRole(User::ROLE_INSTRUCTOR)) {
            return [];
        }

        return ClassSection::where('class_teacher_id', $user->id)->pluck('id')
            ->merge(SectionSubject::where('teacher_id', $user->id)->pluck('class_section_id'))
            ->unique()->values()->all();
    }

    public function canTeach(User $user, int $sectionId): bool
    {
        $ids = $this->sectionIdsFor($user);

        return $ids === null || in_array($sectionId, $ids, true);
    }

    /** Student user ids the viewer may see as "theirs": self for students, linked children for parents. */
    public function familyStudentIds(User $user): array
    {
        if ($user->hasRole(User::ROLE_STUDENT)) {
            return [$user->id];
        }
        if ($user->hasRole(User::ROLE_PARENT)) {
            return DB::table('guardian_student')->where('guardian_id', $user->id)->pluck('student_id')->all();
        }

        return [];
    }

    /** Next admission number, e.g. 2026-0042. */
    public function nextAdmissionNo(): string
    {
        $prefix = now()->format('Y').'-';
        $last = StudentProfile::where('admission_no', 'like', $prefix.'%')
            ->orderByDesc(DB::raw('LENGTH(admission_no)'))->orderByDesc('admission_no')->value('admission_no');
        $n = $last ? ((int) Str::after($last, $prefix)) + 1 : 1;

        do {
            $no = $prefix.str_pad((string) $n++, 4, '0', STR_PAD_LEFT);
        } while (StudentProfile::where('admission_no', $no)->exists());

        return $no;
    }

    /**
     * Create a student account with its school record. Returns [user, plainPassword|null].
     *
     * @param  array{name:string,email?:?string,password?:?string,phone?:?string}  $person
     */
    public function createStudent(array $person, array $profile): array
    {
        app(Billing::class)->ensureCanAdd($this->tenants->current(), 'students');

        [$user, $password] = $this->createUser(User::ROLE_STUDENT, $person);

        $p = new StudentProfile(array_merge([
            'admission_no' => $this->nextAdmissionNo(),
            'admitted_on' => now()->toDateString(),
            'status' => 'active',
        ], array_filter($profile, fn ($v) => $v !== null)));
        $p->user_id = $user->id;
        $p->save();

        return [$user, $password];
    }

    /**
     * Find a parent by email in this institute or create one. Returns [user, plainPassword|null, created].
     */
    public function findOrCreateGuardian(array $person): array
    {
        $email = strtolower(trim($person['email']));
        $existing = User::where('email', $email)->first();
        if ($existing) {
            abort_if(! $existing->hasRole(User::ROLE_PARENT), 422, "{$email} already has an account that isn’t a parent account.");

            return [$existing, null, false];
        }

        [$user, $password] = $this->createUser(User::ROLE_PARENT, $person);

        return [$user, $password, true];
    }

    public function link(User $guardian, User $student, string $relation = 'guardian'): void
    {
        DB::table('guardian_student')->updateOrInsert(
            ['guardian_id' => $guardian->id, 'student_id' => $student->id],
            ['tenant_id' => $this->tenants->id(), 'relation' => $relation, 'updated_at' => now(), 'created_at' => now()],
        );
    }

    /** Parents of the given students. */
    public function guardianIds(array $studentIds): array
    {
        return DB::table('guardian_student')->whereIn('student_id', $studentIds)->pluck('guardian_id')->unique()->values()->all();
    }

    /** Active student user ids in a section. */
    public function studentIdsIn(int $sectionId): array
    {
        return StudentProfile::where('class_section_id', $sectionId)->where('status', 'active')->pluck('user_id')->all();
    }

    /** Tell students in a section and their parents. */
    public function notifySection(int $sectionId, string $type, string $title, ?string $body, string $url, bool $parents = true): void
    {
        $students = $this->studentIdsIn($sectionId);
        $this->notifier->send($students, $type, $title, $body, $url, $this->tenants->id());
        if ($parents && $students) {
            $this->notifier->send($this->guardianIds($students), $type, $title, $body, $url, $this->tenants->id());
        }
    }

    public function notify($to, string $type, string $title, ?string $body = null, ?string $url = null): void
    {
        $this->notifier->send($to, $type, $title, $body, $url, $this->tenants->id());
    }

    /** @return array{0:User,1:?string} */
    protected function createUser(string $role, array $person): array
    {
        $email = ! empty($person['email'])
            ? strtolower(trim($person['email']))
            // Young students often have no email: give them a sign-in name on the school's address.
            : Str::slug(Str::limit($person['name'], 30, '')).'.'.Str::lower(Str::random(4)).'@'.$this->tenants->current()->slug.'.students';

        abort_if(User::where('email', $email)->exists(), 422, "{$email} is already used by someone at this institute.");

        $password = ! empty($person['password']) ? $person['password'] : ToolsController::readablePassword();

        $user = new User(['name' => $person['name'], 'email' => $email, 'phone' => $person['phone'] ?? null, 'password' => $password]);
        $user->role = $role;
        $user->tenant_id = $this->tenants->id();
        $user->save();

        return [$user, empty($person['password']) ? $password : null];
    }

    /** Compact section label map for many ids: [id => "Grade 5 – A"]. */
    public function sectionLabels(?array $ids = null): Collection
    {
        return ClassSection::with('schoolClass')
            ->when($ids !== null, fn ($q) => $q->whereIn('id', $ids))
            ->get()->mapWithKeys(fn ($s) => [$s->id => $s->label()]);
    }

    public function tenant(): Tenant
    {
        return $this->tenants->current();
    }
}
