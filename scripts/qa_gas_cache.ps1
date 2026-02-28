$POST = "https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec"
$GET  = "https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec"

function P($b) {
  Invoke-RestMethod -Uri $POST -Method Post -ContentType "text/plain; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($b))
}

$pass = 0; $fail = 0

# ── Test 1: 配表讀取 + 快取 ──
Write-Host "`n=== Test 1: Config table reads ==="
foreach ($s in @("heroes","skill_templates","hero_skills","element_matrix")) {
  $r = P "{`"action`":`"readSheet`",`"sheet`":`"$s`"}"
  if ($r.count -gt 0) { $pass++; Write-Host "  PASS $s count=$($r.count) cached=$($r._cached)" }
  else { $fail++; Write-Host "  FAIL $s - empty!" }
}

# ── Test 2: 快取命中 ──
Write-Host "`n=== Test 2: Cache hit verification ==="
$r = P '{"action":"readSheet","sheet":"heroes"}'
if ($r._cached -eq $true) { $pass++; Write-Host "  PASS heroes cached=True" }
else { $fail++; Write-Host "  FAIL heroes not cached (got: $($r._cached))" }

# ── Test 3: item definitions ──
Write-Host "`n=== Test 3: Item definitions ==="
$r = P '{"action":"load-item-definitions"}'
if ($r.success -and $r.items.Count -gt 0) { $pass++; Write-Host "  PASS items=$($r.items.Count) cached=$($r._cached)" }
else { $fail++; Write-Host "  FAIL items empty or error" }

# ── Test 4: login-guest ──
Write-Host "`n=== Test 4: Login ==="
$token = "aedc3705-6706-4db5-8d53-41488c5f1598"
$r = P "{`"action`":`"login-guest`",`"guestToken`":`"$token`"}"
if ($r.success) { $pass++; Write-Host "  PASS login name=$($r.displayName)" }
else { $fail++; Write-Host "  FAIL login: $($r.error)" }

# ── Test 5: load-save ──
Write-Host "`n=== Test 5: Load save ==="
$r = P "{`"action`":`"load-save`",`"guestToken`":`"$token`"}"
if ($r.success) { $pass++; Write-Host "  PASS heroes=$($r.heroes.Count) pool=$($r.gachaPool.Count)" }
else { $fail++; Write-Host "  FAIL load-save: $($r.error)" }

# ── Test 6: GET heroes (legacy) ──
Write-Host "`n=== Test 6: GET heroes (legacy) ==="
$r = Invoke-RestMethod -Uri $GET
$cnt = if ($r.value) { $r.value.Count } elseif ($r.Count) { $r.Count } else { 0 }
if ($cnt -gt 0) { $pass++; Write-Host "  PASS GET heroes count=$cnt" }
else { $fail++; Write-Host "  FAIL GET heroes empty" }

# ── Test 7: invalidate-cache then re-read ──
Write-Host "`n=== Test 7: Cache invalidation ==="
$r = P '{"action":"invalidate-cache"}'
if ($r.success) { Write-Host "  invalidate-cache: OK" } else { Write-Host "  invalidate-cache: FAIL" }
$r = P '{"action":"readSheet","sheet":"heroes"}'
if (-not $r._cached) { $pass++; Write-Host "  PASS heroes NOT cached after invalidation" }
else { $fail++; Write-Host "  FAIL heroes still cached after invalidation!" }
# Re-read should re-populate cache
$r = P '{"action":"readSheet","sheet":"heroes"}'
if ($r._cached -eq $true) { $pass++; Write-Host "  PASS heroes re-cached after re-read" }
else { $fail++; Write-Host "  FAIL heroes not re-cached" }

# ── Test 8: gacha-pool-status ──
Write-Host "`n=== Test 8: Gacha pool status ==="
$r = P "{`"action`":`"gacha-pool-status`",`"guestToken`":`"$token`"}"
if ($r.success) { $pass++; Write-Host "  PASS remaining=$($r.remaining)" }
else { $fail++; Write-Host "  FAIL gacha-pool-status: $($r.error)" }

# ── Test 9: load-mail ──
Write-Host "`n=== Test 9: Load mail ==="
$r = P "{`"action`":`"load-mail`",`"guestToken`":`"$token`"}"
if ($r.success) { $pass++; Write-Host "  PASS mails=$($r.mails.Count) unread=$($r.unreadCount)" }
else { $fail++; Write-Host "  FAIL load-mail: $($r.error)" }

# ── Test 10: load-inventory ──
Write-Host "`n=== Test 10: Load inventory ==="
$r = P "{`"action`":`"load-inventory`",`"guestToken`":`"$token`"}"
if ($r.success) { $pass++; Write-Host "  PASS items=$($r.items.Count) equip=$($r.equipment.Count) cap=$($r.equipmentCapacity)" }
else { $fail++; Write-Host "  FAIL load-inventory: $($r.error)" }

# ── Summary ──
Write-Host "`n=============================="
Write-Host "QA Results: $pass PASS / $fail FAIL / $($pass+$fail) total"
if ($fail -eq 0) { Write-Host "ALL TESTS PASSED" } else { Write-Host "SOME TESTS FAILED!" }
Write-Host "=============================="
