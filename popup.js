document.getElementById('saveBtn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = "処理中...";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
            // コンテンツスクリプトにメッセージを送るトリガー
            // 実際にはcontent.jsがロードされている前提だが、
            // ここでは簡易テストとしてアラートだけ出すか、連携を確認する
            alert("PDF化を開始します（画面が少し固まるかもしれません）");
        }
    });

    // content.jsへメッセージ送信
    chrome.tabs.sendMessage(tab.id, { action: "generatePDF" }, (response) => {
        if (chrome.runtime.lastError) {
            statusDiv.textContent = "エラー: ページをリロードしてください";
        } else {
            statusDiv.textContent = "完了しました！";
        }
    });
});
