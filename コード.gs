const scriptProperties = PropertiesService.getScriptProperties();
const DIFY_API_BASE_URL = scriptProperties.getProperty('DIFY_API_BASE_URL');
const DIFY_AGENT_API_KEY = scriptProperties.getProperty('DIFY_AGENT_API_KEY');

function doGet() {
  console.log('doGet function called');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('COI Compass')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function searchGoogleDrive(query) {
  console.log('Searching Google Drive for query:', query);
  var files = DriveApp.searchFiles('fullText contains "' + query + '"');
  var results = [];
  while (files.hasNext()) {
    var file = files.next();
    results.push({
      name: file.getName(),
      id: file.getId(),
      url: file.getUrl(),
      snippet: getFileSnippet(file, query)
    });
  }
  console.log('Google Drive search results:', results.length);
  return results;
}

function getFileSnippet(file, query) {
  console.log('Getting snippet for file:', file.getName());
  var content = "";
  if (file.getMimeType() === MimeType.GOOGLE_DOCS) {
    var doc = DocumentApp.openById(file.getId());
    content = doc.getBody().getText();
  } else if (file.getMimeType() === MimeType.PDF) {
    return "PDFファイルです。内容の詳細はファイルを開いてご確認ください。";
  }
  var index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index !== -1) {
    var start = Math.max(0, index - 50);
    var end = Math.min(content.length, index + query.length + 50);
    return "..." + content.substring(start, end) + "...";
  }
  return "該当箇所が見つかりませんでした。";
}

function processUserMessage(country, message, conversationId, userId) {
  console.log('Processing user message:', { country, message, conversationId, userId });
  var difyResponse = queryDify(message, conversationId, userId);
  var driveResults = searchGoogleDrive(message);

  console.log('Processed user message, Dify response:', difyResponse);
  return {
    userMessage: message,
    difyResponse: difyResponse.answer || difyResponse.error || "応答がありませんでした。",
    driveResults: driveResults
  };
}

function queryDify(userMessage, conversationId, userId) {
  console.log('DIFY_API_BASE_URL:', DIFY_API_BASE_URL);
  console.log('DIFY_AGENT_API_KEY:', DIFY_AGENT_API_KEY);

  var apiUrl = DIFY_API_BASE_URL + '/chat-messages';
  console.log('Using Dify API URL:', apiUrl);

  var options = {
    'method': 'post',
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DIFY_AGENT_API_KEY
    },
    'payload': JSON.stringify({
      'inputs': {},
      'query': userMessage,
      'user': userId || 'default_user',
      'conversation_id': conversationId || null
    }),
    'muteHttpExceptions': true
  };
  console.log('Dify API request options:', JSON.stringify(options));
  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    console.log('Dify API response status:', response.getResponseCode());
    console.log('Dify API response headers:', JSON.stringify(response.getAllHeaders()));
    console.log('Dify API response content:', response.getContentText());

    return JSON.parse(response.getContentText());
  } catch (e) {
    console.error('Error in Dify API request:', e.toString());
    if (e.message) {
      console.error('Error message:', e.message);
    }
    if (e.response) {
      console.error('Error response code:', e.response.getResponseCode());
      console.error('Error response headers:', JSON.stringify(e.response.getAllHeaders()));
      console.error('Error response content:', e.response.getContentText());
    }
    return { error: 'リクエストの処理中にエラーが発生しました: ' + e.message };
  }
}

function handleUserInput(country, message, conversationId, userId) {
  console.log('Handling user input:', { country, message, conversationId, userId });
  if (message.includes('/')) {
    return handleTopicDocument(message);
  }
  return processUserMessage(country, message, conversationId, userId);
}

function handleTopicDocument(topic) {
  console.log('Handling topic document:', topic);
  var result = getTopicDocumentContent(topic);
  return result;
}

function getTopicDocumentContent(topic) {
  var fileName = topic.replace('/', ' - '); // 例: "Uganda/政治的発言" を "Uganda - 政治的発言" に変換
  console.log('Searching for document:', fileName);
  var files = DriveApp.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_DOCS) {
      var doc = DocumentApp.openById(file.getId());
      return {
        success: true,
        content: doc.getBody().getText(),
        message: `${fileName}の内容を取得しました。`
      };
    } else if (file.getMimeType() === MimeType.PLAIN_TEXT) {
      return {
        success: true,
        content: file.getBlob().getDataAsString(),
        message: `${fileName}の内容を取得しました。`
      };
    } else {
      return {
        success: false,
        message: "ファイルの形式がサポートされていません。"
      };
    }
  } else {
    return {
      success: false,
      message: `${fileName}が見つかりませんでした。`
    };
  }
}

function testAgentConversation() {
  console.log('Testing agent conversation');
  var response = queryDify("自己紹介して", null, "test_user");
  console.log('Test response:', JSON.stringify(response, null, 2));
  return response;
}

function setDifyApiConfig(apiBaseUrl, apiKey) {
  console.log('Setting Dify API config');
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('DIFY_API_BASE_URL', apiBaseUrl);
  scriptProperties.setProperty('DIFY_AGENT_API_KEY', apiKey);
  console.log('Dify API設定が更新されました。');
}

function getCOIConceptContent() {
  try {
    const fileName = "COIの考え方";
    var files = DriveApp.getFilesByName(fileName);
    
    while (files.hasNext()) {
      var file = files.next();
      if (file.getMimeType() === MimeType.PDF) {
        var pdfContent = extractTextFromPDF(file);
        return {
          success: true,
          type: 'pdf',
          url: file.getDownloadUrl(),
          webViewLink: file.getUrl(),
          name: file.getName(),
          content: pdfContent
        };
      }
    }

    return {
      success: false,
      message: "COIの考え方のPDFファイルが見つかりませんでした。"
    };
  } catch (error) {
    console.error('Error in getCOIConceptContent:', error);
    return {
      success: false,
      message: "エラーが発生しました: " + error.toString()
    };
  }
}


function extractTextFromPDF(file) {
  try {
    // PDFファイルをGoogle Docsに変換
    var blob = file.getBlob();
    var resource = {
      title: file.getName() + ' (Converted)',
      mimeType: MimeType.GOOGLE_DOCS
    };
    var docFile = Drive.Files.insert(resource, blob, {convert: true});
    
    // 変換されたドキュメントを開く
    var doc = DocumentApp.openById(docFile.id);
    var text = doc.getBody().getText();
    
    // 一時的に作成したGoogle Docsファイルを削除
    Drive.Files.remove(docFile.id);
    
    return text;
  } catch (error) {
    console.error('Error in extractTextFromPDF:', error);
    return "PDFからのテキスト抽出中にエラーが発生しました: " + error.toString();
  }
}

// 以下は元のコードにあった追加の関数です
function openGoogleDriveFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    var folder = folders.next();
    var folderUrl = folder.getUrl();
    return {
      success: true,
      url: folderUrl,
      message: `${folderName}フォルダを開きました。`
    };
  } else {
    return {
      success: false,
      message: `${folderName}フォルダが見つかりませんでした。`
    };
  }
}