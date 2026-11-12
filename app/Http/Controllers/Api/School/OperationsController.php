<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\LibraryBook;
use App\Models\LibraryLoan;
use App\Models\StudentProfile;
use App\Models\TransportAssignment;
use App\Models\TransportRoute;
use App\Models\User;
use App\Models\Visitor;
use App\Services\School;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Library, transport, inventory and the visitor log.
 */
class OperationsController extends Controller
{
    public function __construct(protected School $school) {}

    // ── Library ──────────────────────────────────────────────────────

    public function books(Request $request): JsonResponse
    {
        $out = LibraryLoan::whereNull('returned_on')->selectRaw('library_book_id, COUNT(*) as n')->groupBy('library_book_id')->pluck('n', 'library_book_id');
        $books = LibraryBook::query()
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn ($q) => $q->where('title', 'like', $term)->orWhere('author', 'like', $term)->orWhere('isbn', 'like', $term));
            })
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')))
            ->orderBy('title')->limit(500)->get();

        return response()->json([
            'data' => $books->map(fn ($b) => $this->bookRow($b, (int) ($out[$b->id] ?? 0))),
            'categories' => LibraryBook::whereNotNull('category')->distinct()->orderBy('category')->pluck('category'),
            'stats' => ['titles' => LibraryBook::count(), 'copies' => (int) LibraryBook::sum('copies'), 'on_loan' => (int) $out->sum(),
                'overdue' => LibraryLoan::whereNull('returned_on')->whereDate('due_on', '<', now()->toDateString())->count()],
            'can_manage' => $this->school->isOffice($request->user()),
        ]);
    }

    public function storeBook(Request $request): JsonResponse
    {
        return response()->json($this->bookRow(LibraryBook::create($request->validate($this->bookRules())), 0), 201);
    }

    public function updateBook(Request $request, LibraryBook $book): JsonResponse
    {
        $data = $request->validate($this->bookRules(true));
        if (isset($data['copies'])) {
            $out = LibraryLoan::where('library_book_id', $book->id)->whereNull('returned_on')->count();
            abort_if($data['copies'] < $out, 422, "{$out} copies are on loan right now.");
        }
        $book->update($data);

        return response()->json(['ok' => true]);
    }

    public function destroyBook(LibraryBook $book): JsonResponse
    {
        abort_if(LibraryLoan::where('library_book_id', $book->id)->whereNull('returned_on')->exists(), 422, 'This book is on loan.');
        $book->delete();

        return response()->json(['ok' => true]);
    }

    public function loans(Request $request): JsonResponse
    {
        $q = LibraryLoan::with(['book', 'user'])
            ->when($request->input('status', 'out') === 'out', fn ($q) => $q->whereNull('returned_on'))
            ->when($request->input('status') === 'overdue', fn ($q) => $q->whereNull('returned_on')->whereDate('due_on', '<', now()->toDateString()))
            ->when($request->input('status') === 'returned', fn ($q) => $q->whereNotNull('returned_on'))
            ->orderBy('due_on')->limit(500)->get();

        return response()->json(['data' => $q->map(fn ($l) => $this->loanRow($l))]);
    }

    public function issue(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate([
            'library_book_id' => ['required', 'integer', Rule::exists('library_books', 'id')->where('tenant_id', $tenantId)],
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)],
            'due_on' => ['nullable', 'date', 'after_or_equal:today'],
        ]);
        $book = LibraryBook::findOrFail($data['library_book_id']);
        $out = LibraryLoan::where('library_book_id', $book->id)->whereNull('returned_on')->count();
        abort_if($out >= $book->copies, 422, 'No copies of this book are available.');

        $loan = LibraryLoan::create($data + ['issued_on' => now()->toDateString(), 'due_on' => $data['due_on'] ?? now()->addDays(14)->toDateString(), 'issued_by' => $request->user()->id]);
        $this->school->notify($data['user_id'], 'library', "Borrowed: {$book->title}", 'Please return it by '.$loan->due_on->format('M j'), '/library');

        return response()->json($this->loanRow($loan->load(['book', 'user'])), 201);
    }

    public function returnLoan(LibraryLoan $loan): JsonResponse
    {
        abort_if($loan->returned_on, 422, 'Already returned.');
        $late = max(0, $loan->due_on->diffInDays(now()->startOfDay(), false));
        $perDay = (float) data_get($this->school->tenant()->settings, 'library_fine_per_day', 0);
        $loan->forceFill(['returned_on' => now()->toDateString(), 'fine' => round($late * $perDay, 2)])->save();

        return response()->json($this->loanRow($loan->load(['book', 'user'])));
    }

    /** The viewer's own loans (and their children's for parents). */
    public function myLoans(Request $request): JsonResponse
    {
        $ids = array_merge([$request->user()->id], $this->school->familyStudentIds($request->user()));

        return response()->json(['data' => LibraryLoan::with(['book', 'user'])->whereIn('user_id', array_unique($ids))->latest('id')->limit(100)->get()->map(fn ($l) => $this->loanRow($l))]);
    }

    protected function bookRules(bool $partial = false): array
    {
        return [
            'title' => [$partial ? 'sometimes' : 'required', 'string', 'max:200'],
            'author' => ['nullable', 'string', 'max:160'],
            'isbn' => ['nullable', 'string', 'max:20'],
            'category' => ['nullable', 'string', 'max:60'],
            'publisher' => ['nullable', 'string', 'max:120'],
            'shelf' => ['nullable', 'string', 'max:40'],
            'copies' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'ebook_url' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://'],
        ];
    }

    protected function bookRow(LibraryBook $b, int $out): array
    {
        return ['id' => $b->id, 'title' => $b->title, 'author' => $b->author, 'isbn' => $b->isbn, 'category' => $b->category, 'publisher' => $b->publisher,
            'shelf' => $b->shelf, 'copies' => $b->copies, 'available' => max(0, $b->copies - $out), 'ebook_url' => $b->ebook_url];
    }

    protected function loanRow(LibraryLoan $l): array
    {
        return ['id' => $l->id, 'book' => $l->book?->only('id', 'title', 'author'), 'user' => $l->user?->only('id', 'name', 'role'),
            'issued_on' => $l->issued_on->toDateString(), 'due_on' => $l->due_on->toDateString(), 'returned_on' => $l->returned_on?->toDateString(),
            'overdue' => ! $l->returned_on && $l->due_on->lt(now()->startOfDay()), 'fine' => $l->fine];
    }

    // ── Transport ────────────────────────────────────────────────────

    public function routes(): JsonResponse
    {
        $assign = TransportAssignment::with('student')->get()->groupBy('transport_route_id');

        return response()->json(['data' => TransportRoute::orderBy('name')->get()->map(fn ($r) => $this->routeRow($r) + [
            'students' => ($assign[$r->id] ?? collect())->map(fn ($a) => ['id' => $a->student_id, 'name' => $a->student?->name, 'stop' => $a->stop])->sortBy('name')->values(),
        ])]);
    }

    public function storeRoute(Request $request): JsonResponse
    {
        return response()->json($this->routeRow(TransportRoute::create($request->validate($this->routeRules()))), 201);
    }

    public function updateRoute(Request $request, TransportRoute $transportRoute): JsonResponse
    {
        $transportRoute->update($request->validate($this->routeRules(true)));

        return response()->json($this->routeRow($transportRoute));
    }

    public function destroyRoute(TransportRoute $transportRoute): JsonResponse
    {
        $transportRoute->delete();

        return response()->json(['ok' => true]);
    }

    public function assign(Request $request, TransportRoute $transportRoute): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'integer', Rule::exists('student_profiles', 'user_id')->where('tenant_id', $request->user()->tenant_id)],
            'stop' => ['nullable', 'string', 'max:120'],
        ]);
        abort_if($transportRoute->capacity && TransportAssignment::where('transport_route_id', $transportRoute->id)->where('student_id', '!=', $data['student_id'])->count() >= $transportRoute->capacity, 422, 'This route is full.');
        TransportAssignment::updateOrCreate(['student_id' => $data['student_id']], ['transport_route_id' => $transportRoute->id, 'stop' => $data['stop'] ?? null]);
        $this->school->notify($this->school->guardianIds([$data['student_id']]), 'transport', "Bus route: {$transportRoute->name}", $data['stop'] ? "Stop: {$data['stop']}" : null, '/family');

        return response()->json(['ok' => true]);
    }

    public function unassign(TransportRoute $transportRoute, User $student): JsonResponse
    {
        TransportAssignment::where('transport_route_id', $transportRoute->id)->where('student_id', $student->id)->delete();

        return response()->json(['ok' => true]);
    }

    /** Families: which bus each child takes. */
    public function myTransport(Request $request): JsonResponse
    {
        $ids = $this->school->familyStudentIds($request->user());

        return response()->json(['data' => TransportAssignment::with(['route', 'student'])->whereIn('student_id', $ids ?: [0])->get()->map(fn ($a) => [
            'student' => $a->student?->only('id', 'name'), 'stop' => $a->stop,
            'route' => $a->route ? $this->routeRow($a->route) : null,
        ])]);
    }

    protected function routeRules(bool $partial = false): array
    {
        return [
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:80'],
            'vehicle' => ['nullable', 'string', 'max:60'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:200'],
            'driver_name' => ['nullable', 'string', 'max:120'],
            'driver_phone' => ['nullable', 'string', 'max:40'],
            'attendant_name' => ['nullable', 'string', 'max:120'],
            'stops' => ['nullable', 'array', 'max:40'],
            'stops.*.name' => ['required', 'string', 'max:120'],
            'stops.*.pickup' => ['nullable', 'date_format:H:i'],
            'stops.*.drop' => ['nullable', 'date_format:H:i'],
            'monthly_fee' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    protected function routeRow(TransportRoute $r): array
    {
        return ['id' => $r->id, 'name' => $r->name, 'vehicle' => $r->vehicle, 'capacity' => $r->capacity, 'driver_name' => $r->driver_name,
            'driver_phone' => $r->driver_phone, 'attendant_name' => $r->attendant_name, 'stops' => $r->stops ?? [], 'monthly_fee' => $r->monthly_fee];
    }

    // ── Inventory ────────────────────────────────────────────────────

    public function items(Request $request): JsonResponse
    {
        $items = InventoryItem::query()
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%'.$request->string('search').'%'))
            ->when($request->boolean('low'), fn ($q) => $q->whereColumn('quantity', '<=', 'min_quantity'))
            ->orderBy('name')->get();

        return response()->json([
            'data' => $items->map(fn ($i) => $this->itemRow($i)),
            'low' => InventoryItem::whereColumn('quantity', '<=', 'min_quantity')->where('min_quantity', '>', 0)->count(),
            'value' => round((float) InventoryItem::sum(DB::raw('quantity * COALESCE(unit_cost, 0)')), 2),
            'categories' => InventoryItem::whereNotNull('category')->distinct()->orderBy('category')->pluck('category'),
        ]);
    }

    public function storeItem(Request $request): JsonResponse
    {
        $data = $request->validate($this->itemRules());
        $item = DB::transaction(function () use ($data, $request) {
            $item = InventoryItem::create($data);
            if ($item->quantity > 0) {
                InventoryMovement::create(['inventory_item_id' => $item->id, 'kind' => 'in', 'quantity' => $item->quantity, 'note' => 'Opening stock', 'user_id' => $request->user()->id]);
            }

            return $item;
        });

        return response()->json($this->itemRow($item), 201);
    }

    public function updateItem(Request $request, InventoryItem $item): JsonResponse
    {
        $data = $request->validate($this->itemRules(true));
        unset($data['quantity']); // stock changes go through movements
        $item->update($data);

        return response()->json($this->itemRow($item));
    }

    public function destroyItem(InventoryItem $item): JsonResponse
    {
        $item->delete();

        return response()->json(['ok' => true]);
    }

    /** Stock in, out (issue) or a count adjustment. */
    public function move(Request $request, InventoryItem $item): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(['in', 'out', 'adjust'])],
            'quantity' => ['required', 'integer', 'min:0', 'max:1000000'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        abort_if($data['kind'] === 'out' && $data['quantity'] > $item->quantity, 422, "Only {$item->quantity} {$item->unit} in stock.");
        DB::transaction(function () use ($item, $data, $request) {
            $delta = match ($data['kind']) { 'in' => $data['quantity'], 'out' => -$data['quantity'], 'adjust' => $data['quantity'] - $item->quantity };
            $item->forceFill(['quantity' => $item->quantity + $delta])->save();
            InventoryMovement::create(['inventory_item_id' => $item->id, 'kind' => $data['kind'], 'quantity' => $delta, 'note' => $data['note'] ?? null, 'user_id' => $request->user()->id]);
        });

        return response()->json($this->itemRow($item->fresh()));
    }

    public function movements(InventoryItem $item): JsonResponse
    {
        return response()->json(['data' => InventoryMovement::with('user')->where('inventory_item_id', $item->id)->latest('id')->limit(100)->get()->map(fn ($m) => [
            'id' => $m->id, 'kind' => $m->kind, 'quantity' => $m->quantity, 'note' => $m->note, 'user' => $m->user?->name, 'at' => $m->created_at?->toIso8601String(),
        ])]);
    }

    protected function itemRules(bool $partial = false): array
    {
        return [
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:60'],
            'unit' => ['sometimes', 'string', 'max:20'],
            'quantity' => ['sometimes', 'integer', 'min:0'],
            'min_quantity' => ['sometimes', 'integer', 'min:0'],
            'location' => ['nullable', 'string', 'max:80'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    protected function itemRow(InventoryItem $i): array
    {
        return ['id' => $i->id, 'name' => $i->name, 'category' => $i->category, 'unit' => $i->unit, 'quantity' => $i->quantity, 'min_quantity' => $i->min_quantity,
            'location' => $i->location, 'unit_cost' => $i->unit_cost, 'low' => $i->min_quantity > 0 && $i->quantity <= $i->min_quantity];
    }

    // ── Visitors ─────────────────────────────────────────────────────

    public function visitors(Request $request): JsonResponse
    {
        $day = $request->date('date') ?? now();
        $rows = Visitor::whereDate('checked_in_at', $day->toDateString())->orderByDesc('checked_in_at')->get();

        return response()->json(['date' => $day->toDateString(), 'inside' => Visitor::whereNull('checked_out_at')->count(), 'data' => $rows->map(fn ($v) => $this->visitorRow($v))]);
    }

    public function checkIn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'purpose' => ['required', 'string', 'max:200'],
            'host' => ['nullable', 'string', 'max:120'],
            'id_note' => ['nullable', 'string', 'max:120'],
            'badge' => ['nullable', 'string', 'max:20'],
        ]);
        $v = Visitor::create($data + ['checked_in_at' => now(), 'logged_by' => $request->user()->id]);

        return response()->json($this->visitorRow($v), 201);
    }

    public function checkOut(Visitor $visitor): JsonResponse
    {
        abort_if($visitor->checked_out_at, 422, 'Already checked out.');
        $visitor->forceFill(['checked_out_at' => now()])->save();

        return response()->json($this->visitorRow($visitor));
    }

    public function exportVisitors(Request $request): StreamedResponse
    {
        $from = $request->date('from') ?? now()->startOfMonth();
        $rows = Visitor::where('checked_in_at', '>=', $from)->orderBy('checked_in_at')->get();

        return Csv::download('visitors.csv', ['In', 'Out', 'Name', 'Phone', 'Purpose', 'Host', 'ID', 'Badge'],
            $rows->map(fn ($v) => [$v->checked_in_at, $v->checked_out_at, $v->name, $v->phone, $v->purpose, $v->host, $v->id_note, $v->badge]));
    }

    protected function visitorRow(Visitor $v): array
    {
        return ['id' => $v->id, 'name' => $v->name, 'phone' => $v->phone, 'purpose' => $v->purpose, 'host' => $v->host, 'id_note' => $v->id_note, 'badge' => $v->badge,
            'checked_in_at' => $v->checked_in_at->toIso8601String(), 'checked_out_at' => $v->checked_out_at?->toIso8601String()];
    }

    /** Pick a person for loans (students, staff). */
    public function people(Request $request): JsonResponse
    {
        $term = '%'.$request->string('search').'%';

        return response()->json(['data' => User::whereIn('role', [User::ROLE_STUDENT, User::ROLE_INSTRUCTOR, User::ROLE_ADMIN, User::ROLE_MANAGER])
            ->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term))->orderBy('name')->limit(10)->get(['id', 'name', 'role'])
            ->map(fn ($u) => $u->only('id', 'name', 'role') + ['section' => $u->role === User::ROLE_STUDENT ? StudentProfile::with('section.schoolClass')->where('user_id', $u->id)->first()?->section?->label() : null])]);
    }
}
