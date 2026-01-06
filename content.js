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
        overlay.innerText = "PDF完了！";

        // PDF生成
        const imgData = canvas.toDataURL('image/png');

        // A4縦設定
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const imgProps = pdf.getImageProperties(imgData);

        // 画像の幅
        let finalWidth = pageWidth;
        let finalHeight = (imgProps.height * finalWidth) / imgProps.width;

        // もし1ページに収まらない場合は縮小
        if (finalHeight > pageHeight) {
            finalHeight = pageHeight;
            finalWidth = (imgProps.width * finalHeight) / imgProps.height;
        }

        const x = (pageWidth - finalWidth) / 2;
        // タイトル描画なし、シンプルに画像のみ
        pdf.addImage(imgData, 'PNG', x, 0, finalWidth, finalHeight);

        // ファイル名用タイトル取得
        let titleText = document.title.replace(/Notion/g, '').trim() || "保育記録";
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        pdf.save(`${titleText}_${dateStr}.pdf`);

        overlay.innerText = "完了しました";
        setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 2000);
        return "SUCCESS";

    } catch (error) {
        console.error('PDF生成エラー:', error);
        if (overlay) overlay.innerText = "エラー復帰中...";
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
