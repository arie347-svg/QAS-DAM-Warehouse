/**
 * =========================================================================
 * GOOGLE APPS SCRIPT WEB APP - EMAIL DISPATCHER FOR QAS LOGISTICS
 * =========================================================================
 * 
 * PANDUAN DEPLOYMENT:
 * 1. Buka script.google.com -> Proyek "QAS Mailer Web App".
 * 2. Salin seluruh kode ini ke editor Code.gs untuk menggantikan versi sebelumnya.
 * 3. Buka Project Settings (Ikon Gerigi) -> Script Properties:
 *    - Tambahkan Property: GAS_SECRET_TOKEN
 *    - Value: qas-secret-token-2026
 * 4. Klik "Deploy" -> "Manage deployments" -> Ikon Pensil (Edit) -> Version: "New version" -> Klik "Deploy".
 *    *Catatan: Setiap kali mengubah Code.gs, WAJIB buat "New version" di Manage deployments agar Web App URL memperbarui kode terbaru.
 */

var DEFAULT_SECRET_TOKEN = 'qas-secret-token-2026';

/**
 * Handle HTTP POST Request dari Cloudflare Worker
 */
function doPost(e) {
  try {
    // 1. Validasi keberadaan payload
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        success: false,
        error: 'Payload request kosong. Diperlukan JSON body.'
      }, 400);
    }

    // 2. Parsing JSON body
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({
        success: false,
        error: 'Format JSON tidak valid: ' + parseErr.message
      }, 400);
    }

    // 3. Validasi Keamanan Token
    var expectedToken = PropertiesService.getScriptProperties().getProperty('GAS_SECRET_TOKEN') || DEFAULT_SECRET_TOKEN;
    if (!payload.token || String(payload.token).trim() !== String(expectedToken).trim()) {
      return createJsonResponse({
        success: false,
        error: 'Akses ditolak: Token autentikasi tidak valid atau tidak disertakan.'
      }, 403);
    }

    // 4. Validasi & Normalisasi Penerima (Mendukung string maupun array)
    var rawRecipients = payload.to;
    var recipientList = [];

    if (Array.isArray(rawRecipients)) {
      recipientList = rawRecipients.map(function(item) {
        return String(item).trim();
      }).filter(function(item) {
        return item.length > 0 && item.indexOf('@') !== -1;
      });
    } else if (typeof rawRecipients === 'string' && rawRecipients.trim().length > 0) {
      recipientList = rawRecipients.split(',').map(function(item) {
        return item.trim();
      }).filter(function(item) {
        return item.length > 0 && item.indexOf('@') !== -1;
      });
    }

    if (recipientList.length === 0) {
      return createJsonResponse({
        success: false,
        error: 'Alamat e-mail tujuan (to) tidak valid atau kosong.'
      }, 400);
    }

    var recipientString = recipientList.join(',');

    // 5. Parameter Email
    var subject = payload.subject || '[QAS Logistics] Pemberitahuan Sistem';
    var htmlBody = payload.html || payload.htmlBody || '';
    var plainText = payload.text || payload.body || 'Silakan buka email ini menggunakan aplikasi yang mendukung format HTML.';
    var senderName = payload.senderName || 'QAS Motorcycle Logistics';

    // 6. Pemeriksaan Kuota Harian Google Mail
    var remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota < recipientList.length) {
      return createJsonResponse({
        success: false,
        error: 'Kuota harian pengiriman email Google Apps Script telah habis (Sisa kuota: ' + remainingQuota + ').',
        remainingQuota: remainingQuota
      }, 429);
    }

    // 7. Eksekusi Pengiriman Email: Mencoba GmailApp, jika dibatasi Workspace fallback ke MailApp
    var methodUsed = 'GmailApp';
    try {
      GmailApp.sendEmail(recipientString, subject, plainText, {
        name: senderName,
        htmlBody: htmlBody
      });
    } catch (gmailErr) {
      methodUsed = 'MailApp';
      MailApp.sendEmail({
        to: recipientString,
        subject: subject,
        name: senderName,
        body: plainText,
        htmlBody: htmlBody
      });
    }

    // 8. Respons Sukses
    return createJsonResponse({
      success: true,
      message: 'Email berhasil dikirimkan ke ' + recipientString + ' via ' + methodUsed,
      recipients: recipientList,
      method: methodUsed,
      remainingQuota: MailApp.getRemainingDailyQuota(),
      timestamp: new Date().toISOString()
    }, 200);

  } catch (error) {
    return createJsonResponse({
      success: false,
      error: 'Terjadi kesalahan pada skrip Google: ' + (error.message || String(error))
    }, 500);
  }
}

/**
 * Handle HTTP GET Request (Health Check)
 */
function doGet(e) {
  var remainingQuota = MailApp.getRemainingDailyQuota();
  return createJsonResponse({
    status: 'online',
    service: 'QAS Logistics Mailer Web App',
    remainingDailyQuota: remainingQuota,
    timestamp: new Date().toISOString()
  }, 200);
}

/**
 * Helper Output JSON ContentService
 */
function createJsonResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
