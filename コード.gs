const scriptProperties = PropertiesService.getScriptProperties();
const DIFY_API_BASE_URL = scriptProperties.getProperty('DIFY_API_BASE_URL');
const DIFY_AGENT_API_KEY = scriptProperties.getProperty('DIFY_AGENT_API_KEY');

function doGet() {
  console.log('doGet function called');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('COI Compass')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// データフォルダを取得する関数を追加
function getDataFolder() {
  var folders = DriveApp.getFoldersByName("COICompass_DATA");
  if (folders.hasNext()) {
    return folders.next();
  } else {
    throw new Error('フォルダ "COICompass_DATA" が見つかりませんでした。');
  }
}

function searchGoogleDrive(query) {
  console.log('Searching Google Drive for query:', query);
  var folderId = getDataFolder().getId();
  var files = DriveApp.searchFiles(`fullText contains "${query}" and "${folderId}" in parents`);
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

  // Difyの応答を整形して改行を追加
  var formattedResponse = formatResponse(difyResponse.answer || difyResponse.error || "応答がありませんでした。");

  console.log('Processed user message, Dify response:', formattedResponse);
  return {
    userMessage: message,
    difyResponse: formattedResponse,
    driveResults: driveResults
  };
}

function formatResponse(response) {
  if (!response) return "";

  // URLを検出してリンクに変換する正規表現
  var urlRegex = /(https?:\/\/[^\s]+)/g;

  // 許可されたドメインのリスト
  var allowedDomains = ['www.state.gov', 'www.amnesty.org'];

  // URLをリンクに変換する関数
  function replaceURLWithHTMLLinks(text) {
    return text.replace(urlRegex, function(url) {
      var domain = new URL(url).hostname;
      if (allowedDomains.includes(domain)) {
        return '<a href="' + url + '" target="_blank">' + url + '</a>';
      }
      return url; // 許可されていないドメインの場合はリンクにしない
    });
  }

  // 段落として改行を `<br><br>` で表現し、URLをリンクに変換
  var paragraphs = response.split('\n').map(function(paragraph) {
    return `<p>${replaceURLWithHTMLLinks(paragraph.trim())}</p>`;
  });

  return paragraphs.join('');
}

// グローバル変数として、`conversationId` を定義
var conversationId = null;  // 初期値は null とする
var userId = 'user123';     // 任意のユーザーIDを指定（ユーザーごとに変更可能）

// Dify APIにクエリを送信する関数
function queryDify(userMessage) {
  console.log('DIFY_API_BASE_URL:', DIFY_API_BASE_URL);
  console.log('DIFY_AGENT_API_KEY:', DIFY_AGENT_API_KEY);

  var apiUrl = DIFY_API_BASE_URL + '/chat-messages';
  console.log('Using Dify API URL:', apiUrl);

  // ペイロードをDifyの設定と一致させる
  var payload = {
    'inputs': {},
    'query': userMessage,                       // ユーザーからのメッセージ
    'user': userId || 'default_user',           // ユーザーIDを使用
    'conversation_id': conversationId || null,  // 前回の会話IDを使用
    'temperature': 0,                           // 温度設定
    'top_p': 1,                                 // トップP設定
    'max_tokens': 512                           // 最大トークン数
  };

  var options = {
    'method': 'post',
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DIFY_AGENT_API_KEY
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  console.log('Dify API request options:', JSON.stringify(options));

  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    console.log('Dify API response status:', response.getResponseCode());
    console.log('Dify API response headers:', JSON.stringify(response.getAllHeaders()));
    console.log('Dify API response content:', response.getContentText());

    var responseData = JSON.parse(response.getContentText());

    // レスポンスに `conversation_id` が含まれている場合は更新する
    if (responseData.conversation_id) {
      conversationId = responseData.conversation_id;
      console.log('Updated conversation_id:', conversationId);
    }

    return responseData;  // 正常な返り値を返す
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
    return { error: 'リクエストの処理中にエラーが発生しました: ' + e.message };  // エラー発生時の返り値
  }
}

function handleTopicDocument(topic) {
  console.log('Handling topic document:', topic);
  var result = getTopicDocumentContent(topic);
  return result;
}

function getTopicDocumentContent(topic) {
  var fileName = topic + '.pdf'; // ファイル名に'.pdf'を追加
  console.log('Searching for document:', fileName);
  var folder = getDataFolder();
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    if (file.getMimeType() === MimeType.PDF) {
      return {
        success: true,
        type: 'pdf',
        url: file.getDownloadUrl(),
        webViewLink: file.getUrl(),
        name: file.getName(),
        size: file.getSize(),
        lastUpdated: file.getLastUpdated().toLocaleString()
      };
    } else {
      // PDFでない場合の処理（既存のコードに合わせて）
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
    console.log("Searching for file:", fileName);
    var folder = getDataFolder();
    var files = folder.getFilesByName(fileName);
    
    if (!files.hasNext()) {
      console.log("No files found with the name:", fileName);
      return {
        success: false,
        message: `"${fileName}" というファイルが見つかりませんでした。`
      };
    }
    
    while (files.hasNext()) {
      var file = files.next();
      console.log("File found:", file.getName(), "MimeType:", file.getMimeType());
      
      if (file.getMimeType() === MimeType.PDF) {
        console.log("PDF file found, returning data");
        return {
          success: true,
          type: 'pdf',
          url: file.getDownloadUrl(),
          webViewLink: file.getUrl(),
          name: file.getName(),
          size: file.getSize(),
          lastUpdated: file.getLastUpdated().toLocaleString()
        };
      }
    }
    
    console.log("No PDF file found with the name:", fileName);
    return {
      success: false,
      message: `"${fileName}" というPDFファイルが見つかりませんでした。`
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
    // PDFファイルの内容を取得
    var pdfContent = file.getBlob().getDataAsString();

    // 簡単なテキスト抽出（完全ではありませんが、基本的なテキストは取得できます）
    var extractedText = pdfContent.replace(/\r\n/g, " ").replace(/\s+/g, " ").trim();

    // 抽出されたテキストが空か、意味のある内容がない場合
    if (extractedText.length < 100) {
      return "PDFの内容を正確に抽出できませんでした。PDFファイルを直接ご覧ください。";
    }

    return extractedText;
  } catch (error) {
    console.error('Error in extractTextFromPDF:', error);
    return "PDFからのテキスト抽出中にエラーが発生しました: " + error.toString();
  }
}

// グローバルスコープで関数を定義
function handleUserInput(country, message, conversationId, userId) {
  console.log('Handling user input:', { country, message, conversationId, userId });
  if (message.includes('/')) {
    return handleTopicDocument(message);
  }
  return processUserMessage(country, message, conversationId, userId);
}

function getBeforeInterviewContent() {
  try {
    const fileName = "面談の前に";
    console.log("Searching for file:", fileName);
    var folder = getDataFolder();
    var files = folder.getFilesByName(fileName);
    
    if (!files.hasNext()) {
      console.log("No files found with the name:", fileName);
      return {
        success: false,
        message: `"${fileName}" というファイルが見つかりませんでした。`
      };
    }
    
    while (files.hasNext()) {
      var file = files.next();
      console.log("File found:", file.getName(), "MimeType:", file.getMimeType());
      
      if (file.getMimeType() === MimeType.PDF) {
        console.log("PDF file found, returning data");
        return {
          success: true,
          type: 'pdf',
          url: file.getDownloadUrl(),
          webViewLink: file.getUrl(),
          name: file.getName(),
          size: file.getSize(),
          lastUpdated: file.getLastUpdated().toLocaleString()
        };
      }
    }
    
    console.log("No PDF file found with the name:", fileName);
    return {
      success: false,
      message: `"${fileName}" というPDFファイルが見つかりませんでした。`
    };
  } catch (error) {
    console.error('Error in getBeforeInterviewContent:', error);
    return {
      success: false,
      message: "エラーが発生しました: " + error.toString()
    };
  }
}

// 以下は元のコードにあった追加の関数です
function openGoogleDriveFolder(folderName) {
  var dataFolder = getDataFolder();
  var folders = dataFolder.getFoldersByName(folderName);
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