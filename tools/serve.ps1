# 골목카페 대시보드를 로컬에서 열어 보기 위한 아주 작은 웹 서버.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1
# 프로젝트 폴더(이 파일의 상위 폴더)를 http://localhost:5173/ 으로 보여 준다.
param([string]$Root = (Split-Path $PSScriptRoot -Parent), [int]$Port = 5173)

$mime = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"; ".json" = "application/json; charset=utf-8"
  ".md" = "text/plain; charset=utf-8"; ".png" = "image/png"; ".jpg" = "image/jpeg"
  ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
}
$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'

$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $rootFull on http://localhost:$Port/"

while ($l.IsListening) {
  $c = $l.GetContext()
  $rel = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart("/")
  if ($rel -eq "") { $rel = "index.html" }
  $full = [IO.Path]::GetFullPath((Join-Path $rootFull $rel))
  # 프로젝트 폴더 밖의 파일은 내주지 않는다.
  if ($full.StartsWith($rootFull) -and (Test-Path $full -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($full)
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $c.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" })
    $c.Response.StatusCode = 200
    if ($c.Request.HttpMethod -ne "HEAD") { $c.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
  } else {
    $c.Response.StatusCode = 404
  }
  $c.Response.Close()
}
