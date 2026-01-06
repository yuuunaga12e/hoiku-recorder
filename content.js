// Notionのページコンテンツを特定してPDF化する関数
async function generatePDF() {
    const { jsPDF } = window.jspdf;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;color:white;display:flex;justify-content:center;align-items:center;font-size:24px;font-weight:bold;pointer-events:none;';
    overlay.innerHTML = '<div>PDF作成中...<br><span style="font-size:16px">画面を自動スクロールしています</span></div>';
    document.body.appendChild(overlay);

    try {
        // 1. スクロール可能な要素を探す
        const allDivs = document.querySelectorAll('div, main');
        const scrollables = [];

        for (const div of allDivs) {
            const style = window.getComputedStyle(div);
            const isScrollable = (div.scrollHeight > div.clientHeight) &&
                (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll');

            if (isScrollable && div.clientHeight > 100) {
                scrollables.push(div);
            }
        }

        if (scrollables.length === 0) {
            scrollables.push(document.scrollingElement || document.body);
        }

        // 2. 自動スクロール
        for (const el of scrollables) {
            let lastScrollTop = -1;
            while (el.scrollTop < el.scrollHeight - el.clientHeight && el.scrollTop !== lastScrollTop) {
                lastScrollTop = el.scrollTop;
                el.scrollBy(0, 1000);
                await new Promise(r => setTimeout(r, 200));
            }
        }

        await new Promise(r => setTimeout(r, 1000));

        // 3. スクロール位置リセット
        for (const el of scrollables) {
            el.scrollTop = 0;
        }
        await new Promise(r => setTimeout(r, 500));

        // 4. コンテンツ特定
        const content = document.querySelector('.notion-page-content') || document.querySelector('.notion-frame') || document.body;

        // スタイル強制
        const originalStyles = [];
        const forceVisible = (el) => {
            originalStyles.push({ el, overflow: el.style.overflow, height: el.style.height });
            el.style.overflow = 'visible';
            el.style.height = 'auto';
        };

        scrollables.forEach(forceVisible);
        forceVisible(content);

        overlay.innerText = "撮影中...";
        overlay.style.display = 'none';

        const canvas = await html2canvas(content, {
            scale: 2,
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: "#ffffff",
            windowWidth: content.scrollWidth,
            windowHeight: content.scrollHeight,
            height: content.scrollHeight,
            width: content.scrollWidth,
            scrollY: 0,
            x: 0,
            y: 0
        });

        // 復元
        scrollables.forEach((el, i) => {
            el.style.overflow = originalStyles[i].overflow;
            el.style.height = originalStyles[i].height;
        });
        overlay.style.display = 'flex';
        overlay.innerText = "PDF完了！保存中...";

        // PDF生成
        const imgData = canvas.toDataURL('image/png');

        // A4縦
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgProps = pdf.getImageProperties(imgData);

        let finalWidth = pageWidth;
        let finalHeight = (imgProps.height * finalWidth) / imgProps.width;

        if (finalHeight > pageHeight) {
            finalHeight = pageHeight;
            finalWidth = (imgProps.width * finalHeight) / imgProps.height;
        }

        const x = (pageWidth - finalWidth) / 2;
        pdf.addImage(imgData, 'PNG', x, 0, finalWidth, finalHeight);

        // ファイル名生成
        let titleText = document.title.replace(/Notion/g, '').trim() || "保育記録";
        const dateArg = new Date();
        const dateStr = dateArg.toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `${titleText}_${dateStr}.pdf`;

        // 1. ローカルバックアップ
        pdf.save(filename);

        // 2. サーバー送信
        const pdfBase64 = pdf.output('datauristring');

        try {
            const response = await fetch('https://hoiku-recorder.vercel.app/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: filename,
                    fileData: pdfBase64,
                    title: titleText,
                    date: dateArg.toISOString()
                })
            });

            if (!response.ok) throw new Error(`${response.status}`);

            overlay.innerText = "完了！ドライブに保存しました";
            overlay.style.backgroundColor = "rgba(0,128,0,0.8)";
        } catch (e) {
            console.error(e);
            overlay.innerText = "PDFはできましたが、\n送信に失敗しました";
            overlay.style.backgroundColor = "rgba(200,0,0,0.8)";
            alert(`サーバー送信エラー: ${e.message}\nローカルのPDFを使ってください。`);
        }

        setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 4000);
        return "SUCCESS";

    } catch (error) {
        console.error('PDF生成エラー:', error);
        if (overlay) overlay.innerText = "えらー";
        alert('エラーが発生しました: ' + error.message);
        setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 2000);
        return "ERROR";
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "generatePDF") {
        generatePDF().then(status => {
            sendResponse({ status: status });
        });
        return true;
    }
});
