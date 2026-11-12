<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\StudentProfile;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SchoolTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $teacher;

    private User $otherTeacher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10)]);
        Tenant::factory()->create(['slug' => 'other', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = $this->person('admin');
        $this->teacher = $this->person('instructor');
        $this->otherTeacher = $this->person('instructor');
    }

    private function person(string $role, string $slug = 'acme'): User
    {
        return User::factory()->role($role)->create(['tenant_id' => Tenant::where('slug', $slug)->value('id')]);
    }

    private function as(User $user, string $slug = 'acme'): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => $slug, 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    /** Grade 5 with sections A and B, Math taught by $this->teacher in A, who is also A's class teacher. */
    private function structure(): array
    {
        $this->as($this->admin)->postJson('/api/school/classes', ['name' => 'Grade 5', 'sections' => ['A', 'B']])->assertCreated();
        $math = $this->as($this->admin)->postJson('/api/school/subjects', ['name' => 'Mathematics', 'code' => 'MATH'])->assertCreated()->json('id');
        $classes = $this->as($this->admin)->getJson('/api/school/structure')->assertOk()->json('classes');
        [$a, $b] = $classes[0]['sections'];
        $this->as($this->admin)->patchJson("/api/school/sections/{$a['id']}", ['class_teacher_id' => $this->teacher->id])->assertOk();
        $this->as($this->admin)->putJson("/api/school/sections/{$a['id']}/subjects", ['subjects' => [['subject_id' => $math, 'teacher_id' => $this->teacher->id]]])->assertOk();

        return [$a['id'], $b['id'], $math];
    }

    private function admit(int $sectionId, string $name = 'Lily Carter', string $parentEmail = 'anna.carter@example.com'): array
    {
        $res = $this->as($this->admin)->postJson('/api/school/students', [
            'name' => $name, 'class_section_id' => $sectionId, 'roll_no' => '1', 'gender' => 'female',
            'guardians' => [['name' => 'Anna Carter', 'email' => $parentEmail, 'relation' => 'mother']],
        ])->assertCreated()->json();

        return [User::find($res['id']), User::where('email', $parentEmail)->first(), $res];
    }

    public function test_office_builds_structure_and_admits_a_student_with_parent(): void
    {
        [$a] = $this->structure();
        [$student, $parent, $res] = $this->admit($a);

        $this->assertSame('parent', $parent->role);
        $this->assertCount(2, $res['logins']);
        $this->assertMatchesRegularExpression('/^\d{4}-0001$/', StudentProfile::where('user_id', $student->id)->value('admission_no'));
        $this->assertDatabaseHas('guardian_student', ['guardian_id' => $parent->id, 'student_id' => $student->id, 'relation' => 'mother']);

        // A sibling links to the same parent account instead of creating another.
        [$sibling] = $this->admit($a, 'Max Carter');
        $this->assertSame(1, User::where('email', 'anna.carter@example.com')->count());
        $this->assertSame(2, $parent->children()->count());
        $this->assertNotSame(StudentProfile::where('user_id', $student->id)->value('admission_no'), StudentProfile::where('user_id', $sibling->id)->value('admission_no'));

        $list = $this->as($this->admin)->getJson("/api/school/students?section_id={$a}")->assertOk()->json('data');
        $this->assertCount(2, $list);
        $this->assertSame('Anna Carter', $list[0]['guardians'][0]['name']);

        // Classes with students can’t be deleted.
        $classId = $this->as($this->admin)->getJson('/api/school/structure')->json('classes.0.id');
        $this->as($this->admin)->deleteJson("/api/school/classes/{$classId}")->assertStatus(422);
    }

    public function test_attendance_alerts_parents_and_teachers_only_see_their_sections(): void
    {
        [$a, $b] = $this->structure();
        [$student, $parent] = $this->admit($a);

        $sheet = $this->as($this->teacher)->getJson("/api/school/attendance?section_id={$a}")->assertOk()->json();
        $this->assertFalse($sheet['taken']);
        $this->assertSame($student->id, $sheet['students'][0]['id']);

        $this->as($this->teacher)->postJson('/api/school/attendance', [
            'section_id' => $a, 'date' => now()->toDateString(),
            'records' => [['student_id' => $student->id, 'status' => 'absent']],
        ])->assertOk()->assertJson(['alerts' => 1]);
        $this->assertSame(1, UserNotification::where('user_id', $parent->id)->where('type', 'attendance_absent')->count());

        // Saving again without a change doesn't alert twice.
        $this->as($this->teacher)->postJson('/api/school/attendance', [
            'section_id' => $a, 'date' => now()->toDateString(), 'records' => [['student_id' => $student->id, 'status' => 'absent']],
        ])->assertOk()->assertJson(['alerts' => 0]);

        // The other teacher doesn't teach section A; nobody can mark section B students into A.
        $this->as($this->otherTeacher)->getJson("/api/school/attendance?section_id={$a}")->assertForbidden();
        $this->as($this->teacher)->getJson("/api/school/attendance?section_id={$b}")->assertForbidden();

        $month = $this->as($this->teacher)->getJson("/api/school/attendance/month?section_id={$a}")->assertOk()->json();
        $this->assertSame(1, $month['students'][0]['absent']);
        $this->as($this->admin)->getJson('/api/school/attendance/today')->assertOk()->assertJsonPath('totals.absent', 1);

        // Parent sees it on the family view.
        $family = $this->as($parent)->getJson('/api/school/family')->assertOk()->json('children');
        $this->assertSame('absent', $family[0]['today_attendance']);
    }

    public function test_diary_homework_hand_in_and_checking(): void
    {
        [$a, , $math] = $this->structure();
        [$student, $parent] = $this->admit($a);

        $entry = $this->as($this->teacher)->postJson('/api/school/diary', [
            'class_section_id' => $a, 'subject_id' => $math, 'kind' => 'homework', 'title' => 'Fractions worksheet',
            'body' => 'Questions 1–10', 'due_on' => now()->addDays(2)->toDateString(), 'accepts_submissions' => true, 'max_marks' => 10,
        ])->assertCreated()->json();
        $this->assertSame(1, UserNotification::where('user_id', $parent->id)->where('type', 'diary')->count());
        $this->assertSame(1, UserNotification::where('user_id', $student->id)->where('type', 'diary')->count());

        // Parent sees it, with no hand-in yet; homework due shows on the family view.
        $seen = $this->as($parent)->getJson('/api/school/diary')->assertOk()->json('data');
        $this->assertSame('Fractions worksheet', $seen[0]['title']);
        $this->assertNull($seen[0]['children'][0]['submission']);
        $this->assertCount(1, $this->as($parent)->getJson('/api/school/family')->json('children.0.homework_due'));

        $sub = $this->as($student)->postJson("/api/school/diary/{$entry['id']}/submit", ['body' => 'My answers'])->assertCreated()->json();
        $roster = $this->as($this->teacher)->getJson("/api/school/diary/{$entry['id']}/submissions")->assertOk()->json('students');
        $this->assertSame('submitted', $roster[0]['submission']['status']);

        $this->as($this->teacher)->patchJson("/api/school/homework/{$sub['id']}", ['status' => 'checked', 'marks' => 11])->assertStatus(422);
        $this->as($this->teacher)->patchJson("/api/school/homework/{$sub['id']}", ['status' => 'checked', 'marks' => 9, 'feedback' => 'Neat work'])->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $parent->id)->where('type', 'homework_checked')->count());
        $this->as($student)->postJson("/api/school/diary/{$entry['id']}/submit", ['body' => 'Again'])->assertStatus(422);

        // Other teachers can't edit someone else's entry or post in a section they don't teach.
        $this->as($this->otherTeacher)->patchJson("/api/school/diary/{$entry['id']}", ['title' => 'x'])->assertForbidden();
        $this->as($this->otherTeacher)->postJson('/api/school/diary', ['class_section_id' => $a, 'kind' => 'notice', 'title' => 'x'])->assertForbidden();
    }

    public function test_timetable_blocks_teacher_double_booking(): void
    {
        [$a, $b, $math] = $this->structure();
        $slot = ['weekday' => 1, 'starts_at' => '08:00', 'ends_at' => '08:45', 'subject_id' => $math, 'teacher_id' => $this->teacher->id];

        $this->as($this->admin)->putJson("/api/school/timetable/sections/{$a}", ['slots' => [$slot, ['weekday' => 1, 'starts_at' => '08:45', 'ends_at' => '09:00', 'label' => 'Break']]])
            ->assertOk()->assertJsonCount(2, 'slots');
        $this->as($this->admin)->putJson("/api/school/timetable/sections/{$b}", ['slots' => [array_merge($slot, ['starts_at' => '08:30', 'ends_at' => '09:15'])]])
            ->assertStatus(422)->assertJsonValidationErrors('slots.0.teacher_id');

        $mine = $this->as($this->teacher)->getJson('/api/school/timetable/mine')->assertOk()->json('slots');
        $this->assertCount(1, $mine);
        $this->as($this->teacher)->putJson("/api/school/timetable/sections/{$a}", ['slots' => []])->assertForbidden();
    }

    public function test_leave_request_approval_fills_the_register(): void
    {
        [$a] = $this->structure();
        [$student, $parent] = $this->admit($a);

        $id = $this->as($parent)->postJson('/api/school/leave', [
            'student_id' => $student->id, 'from_date' => now()->toDateString(), 'to_date' => now()->addDay()->toDateString(), 'reason' => 'Family wedding',
        ])->assertCreated()->json('id');
        $this->assertSame(1, UserNotification::where('user_id', $this->teacher->id)->where('type', 'leave')->count());

        // A parent can't ask for someone else's child.
        $stranger = $this->person('parent');
        $this->as($stranger)->postJson('/api/school/leave', ['student_id' => $student->id, 'from_date' => now()->toDateString(), 'to_date' => now()->toDateString(), 'reason' => 'x'])
            ->assertStatus(422);

        $this->as($this->teacher)->postJson("/api/school/leave/{$id}/review", ['status' => 'approved'])->assertOk();
        $this->assertSame(2, AttendanceRecord::where('student_id', $student->id)->where('status', 'leave')->count());
        $this->as($this->teacher)->postJson("/api/school/leave/{$id}/review", ['status' => 'rejected'])->assertStatus(422);
        $this->assertSame('approved', $this->as($parent)->getJson('/api/school/leave')->json('data.0.status'));
    }

    public function test_public_application_to_enrolment(): void
    {
        [$a] = $this->structure();
        $classId = $this->as($this->admin)->getJson('/api/school/structure')->json('classes.0.id');

        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['X-Tenant' => 'acme'])->getJson('/api/admissions/form')->assertOk()->assertJsonPath('classes.0.name', 'Grade 5');
        $ref = $this->withHeaders(['X-Tenant' => 'acme'])->postJson('/api/admissions/apply', [
            'student_name' => 'Noah Bennett', 'school_class_id' => $classId,
            'guardian_name' => 'Grace Bennett', 'guardian_email' => 'grace.bennett@example.com', 'relation' => 'mother',
        ])->assertCreated()->json('reference');
        $this->assertNotEmpty($ref);
        $this->assertSame(1, UserNotification::where('user_id', $this->admin->id)->where('type', 'admission')->count());

        $app = $this->as($this->admin)->getJson('/api/school/admissions?status=new')->assertOk()->json('data.0');
        $this->as($this->admin)->patchJson("/api/school/admissions/{$app['id']}", ['status' => 'accepted'])->assertOk();
        $res = $this->as($this->admin)->postJson("/api/school/admissions/{$app['id']}/enrol", ['class_section_id' => $a])->assertOk()->json();

        $student = User::find($res['student_id']);
        $this->assertSame('student', $student->role);
        $this->assertSame($a, StudentProfile::where('user_id', $student->id)->value('class_section_id'));
        $this->assertTrue(User::where('email', 'grace.bennett@example.com')->first()->children()->whereKey($student->id)->exists());
        $this->as($this->admin)->postJson("/api/school/admissions/{$app['id']}/enrol", ['class_section_id' => $a])->assertStatus(422);

        // Teachers can't see the admissions office.
        $this->as($this->teacher)->getJson('/api/school/admissions')->assertForbidden();
    }

    public function test_school_data_is_isolated_between_institutes(): void
    {
        [$a] = $this->structure();
        [$student] = $this->admit($a);
        $outsider = $this->person('admin', 'other');

        $this->as($outsider, 'other')->getJson('/api/school/structure')->assertOk()->assertJsonCount(0, 'classes');
        $this->as($outsider, 'other')->getJson("/api/school/students/{$student->id}")->assertNotFound();
        $this->as($outsider, 'other')->getJson("/api/school/attendance?section_id={$a}")->assertNotFound();
        $this->as($outsider, 'other')->patchJson("/api/school/sections/{$a}", ['name' => 'Z'])->assertNotFound();
        $this->as($outsider, 'other')->getJson('/api/school/students')->assertOk()->assertJsonCount(0, 'data');

        // Promote within the institute.
        [, $b] = [$a, $this->as($this->admin)->getJson('/api/school/structure')->json('classes.0.sections.1.id')];
        $this->as($this->admin)->postJson('/api/school/students/promote', ['student_ids' => [$student->id], 'to_section_id' => $b])->assertOk()->assertJson(['moved' => 1]);
        $this->assertSame($b, StudentProfile::where('user_id', $student->id)->value('class_section_id'));
    }
}
