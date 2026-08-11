$filePath = "c:\Users\7902\Downloads\06-main (1150811)\06-main\app.js"
$content = Get-Content $filePath -Raw

$find1 = "if(exists && !concurrentBorrowMode){`r`n`r`nalert(``印鑑 `${seal} 目前借出中，無法重複借用``);`r`n`r`nreturn;`r`n`r`n}"
$replace1 = "if(exists && !concurrentBorrowMode){`r`n    const activeSameSeal = records.filter(r => r.seal === seal && !r.returnTime);`r`n    if (!activeSameSeal.every(r => r.borrower === borrower)) {`r`n        alert(``印鑑 `${seal} 目前借出中，無法重複借用``);`r`n        return;`r`n    }`r`n}"

$find2 = "if(exists && !data.allowConcurrent){`r`nalert(``印鑑 `${data.seal} 目前借出中，無法重複借用``);`r`ncloseBorrowConfirmModal();`r`nawait loadRecords();`r`nreturn;`r`n}"
$replace2 = "if(exists && !data.allowConcurrent){`r`n    const activeSameSeal = records.filter(r => r.seal === data.seal && !r.returnTime);`r`n    if (!activeSameSeal.every(r => r.borrower === data.borrower)) {`r`n        alert(``印鑑 `${data.seal} 目前借出中，無法重複借用``);`r`n        closeBorrowConfirmModal();`r`n        await loadRecords();`r`n        return;`r`n    }`r`n}"

$content = $content.Replace($find1, $replace1)
$content = $content.Replace($find2, $replace2)

$find1_unix = $find1.Replace("`r`n", "`n")
$replace1_unix = $replace1.Replace("`r`n", "`n")
$find2_unix = $find2.Replace("`r`n", "`n")
$replace2_unix = $replace2.Replace("`r`n", "`n")

$content = $content.Replace($find1_unix, $replace1_unix)
$content = $content.Replace($find2_unix, $replace2_unix)

[IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
Write-Output "Replacement done"
