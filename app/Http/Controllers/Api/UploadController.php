<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Stores course images and lesson PDFs on the public disk, in a folder per
 * institute. Videos are not uploaded here: they are linked from YouTube,
 * Vimeo or Bunny Stream, which stream far better than shared hosting.
 */
class UploadController extends Controller
{
    public function store(Request $request, TenantManager $tenants): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', 'in:image,pdf'],
            'file' => ['required', 'file'],
        ]);

        $rules = $data['kind'] === 'image'
            ? ['file' => ['mimes:jpg,jpeg,png,webp', 'max:4096']]
            : ['file' => ['mimes:pdf', 'max:20480']];
        $request->validate($rules, [
            'file.max' => $data['kind'] === 'image' ? 'Images can be up to 4 MB.' : 'PDFs can be up to 20 MB.',
            'file.mimes' => $data['kind'] === 'image' ? 'Use a JPG, PNG or WebP image.' : 'Only PDF files can be attached.',
        ]);

        $file = $request->file('file');
        $folder = 'tenants/'.$tenants->id().'/'.($data['kind'] === 'image' ? 'images' : 'files').'/'.now()->format('Y/m');
        $name = Str::slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'file';
        $path = $file->storeAs($folder, $name.'-'.Str::random(8).'.'.$file->extension(), 'public');

        return response()->json([
            'url' => Storage::disk('public')->url($path),
            'name' => $file->getClientOriginalName(),
            'size' => $file->getSize(),
        ], 201);
    }
}
