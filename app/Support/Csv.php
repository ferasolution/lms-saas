<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

class Csv
{
    /** Excel-friendly CSV (UTF-8 BOM), with formula injection neutralised. */
    public static function download(string $filename, array $header, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $header);
            foreach ($rows as $row) {
                fputcsv($out, array_map([self::class, 'cell'], is_array($row) ? $row : $row->toArray()));
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public static function cell(mixed $v): string
    {
        $v = (string) ($v ?? '');

        return $v !== '' && in_array($v[0], ['=', '+', '-', '@', "\t", "\r"], true) && ! is_numeric($v) ? "'".$v : $v;
    }
}
