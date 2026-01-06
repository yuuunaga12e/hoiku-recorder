const { google } = require('googleapis');
const { json, send } = require('micro');
const cors = require('micro-cors')();

// Google認証の準備
// Vercelの環境変数から秘密鍵などの情報を読み込む
const getAuthClient = () => {
    const SCOPES = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets'
    ];

    // 秘密鍵は改行コードがエスケープされている場合があるので置換
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

    return new google.auth.JWT(
        process.env.GOOGLE_CLIENT_EMAIL,
        null,
        privateKey,
        SCOPES
    );
};

// メイン処理
const handler = async (req, res) => {
    // CORS対応（OPTIONSメソッドへの応答）
    if (req.method === 'OPTIONS') {
        return send(res, 200);
    }

    // POST以外は受け付けない
    if (req.method !== 'POST') {
        return send(res, 405, { error: 'Method Not Allowed' });
    }

    try {
        const data = await json(req);
        const { filename, fileData, date, title } = data;

        if (!fileData) {
            throw new Error('No file data received');
        }

        const auth = getAuthClient();
        const drive = google.drive({ version: 'v3', auth });
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Googleドライブへ保存
        // base64デコード
        const buffer = Buffer.from(fileData.split(',')[1], 'base64');

        // ストリームとしてアップロードするための準備
        const { Readable } = require('stream');
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const fileMetadata = {
            name: filename,
            parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : [] // フォルダ指定があれば使う
        };

        const media = {
            mimeType: 'application/pdf',
            body: stream
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink'
        });

        const fileUrl = file.data.webViewLink;

        // 2. スプレッドシートへ記録
        if (process.env.GOOGLE_SHEET_ID) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: process.env.GOOGLE_SHEET_ID,
                range: 'シート1!A:C', // A列からC列に追記
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        [date || new Date().toISOString(), title || filename, fileUrl]
                    ]
                }
            });
        }

        return send(res, 200, { status: 'success', fileUrl });

    } catch (error) {
        console.error('API Error:', error);
        return send(res, 500, { status: 'error', message: error.message });
    }
};

module.exports = cors(handler);
