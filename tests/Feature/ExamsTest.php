<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExamsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $math;

    private User $english;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $t = Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = User::factory()->role('admin')->create(['tenant_id' => $t->id]);
        $this->math = User::factory()->role('instructor')->create(['tenant_id' => $t->id]);
        $this->english = User::factory()->role('instructor')->create(['tenant_id' => $t->id]);
    }

    private function as(User $user): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    /** Grade 5 A: Maths (math teacher) and English (english teacher), three students, an exam with two papers. */
    private function setUpExam(): array
    {
        $this->as($this->admin)->postJson('/api/school/classes', ['name' => 'Grade 5', 'sections' => ['A']])->assertCreated();
        $section = $this->as($this->admin)->getJson('/api/school/structure')->json('classes.0.sections.0.id');
        $m = $this->as($this->admin)->postJson('/api/school/subjects', ['name' => 'Mathematics'])->json('id');
        $e = $this->as($this->admin)->postJson('/api/school/subjects', ['name' => 'English'])->json('id');
        $this->as($this->admin)->putJson("/api/school/sections/{$section}/subjects", ['subjects' => [
            ['subject_id' => $m, 'teacher_id' => $this->math->id], ['subject_id' => $e, 'teacher_id' => $this->english->id],
        ]])->assertOk();

        $students = [];
        foreach (['Ava Stone', 'Ben Cole', 'Cara Diaz'] as $i => $name) {
            $students[] = User::find($this->as($this->admin)->postJson('/api/school/students', ['name' => $name, 'class_section_id' => $section, 'roll_no' => (string) ($i + 1),
                'guardians' => [['name' => "Parent {$i}", 'email' => "parent{$i}@example.com"]]])->assertCreated()->json('id'));
        }

        $exam = $this->as($this->admin)->postJson('/api/school/exams', ['name' => 'Midterm 2026', 'kind' => 'midterm', 'starts_on' => now()->toDateString(), 'ends_on' => now()->addDays(5)->toDateString(), 'show_rank' => true])
            ->assertCreated()->json('id');
        $this->as($this->admin)->postJson("/api/school/exams/{$exam}/papers", ['section_ids' => [$section], 'max_marks' => 50, 'pass_marks' => 20])
            ->assertCreated()->assertJson(['added' => 2]);
        $papers = collect($this->as($this->admin)->getJson("/api/school/exams/{$exam}")->assertOk()->json('papers'))->keyBy('subject.name');

        return [$exam, $section, $papers['Mathematics']['id'], $papers['English']['id'], $students];
    }

    public function test_teachers_enter_marks_only_for_their_own_subject(): void
    {
        [$exam, , $mathPaper, $engPaper, $s] = $this->setUpExam();

        $this->as($this->math)->putJson("/api/school/exam-papers/{$mathPaper}/marks", ['marks' => [
            ['student_id' => $s[0]->id, 'marks' => 45], ['student_id' => $s[1]->id, 'marks' => 30], ['student_id' => $s[2]->id, 'is_absent' => true],
        ]])->assertOk()->assertJson(['saved' => 3]);
        $this->as($this->math)->putJson("/api/school/exam-papers/{$mathPaper}/marks", ['marks' => [['student_id' => $s[0]->id, 'marks' => 51]]])->assertStatus(422);
        $this->as($this->math)->putJson("/api/school/exam-papers/{$engPaper}/marks", ['marks' => [['student_id' => $s[0]->id, 'marks' => 40]]])->assertForbidden();

        $roster = $this->as($this->math)->getJson("/api/school/exam-papers/{$mathPaper}/marks")->assertOk()->json('students');
        $this->assertEquals(45, $roster[0]['marks']);
        $this->assertTrue($roster[2]['is_absent']);

        // The teacher's exam list shows progress only for their sections.
        $this->assertSame(1, $this->as($this->math)->getJson('/api/school/exams')->json('data.0.progress.complete'));
    }

    public function test_results_sheet_grades_positions_and_pass_fail(): void
    {
        [$exam, $section, $mathPaper, $engPaper, $s] = $this->setUpExam();
        $this->as($this->math)->putJson("/api/school/exam-papers/{$mathPaper}/marks", ['marks' => [
            ['student_id' => $s[0]->id, 'marks' => 45], ['student_id' => $s[1]->id, 'marks' => 30], ['student_id' => $s[2]->id, 'marks' => 30],
        ]]);
        $this->as($this->english)->putJson("/api/school/exam-papers/{$engPaper}/marks", ['marks' => [
            ['student_id' => $s[0]->id, 'marks' => 47], ['student_id' => $s[1]->id, 'marks' => 15], ['student_id' => $s[2]->id, 'marks' => 15],
        ]]);

        $sheet = $this->as($this->admin)->getJson("/api/school/exams/{$exam}/results?section_id={$section}")->assertOk()->json();
        $this->assertSame('Ava Stone', $sheet['students'][0]['name']);
        $this->assertEquals(92, $sheet['students'][0]['percent']);
        $this->assertSame('A+', $sheet['students'][0]['grade']['grade']);
        $this->assertTrue($sheet['students'][0]['passed']);
        $this->assertFalse($sheet['students'][1]['passed']); // 15 < pass mark 20
        // Ben and Cara tie for second place.
        $this->assertSame([1, 2, 2], array_column($sheet['students'], 'position'));
        $this->assertEquals(47, $sheet['papers'][0]['highest']); // English first alphabetically

        $this->as($this->admin)->get("/api/school/exams/{$exam}/results.csv?section_id={$section}")->assertOk();
    }

    public function test_families_see_date_sheet_then_results_after_publishing(): void
    {
        [$exam, , $mathPaper, , $s] = $this->setUpExam();
        $parent = User::where('email', 'parent0@example.com')->first();
        $this->as($this->math)->putJson("/api/school/exam-papers/{$mathPaper}/marks", ['marks' => [['student_id' => $s[0]->id, 'marks' => 40]]]);
        $this->as($this->admin)->patchJson("/api/school/exam-papers/{$mathPaper}", ['date' => now()->addDay()->toDateString(), 'starts_at' => '09:00', 'duration_minutes' => 90])->assertOk();

        // Draft: nothing for families.
        $this->assertCount(0, $this->as($parent)->getJson('/api/school/exams/mine')->json('data'));

        $this->as($this->admin)->patchJson("/api/school/exams/{$exam}", ['status' => 'scheduled'])->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $parent->id)->where('type', 'exam_scheduled')->count());
        $mine = $this->as($parent)->getJson('/api/school/exams/mine')->assertOk()->json('data.0');
        $this->assertNull($mine['children'][0]['summary']);
        $this->assertSame('09:00', collect($mine['children'][0]['date_sheet'])->firstWhere('subject', 'Mathematics')['starts_at']);
        $this->as($parent)->getJson("/api/school/exams/{$exam}/report/{$s[0]->id}")->assertNotFound();

        $this->as($this->admin)->patchJson("/api/school/exams/{$exam}", ['status' => 'published'])->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $parent->id)->where('type', 'exam_results')->count());
        $report = $this->as($parent)->getJson("/api/school/exams/{$exam}/report/{$s[0]->id}")->assertOk()->json();
        $this->assertSame('Ava Stone', $report['student']['name']);
        $this->assertSame(1, $report['position']);
        $this->assertEquals(40, collect($report['subjects'])->firstWhere('subject', 'Mathematics')['marks']);

        // Another child's report is off limits; teachers can't change marks after publishing.
        $this->as($parent)->getJson("/api/school/exams/{$exam}/report/{$s[1]->id}")->assertForbidden();
        $this->as($this->math)->putJson("/api/school/exam-papers/{$mathPaper}/marks", ['marks' => [['student_id' => $s[0]->id, 'marks' => 41]]])->assertStatus(422);
        $this->as($this->admin)->deleteJson("/api/school/exams/{$exam}")->assertStatus(422);
    }

    public function test_grade_scale_can_be_customised(): void
    {
        $this->as($this->admin)->getJson('/api/school/grade-scale')->assertOk()->assertJsonCount(6, 'bands');
        $this->as($this->admin)->putJson('/api/school/grade-scale', ['bands' => [['min_percent' => 50, 'grade' => 'Pass'], ['min_percent' => 10, 'grade' => 'Fail']]])->assertStatus(422);
        $this->as($this->admin)->putJson('/api/school/grade-scale', ['bands' => [['min_percent' => 50, 'grade' => 'Pass'], ['min_percent' => 0, 'grade' => 'Fail']]])
            ->assertOk()->assertJsonCount(2, 'bands');
        $this->as($this->math)->putJson('/api/school/grade-scale', ['bands' => []])->assertForbidden();
    }
}
